// ---------------------------------------------------------------------------
// Optimizer Agent
// ---------------------------------------------------------------------------
// LLM-driven agent that:
//  1. Takes the Designer's initial plan
//  2. Orders problems by topic coverage ratio (lowest % first)
//  3. Optionally extends the timeframe to fit all problems comfortably
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import type { DesignerOutput } from "./designer";
import type { StudyPlanParams, UserCapacity } from "./analyst";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillEntry {
  tagName: string;
  tagSlug: string;
  problemsSolved: number;
}

export interface UserSkills {
  advanced: SkillEntry[];
  intermediate: SkillEntry[];
  fundamental: SkillEntry[];
}

export interface TopicCoverage {
  tagName: string;
  tagSlug: string;
  problemsSolved: number;
  totalProblems: number;
  ratio: number;
}

export interface OptimizedPlan extends DesignerOutput {
  optimizations: {
    skillBasedAdjustments?: string;
  };
}

export type OptimizerEvent =
  | { type: "log"; message: string }
  | { type: "content_delta"; text: string }
  | { type: "optimizer"; result: OptimizedPlan }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// OpenAI client (DashScope)
// ---------------------------------------------------------------------------

const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

// ---------------------------------------------------------------------------
// LeetCode API
// ---------------------------------------------------------------------------

async function fetchUserSkills(username: string): Promise<UserSkills> {
  const res = await fetch(
    `https://leetcode-api-pied.vercel.app/user/${username}/skills`,
  );
  if (!res.ok) throw new Error(`Skills fetch failed: ${res.status}`);
  return res.json();
}

interface TagEntry {
  tagName: string;
  tagSlug: string;
  questionCount: number;
}

async function fetchTags(): Promise<TagEntry[]> {
  const res = await fetch("https://leetcode-api-pied.vercel.app/tags");
  if (!res.ok) throw new Error(`Tags fetch failed: ${res.status}`);
  const data = await res.json();

  // Handle both { topics: [...] } and plain array responses
  const list: unknown[] = Array.isArray(data) ? data : data.topics ?? [];

  return list.map((t) => {
    const r = t as Record<string, unknown>;
    return {
      tagName: (r.tagName ?? r.name ?? "") as string,
      tagSlug: (r.tagSlug ?? r.slug ?? "") as string,
      questionCount: (r.questionCount ?? r.questions ?? r.count ?? 0) as number,
    };
  });
}

/** Compute coverage ratio per topic: problemsSolved / totalProblems.
 *  Ignores topics missing from the tags endpoint.  Sorted weakest first. */
function computeCoverage(
  skills: UserSkills,
  tags: TagEntry[],
): TopicCoverage[] {
  // Build slug → totalProblems map
  const totalMap = new Map<string, number>();
  for (const t of tags) {
    if (t.tagSlug) totalMap.set(t.tagSlug, t.questionCount);
  }

  // Flatten all three skill buckets
  const allSkills: SkillEntry[] = [
    ...skills.fundamental,
    ...skills.intermediate,
    ...skills.advanced,
  ];

  const result: TopicCoverage[] = [];
  for (const s of allSkills) {
    const total = totalMap.get(s.tagSlug);
    if (!total || total === 0) continue; // skip missing or zero-total topics
    result.push({
      tagName: s.tagName,
      tagSlug: s.tagSlug,
      problemsSolved: s.problemsSolved,
      totalProblems: total,
      ratio: s.problemsSolved / total,
    });
  }

  result.sort((a, b) => a.ratio - b.ratio);
  return result;
}

// ---------------------------------------------------------------------------
// Flatten: extract all { slug, priority, ... } items from the designer's plan
// ---------------------------------------------------------------------------

interface FlatItem {
  slug: string;
  priority: string;
  topics: string[];
  difficulty: string;
}

function flattenPlanProblems(output: DesignerOutput): FlatItem[] {
  const items: FlatItem[] = [];
  for (const day of output.plan) {
    for (const p of day.essential) {
      items.push({ slug: p.slug, priority: "essential", topics: p.topics, difficulty: p.difficulty });
    }
    for (const p of day.extra) {
      items.push({ slug: p.slug, priority: "extra", topics: p.topics, difficulty: p.difficulty });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function optimizeStudyPlan(
  designerOutput: DesignerOutput,
  studyInfo: StudyPlanParams,
  userCapacity: UserCapacity,
  username: string,
  send: (event: OptimizerEvent) => void,
): Promise<OptimizedPlan> {
  const allItems = flattenPlanProblems(designerOutput);

  // Fetch coverage and sort problems algorithmically (not LLM-driven)
  let coverage: TopicCoverage[] | null = null;
  let orderedItems = allItems;

  try {
    send({ type: "log", message: `Fetching skills & tags for ${username}...` });
    const [userSkills, tags] = await Promise.all([
      fetchUserSkills(username),
      fetchTags(),
    ]);
    coverage = computeCoverage(userSkills, tags);
    send({
      type: "log",
      message: `Topic coverage (weak→strong): ${coverage.map(c => `${c.tagName} ${Math.round(c.ratio * 100)}%`).join(", ")}`,
    });

    // Sort by weakest topic coverage ratio
    const covMap = new Map<string, number>();
    for (const c of coverage) covMap.set(c.tagName, c.ratio);
    orderedItems = [...allItems].sort((a, b) => {
      const aMin = Math.min(...a.topics.map((t) => covMap.get(t) ?? 1));
      const bMin = Math.min(...b.topics.map((t) => covMap.get(t) ?? 1));
      return aMin - bMin;
    });
    send({ type: "log", message: `${orderedItems.length} problems sorted by coverage.` });
  } catch (err) {
    send({ type: "log", message: `Coverage fetch skipped: ${err}` });
  }

  // LLM only writes the reasoning paragraph — ordering is already done
  const prompt = buildPrompt(designerOutput, studyInfo, userCapacity, coverage);

  const apiMessages = [
    {
      role: "system" as const,
      content: "You are Optimizer. Write a 1-2 sentence reasoning about why this ordering makes sense for this learner.",
    },
    { role: "user" as const, content: prompt },
  ];

  let contentBuffer = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completionStream = await (openai.chat.completions as any).create({
    model: "qwen3.7-plus-2026-05-26",
    messages: apiMessages,
    temperature: 0.2,
    stream: true,
    extra_body: { enable_thinking: true },
  });

  for await (const chunk of completionStream) {
    const delta = chunk.choices?.[0]?.delta;

    if (delta?.reasoning_content) {
      send({ type: "log", message: delta.reasoning_content });
    }

    if (delta?.content) {
      contentBuffer += delta.content;
      send({ type: "content_delta", text: delta.content });
    }
  }

  const optimizedPlan = parseAndRebuild(contentBuffer, designerOutput, studyInfo, orderedItems);
  send({ type: "optimizer", result: optimizedPlan });
  return optimizedPlan;
}

// ---------------------------------------------------------------------------
// Prompt: compact — no full schedule, just problem list + skills
// ---------------------------------------------------------------------------

function buildPrompt(
  designerOutput: DesignerOutput,
  studyInfo: StudyPlanParams,
  userCapacity: UserCapacity,
  coverage: TopicCoverage[] | null,
): string {
  const { summary } = designerOutput;

  let skillsSection = "";
  if (coverage) {
    const lines = coverage.map(
      (c) => `${c.tagName} (${c.problemsSolved}/${c.totalProblems} = ${Math.round(c.ratio * 100)}%)`,
    );
    skillsSection = `
=== TOPIC COVERAGE (weak → strong) ===
${lines.join("\n")}`;
  }

  // Problems have been algorithmically sorted by weakest topic coverage.
  // The LLM's only job is to write a brief reasoning paragraph.
  return `=== PLAN ===
${summary.totalProblems} problems (${summary.essentialCount} essential, ${summary.extraCount} extra)
${summary.totalDays} days, ${studyInfo.hoursPerDay}h/day, ${summary.totalHours}h essentials
Timeframe: ${studyInfo.timeFrameDays}d
${skillsSection}

=== TASK ===
Write 1-2 sentences explaining why this ordering (weak topics first) is good for the learner.
Output ONLY the reasoning text — no JSON, no code blocks.`;
}

// ---------------------------------------------------------------------------
// Parse LLM output + mechanically rebuild the plan
// ---------------------------------------------------------------------------

function parseAndRebuild(
  content: string,
  originalOutput: DesignerOutput,
  studyInfo: StudyPlanParams,
  orderedItems: FlatItem[],
): OptimizedPlan {
  // Use LLM output as plain reasoning text
  const reasoning = content.replace(/```[\s\S]*?```/g, "").trim() || undefined;

  // Build slug → full problem lookup
  const problemMap = new Map<string, { problem: ProblemObj; priority: string }>();
  for (const day of originalOutput.plan) {
    for (const p of day.essential) {
      problemMap.set(p.slug, { problem: p as unknown as ProblemObj, priority: "essential" });
    }
    for (const p of day.extra) {
      problemMap.set(p.slug, { problem: p as unknown as ProblemObj, priority: "extra" });
    }
  }

  // Map ordered slugs to full problem objects
  const ordered = orderedItems
    .map((item) => problemMap.get(item.slug))
    .filter(Boolean) as { problem: ProblemObj; priority: string }[];

  // Reuse Designer's dates AND dayOfWeek — no recomputation
  const dateToDay: Record<string, string> = {};
  for (const d of originalOutput.plan) {
    dateToDay[d.date] = d.dayOfWeek;
  }
  const dates = originalOutput.plan.map((d) => d.date);

  // Mechanical redistribution — respects hoursPerDay, extends plan if needed
  const plan = redistribute(ordered, dates, dateToDay, studyInfo.studyDays, studyInfo.hoursPerDay);

  const essentialCount = plan.reduce((s, d) => s + d.essential.length, 0);
  const extraCount = plan.reduce((s, d) => s + d.extra.length, 0);
  const totalHours = plan.reduce(
    (s, d) => s + d.essential.reduce((t, p) => t + p.timeHours, 0),
    0,
  );

  // Note if the plan was extended beyond the original date range
  const originalDays = dates.length;
  const extendedBy = plan.length - originalDays;
  let finalReasoning = reasoning;
  if (extendedBy > 0) {
    const note = ` Plan extended by ${extendedBy} day${extendedBy > 1 ? "s" : ""} (${originalDays} → ${plan.length}) to fit all problems within ${studyInfo.hoursPerDay}h/day.`;
    finalReasoning = reasoning ? reasoning + note : note.trim();
  }

  return {
    plan: plan as unknown as DesignerOutput["plan"],
    summary: {
      totalProblems: essentialCount + extraCount,
      essentialCount,
      extraCount,
      totalDays: plan.length,
      totalHours: Math.round(totalHours * 10) / 10,
    },
    rationale: originalOutput.rationale,
    optimizations: {
      skillBasedAdjustments: finalReasoning,
    },
  };
}

// ---------------------------------------------------------------------------
// Greedy redistribution
// ---------------------------------------------------------------------------

type Priority = "essential" | "extra";
type ProblemObj = { slug: string; difficulty: string; topics: string[]; url: string; title: string; timeHours: number; priority: Priority };

const MAX_EXTRAS_PER_DAY = 2;

function redistribute(
  problems: { problem: ProblemObj; priority: string }[],
  dates: string[],
  dateToDay: Record<string, string>,
  studyDays: number[],
  hoursPerDay: number,
) {
  type DayPlan = {
    date: string;
    dayOfWeek: string;
    essential: ProblemObj[];
    extra: ProblemObj[];
  };

  let days: DayPlan[] = dates.map((d) => ({
    date: d,
    dayOfWeek: dateToDay[d] ?? "",
    essential: [],
    extra: [],
  }));
  const dayHours: number[] = new Array(days.length).fill(0);
  const dayExtras: number[] = new Array(days.length).fill(0);

  const extras: { problem: ProblemObj; priority: string }[] = [];

  // Phase 1: distribute essential problems (greedy bin-packing, capped at hoursPerDay)
  for (const item of problems) {
    if (item.problem.priority === "essential" || item.priority === "essential") {
      // Find the lightest day that can fit this problem within hoursPerDay
      let best = -1;
      let bestHours = Infinity;
      for (let i = 0; i < days.length; i++) {
        if (dayHours[i] + item.problem.timeHours <= hoursPerDay && dayHours[i] < bestHours) {
          bestHours = dayHours[i];
          best = i;
        }
      }

      if (best === -1) {
        // All days would exceed hoursPerDay — extend the plan
        const newDate = extendByOneDay(days, dateToDay, studyDays);
        days.push({
          date: newDate.date,
          dayOfWeek: newDate.dayOfWeek,
          essential: [],
          extra: [],
        });
        dayHours.push(0);
        dayExtras.push(0);
        best = days.length - 1;
      }

      days[best].essential.push({ ...item.problem, priority: "essential" as Priority });
      dayHours[best] += item.problem.timeHours;
    } else {
      extras.push(item);
    }
  }

  // Phase 2: distribute extra problems (round-robin, max 2/day, also capped at hoursPerDay)
  let extraIdx = 0;
  for (const item of extras) {
    let placed = false;
    for (let attempt = 0; attempt < days.length && !placed; attempt++) {
      const i = (extraIdx + attempt) % days.length;
      if (dayExtras[i] < MAX_EXTRAS_PER_DAY && dayHours[i] + item.problem.timeHours <= hoursPerDay) {
        days[i].extra.push({ ...item.problem, priority: "extra" as Priority });
        dayExtras[i]++;
        dayHours[i] += item.problem.timeHours;
        extraIdx = i + 1;
        placed = true;
      }
    }

    // If no existing day can take it, extend
    if (!placed) {
      const newDate = extendByOneDay(days, dateToDay, studyDays);
      days.push({
        date: newDate.date,
        dayOfWeek: newDate.dayOfWeek,
        essential: [],
        extra: [{ ...item.problem, priority: "extra" as Priority }],
      });
      dayHours.push(item.problem.timeHours);
      dayExtras.push(1);
      dateToDay[newDate.date] = newDate.dayOfWeek;
      extraIdx = days.length;
    }
  }

  // Filter empty days at the end
  while (days.length > 0) {
    const last = days[days.length - 1];
    if (last.essential.length === 0 && last.extra.length === 0) {
      days.pop();
    } else {
      break;
    }
  }

  return days;
}

/** Generate one extra study day after the last existing date */
function extendByOneDay(
  days: { date: string; dayOfWeek: string }[],
  dateToDay: Record<string, string>,
  studyDays: number[],
): { date: string; dayOfWeek: string } {
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const daySet = new Set(studyDays);
  const lastDate = new Date(days[days.length - 1].date + "T00:00:00");
  let cursor = 1;
  while (true) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + cursor);
    cursor++;
    if (daySet.has(d.getDay())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const ds = `${y}-${m}-${day}`;
      dateToDay[ds] = DAYS[d.getDay()];
      return { date: ds, dayOfWeek: DAYS[d.getDay()] };
    }
  }
}