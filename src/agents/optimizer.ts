// ---------------------------------------------------------------------------
// Optimizer Agent
// ---------------------------------------------------------------------------
// LLM-driven agent that:
//  1. Takes the Designer's initial plan
//  2. Orders problems by skill weakness (weakest first)
//  3. Optionally extends the timeframe to fit all problems comfortably
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import type { DesignerOutput } from "./designer";
import type { StudyPlanParams, UserCapacity } from "./analyst";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserSkills {
  advanced: { tagName: string; tagSlug: string; problemsSolved: number }[];
  intermediate: { tagName: string; tagSlug: string; problemsSolved: number }[];
  fundamental: { tagName: string; tagSlug: string; problemsSolved: number }[];
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
  send({ type: "log", message: `Fetching user skills for ${username}...` });
  let userSkills: UserSkills | null = null;
  try {
    userSkills = await fetchUserSkills(username);
    send({
      type: "log",
      message: `Found skills: ${userSkills.fundamental.length} fundamental, ${userSkills.intermediate.length} intermediate, ${userSkills.advanced.length} advanced`,
    });
  } catch (err) {
    send({ type: "log", message: `Skills fetch skipped: ${err}` });
  }

  const prompt = buildPrompt(designerOutput, studyInfo, userCapacity, userSkills);

  const apiMessages = [
    {
      role: "system" as const,
      content: "You are Optimizer. Reorder problems so weakest topics come first.",
    },
    { role: "user" as const, content: prompt },
  ];

  let contentBuffer = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completionStream = await (openai.chat.completions as any).create({
    model: "qwen3.5-plus-2026-04-20",
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

  const optimizedPlan = parseAndRebuild(contentBuffer, designerOutput, studyInfo);
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
  userSkills: UserSkills | null,
): string {
  const { plan, summary } = designerOutput;

  // Flat problem list: slug + difficulty + topics + priority
  const problems: { slug: string; d: string; t: string[]; p: string }[] = [];
  for (const day of plan) {
    for (const p of day.essential) {
      problems.push({ slug: p.slug, d: p.difficulty[0], t: p.topics, p: "essential" });
    }
    for (const p of day.extra) {
      problems.push({ slug: p.slug, d: p.difficulty[0], t: p.topics, p: "extra" });
    }
  }

  const planTopics = new Set<string>();
  for (const p of problems) {
    for (const t of p.t) planTopics.add(t);
  }

  let skillsSection = "";
  if (userSkills) {
    const mapTag = (t: { tagName: string }) => t.tagName;
    skillsSection = `
=== USER SKILLS ===
Weakest: ${userSkills.fundamental.map(mapTag).join(", ") || "none"}
Weaker: ${userSkills.intermediate.map(mapTag).join(", ") || "none"}
Strong: ${userSkills.advanced.map(mapTag).join(", ") || "none"}`;
  }

  return `=== PLAN ===
${summary.totalProblems} problems (${summary.essentialCount} essential, ${summary.extraCount} extra)
${summary.totalDays} days, ${studyInfo.hoursPerDay}h/day, ${summary.totalHours}h essentials
Timeframe: ${studyInfo.timeFrameDays}d, extendable
${skillsSection}

=== PROBLEMS (${problems.length}) ===
${JSON.stringify(problems)}

=== TASK ===
Output a JSON array of problem slugs in order: weakest topics first, then weaker, strong last.
You may also extend the timeframe if needed (extendDays).
{"extendDays": N, "order": ["slug1","slug2",...], "reasoning": "..."}`;
}

// ---------------------------------------------------------------------------
// Parse LLM output + mechanically rebuild the plan
// ---------------------------------------------------------------------------

function parseAndRebuild(
  content: string,
  originalOutput: DesignerOutput,
  studyInfo: StudyPlanParams,
): OptimizedPlan {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { ...originalOutput, optimizations: {} };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const order: string[] = parsed.order || [];
    const extendDays: number = parsed.extendDays || 0;
    const reasoning: string = parsed.reasoning || "";

    if (!order.length) {
      return { ...originalOutput, optimizations: {} };
    }

    // Build slug → full problem lookup
    const problemMap = new Map<string, { problem: typeof originalOutput.plan[0]["essential"][0]; priority: string }>();
    for (const day of originalOutput.plan) {
      for (const p of day.essential) {
        problemMap.set(p.slug, { problem: p, priority: "essential" });
      }
      for (const p of day.extra) {
        problemMap.set(p.slug, { problem: p, priority: "extra" });
      }
    }

    // Ordered list of full problems
    const ordered = order
      .map((slug) => problemMap.get(slug))
      .filter(Boolean) as { problem: typeof originalOutput.plan[0]["essential"][0]; priority: string }[];

    // Reuse Designer's dates AND dayOfWeek — no recomputation
    const dateToDay: Record<string, string> = {};
    for (const d of originalOutput.plan) {
      dateToDay[d.date] = d.dayOfWeek;
    }
    const dates = originalOutput.plan.map((d) => d.date);

    // Extend if needed: append extra study days after the last date
    if (extendDays > 0) {
      const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");
      const daySet = new Set(studyInfo.studyDays);
      let added = 0;
      let cursor = 1;
      while (added < extendDays) {
        const d = new Date(lastDate);
        d.setDate(d.getDate() + cursor);
        cursor++;
        if (daySet.has(d.getDay())) {
          const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const ds = `${y}-${m}-${day}`;
          dates.push(ds);
          dateToDay[ds] = DAYS[d.getDay()];
          added++;
        }
      }
    }

    // Mechanical redistribution
    const plan = redistribute(ordered, dates, dateToDay, studyInfo.studyDays);

    const essentialCount = plan.reduce((s, d) => s + d.essential.length, 0);
    const extraCount = plan.reduce((s, d) => s + d.extra.length, 0);
    const totalHours = plan.reduce(
      (s, d) => s + d.essential.reduce((t, p) => t + p.timeHours, 0),
      0,
    );

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
        skillBasedAdjustments: reasoning || undefined,
      },
    };
  } catch (err) {
    console.warn("Optimizer: parse failed, using original plan:", err);
    return { ...originalOutput, optimizations: {} };
  }
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
) {
  type DayPlan = {
    date: string;
    dayOfWeek: string;
    essential: ProblemObj[];
    extra: ProblemObj[];
  };

  const days: DayPlan[] = dates.map((d) => ({
    date: d,
    dayOfWeek: dateToDay[d] ?? "",
    essential: [],
    extra: [],
  }));
  const dayHours = new Array(days.length).fill(0);
  const dayExtras = new Array(days.length).fill(0);

  const extras: { problem: ProblemObj; priority: string }[] = [];

  // Phase 1: distribute essential problems (greedy bin-packing by hours)
  for (const item of problems) {
    if (item.problem.priority === "essential" || item.priority === "essential") {
      let best = 0;
      let bestHours = dayHours[0];
      for (let i = 0; i < days.length; i++) {
        if (dayHours[i] < bestHours) { bestHours = dayHours[i]; best = i; }
      }
      days[best].essential.push({ ...item.problem, priority: "essential" as Priority });
      dayHours[best] += item.problem.timeHours;
    } else {
      extras.push(item);
    }
  }

  // Phase 2: distribute extra problems (round-robin, max 2/day)
  let extraIdx = 0;
  for (const item of extras) {
    // Try to find a day under the cap
    let placed = false;
    for (let attempt = 0; attempt < days.length && !placed; attempt++) {
      const i = (extraIdx + attempt) % days.length;
      if (dayExtras[i] < MAX_EXTRAS_PER_DAY) {
        days[i].extra.push({ ...item.problem, priority: "extra" as Priority });
        dayExtras[i]++;
        extraIdx = i + 1; // continue from next day
        placed = true;
      }
    }

    // If all days are at cap, extend by one day and place there
    if (!placed) {
      const newDate = extendByOneDay(days, dateToDay, studyDays);
      days.push({
        date: newDate.date,
        dayOfWeek: newDate.dayOfWeek,
        essential: [],
        extra: [{ ...item.problem, priority: "extra" as Priority }],
      });
      dayHours.push(0);
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