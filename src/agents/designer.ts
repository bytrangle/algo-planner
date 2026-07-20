import OpenAI from "openai";
import type { StudyPlanParams, UserCapacity } from "./analyst";
import type { ProblemWithTopic } from "../utils/flatten-problems";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ProblemWithTopic } from "../utils/flatten-problems";

export interface ParsedStudyInfo extends StudyPlanParams {
  userCapacity?: UserCapacity;
  username?: string;
}

export type Priority = "essential" | "extra";

export interface PrioritizedProblem extends ProblemWithTopic {
  priority: Priority;
  /** Hours needed to solve this problem, based on difficulty. */
  timeHours: number;
}

export interface DayPlan {
  /** ISO date string, e.g. "2026-07-21". */
  date: string;
  dayOfWeek: string;
  essential: PrioritizedProblem[];
  extra: PrioritizedProblem[];
}

export interface DesignerOutput {
  plan: DayPlan[];
  summary: {
    totalProblems: number;
    essentialCount: number;
    extraCount: number;
    totalDays: number;
    totalHours: number;
  };
  /** LLM's rationale for the distribution decisions. */
  rationale: string;
}

export interface SubmitStats {
  total: number;
  easy: number;
  medium: number;
  hard: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIFFICULTY_HOURS: Record<string, number> = {
  Easy: 0.5,
  Medium: 1.0,
  Hard: 1.5,
};

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

// ---------------------------------------------------------------------------
// LeetCode API
// ---------------------------------------------------------------------------

async function fetchSubmitStats(username: string): Promise<SubmitStats> {
  const res = await fetch(
    `https://leetcode-api-pied.vercel.app/user/${username}`,
  );
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  const data = await res.json();
  const stats = data.submitStats?.acSubmissionNum as Array<{
    difficulty: string;
    count: number;
  }>;
  if (!stats) throw new Error("Missing submitStats in profile response");

  const byDifficulty: Record<string, number> = {};
  for (const s of stats) {
    byDifficulty[s.difficulty.toLowerCase()] = s.count;
  }
  return {
    total: byDifficulty.all ?? 0,
    easy: byDifficulty.easy ?? 0,
    medium: byDifficulty.medium ?? 0,
    hard: byDifficulty.hard ?? 0,
  };
}

// ---------------------------------------------------------------------------
// LLM tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "fetchSubmitStats",
      description:
        "Fetch the user's accepted submission breakdown by difficulty from LeetCode. " +
        "Returns { total, easy, medium, hard } counts. Use this to determine the " +
        "learner's level and decide the difficulty composition of the study plan.",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "LeetCode username",
          },
        },
        required: ["username"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Types for event streaming
// ---------------------------------------------------------------------------

export type DesignerEvent =
  | { type: "log"; message: string }
  | { type: "content_delta"; text: string }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// 1. Filter: keep unsolved + solved > 6 months ago
// ---------------------------------------------------------------------------

export function filterProblems(
  problems: (ProblemWithTopic & { lastSolvedAt?: string })[],
): ProblemWithTopic[] {
  const cutoff = Date.now() - SIX_MONTHS_MS;

  return problems.filter((p) => {
    if (!p.lastSolvedAt) return true;
    const solvedMs = Number(p.lastSolvedAt) * 1000;
    return solvedMs < cutoff;
  });
}

// ---------------------------------------------------------------------------
// 2. Generate study dates
// ---------------------------------------------------------------------------

function generateStudyDates(
  studyDays: number[],
  timeFrameDays: number,
): Date[] {
  const daySet = new Set(studyDays);
  const dates: Date[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let daysUntilMonday = (8 - today.getDay()) % 7;
  // If today is Monday, start next Monday (not today)
  if (daysUntilMonday === 0) daysUntilMonday = 7;
  const start = new Date(today);
  start.setDate(start.getDate() + daysUntilMonday);

  for (let i = 0; i < timeFrameDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (daySet.has(d.getDay())) {
      dates.push(d);
    }
  }

  return dates;
}

// ---------------------------------------------------------------------------
// 3. Distribute problems across study days
// ---------------------------------------------------------------------------

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Distribute problems according to LLM-determined difficulty ratios.
 *
 * @param problems   All prioritized problems with time estimates
 * @param studyDates Calendar days the learner will study
 * @param hoursPerDay Max hours for essential problems per day
 * @param ratios     { easy, medium, hard } proportions (must sum to ~1.0)
 */
function distribute(
  problems: PrioritizedProblem[],
  studyDates: Date[],
  hoursPerDay: number,
  ratios: { easy: number; medium: number; hard: number },
): DayPlan[] {
  if (studyDates.length === 0) return [];

  // Separate by difficulty
  const easyPool = problems.filter((p) => p.difficulty === "Easy");
  const mediumPool = problems.filter((p) => p.difficulty === "Medium");
  const hardPool = problems.filter((p) => p.difficulty === "Hard");

  const total = problems.length;
  const targetEasy = Math.round(total * ratios.easy);
  const targetMedium = Math.round(total * ratios.medium);
  const targetHard = total - targetEasy - targetMedium;

  // Select problems up to target counts, capped by availability
  const selectedEasy = easyPool.slice(0, Math.min(targetEasy, easyPool.length));
  const selectedMedium = mediumPool.slice(0, Math.min(targetMedium, mediumPool.length));
  const selectedHard = hardPool.slice(0, Math.min(targetHard, hardPool.length));

  // Combine: essential first, then extra; harder problems first for packing
  const diffOrder = { Hard: 3, Medium: 2, Easy: 1 };
  const pool = [...selectedEasy, ...selectedMedium, ...selectedHard].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "essential" ? -1 : 1;
    return (diffOrder[b.difficulty] ?? 0) - (diffOrder[a.difficulty] ?? 0);
  });

  const plan: DayPlan[] = studyDates.map((d) => ({
    date: formatDate(d),
    dayOfWeek: DAY_NAMES[d.getDay()],
    essential: [],
    extra: [],
  }));

  const dayTime = new Array(plan.length).fill(0);

  // Greedy: assign each problem to the lightest day
  for (const p of pool) {
    let best = 0;
    for (let i = 1; i < dayTime.length; i++) {
      if (dayTime[i] < dayTime[best]) best = i;
    }
    if (p.priority === "essential") {
      plan[best].essential.push(p);
    } else {
      plan[best].extra.push(p);
    }
    dayTime[best] += p.timeHours;
  }

  // Overflow: move excess essentials → extra
  for (const day of plan) {
    while (
      day.essential.reduce((s, p) => s + p.timeHours, 0) > hoursPerDay &&
      day.essential.length > 0
    ) {
      day.extra.unshift(day.essential.pop()!);
    }
  }

  return plan;
}

// ---------------------------------------------------------------------------
// 4. LLM-driven decision: level assessment + difficulty ratios + priorities
// ---------------------------------------------------------------------------

interface LLMDecision {
  /** Human-readable assessment of the learner. */
  learnerAssessment: string;
  /** Target difficulty distribution (should sum to ~1.0). */
  ratios: { easy: number; medium: number; hard: number };
  /** Ratio rationale. */
  ratioRationale: string;
  /** Which topics are considered "core" — problems from these get priority. */
  coreTopics: string[];
  /** Max fraction of problems to mark essential (prevents overload). */
  essentialRatio: number;
  /** Priority rationale. */
  priorityRationale: string;
}

async function decideDistribution(
  problems: ProblemWithTopic[],
  studyInfo: ParsedStudyInfo,
  send: (event: DesignerEvent) => void,
): Promise<LLMDecision> {
  const username = studyInfo.username ?? "unknown";

  // Build a compact summary of available problems
  const diffCounts = { Easy: 0, Medium: 0, Hard: 0 };
  const topicSet = new Set<string>();
  for (const p of problems) {
    diffCounts[p.difficulty as keyof typeof diffCounts] =
      (diffCounts[p.difficulty as keyof typeof diffCounts] ?? 0) + 1;
    for (const t of p.topics) topicSet.add(t);
  }

  const prompt = `You are Designer, a study-plan agent. Your job is to decide the difficulty
composition and priority rules for a personalised algorithm study plan.

=== LEARNER CONTEXT ===
Username: ${username}
Timeframe: ${studyInfo.timeFrameDays} days
Hours/day: ${studyInfo.hoursPerDay}
Study days: [${studyInfo.studyDays?.join(", ") ?? "1,2,3,4,5"}] (0=Sun, 6=Sat)
Weekly velocity: ${(studyInfo.userCapacity?.weeklyVelocity ?? 0).toFixed(1)} probs/week
Aggressive timeline: ${studyInfo.userCapacity?.isAggressiveTimeline ?? false ? "Yes" : "No"}

=== AVAILABLE PROBLEM POOL ===
Total: ${problems.length} problems
Easy: ${diffCounts.Easy}, Medium: ${diffCounts.Medium}, Hard: ${diffCounts.Hard}
Topics: ${[...topicSet].join(", ")}

=== YOUR TASK ===
1. Call fetchSubmitStats("${username}") to get the learner's actual solved-problem
   breakdown (Easy/Medium/Hard counts).

2. Based on the stats + problem pool, determine:
   - Learner assessment: what level are they? How should they be challenged?
   - Difficulty ratios: what % Easy/Medium/Hard should the plan target?
     (e.g. a beginner: ~60% Easy, ~35% Medium, ~5% Hard)
     (intermediate: ~20% Easy, ~55% Medium, ~25% Hard)
     (advanced: ~10% Easy, ~50% Medium, ~40% Hard)
     Learners should practice slightly above their comfort zone.
   - Core topics: which topics are foundational and should be prioritised?
   - Essential ratio: what fraction of problems should be "essential" (must-do)?

=== OUTPUT FORMAT ===
Return ONLY valid JSON — no markdown, no extra text:

{
  "learnerAssessment": "string describing the learner's level and challenge zone",
  "ratios": { "easy": 0.20, "medium": 0.55, "hard": 0.25 },
  "ratioRationale": "why these ratios were chosen given the stats",
  "coreTopics": ["Array", "String", "..."],
  "essentialRatio": 0.60,
  "priorityRationale": "why these topics are core and this essential ratio works"
}`;

  const apiMessages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: unknown;
    tool_call_id?: string;
  }> = [
    {
      role: "system",
      content:
        "You are Designer, an agent that decides study-plan difficulty composition. " +
        "You have ONE tool: fetchSubmitStats. Call it, analyse the result, then " +
        "output a JSON with your decisions about difficulty ratios, core topics, " +
        "and essential problem ratio.",
    },
    { role: "user", content: prompt },
  ];

  let contentBuffer = "";
  const toolCalls = new Map<number, { name: string; arguments: string }>();
  let submitStats: SubmitStats | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await (openai.chat.completions as any).create({
    model: "qwen3.7-plus-2026-05-26",
    messages: apiMessages,
    tools: TOOLS,
    temperature: 0.2,
    stream: true,
    extra_body: { enable_thinking: true },
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    const finishReason = chunk.choices?.[0]?.finish_reason;

    if (delta?.reasoning_content) {
      send({ type: "log", message: delta.reasoning_content });
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCalls.has(idx)) {
          toolCalls.set(idx, { name: tc.function?.name ?? "", arguments: "" });
        }
        if (tc.function?.arguments) {
          toolCalls.get(idx)!.arguments += tc.function.arguments;
        }
      }
    }

    if (delta?.content) {
      contentBuffer += delta.content;
      send({ type: "content_delta", text: delta.content });
    }

    if (finishReason === "tool_calls") {
      const results: { id: string; result: unknown }[] = [];

      for (const [idx, tc] of toolCalls) {
        if (tc.name === "fetchSubmitStats") {
          try {
            const args = JSON.parse(tc.arguments);
            send({ type: "log", message: `Fetching submission stats for ${args.username}…` });
            submitStats = await fetchSubmitStats(args.username);
            results.push({ id: `call_${idx}`, result: submitStats });
            send({
              type: "log",
              message: `Solved: ${submitStats.total} total — Easy ${submitStats.easy}, Medium ${submitStats.medium}, Hard ${submitStats.hard}`,
            });
          } catch (err) {
            send({ type: "error", message: `Stats fetch failed: ${err}` });
            results.push({ id: `call_${idx}`, result: { error: String(err) } });
          }
        }
      }

      // Continue with tool results
      apiMessages.push({
        role: "assistant",
        content: contentBuffer,
        tool_calls: Array.from(toolCalls.entries()).map(([idx, tc]) => ({
          id: `call_${idx}`,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
      for (const r of results) {
        apiMessages.push({
          role: "tool",
          tool_call_id: r.id,
          content: JSON.stringify(r.result),
        });
      }

      contentBuffer = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream2 = await (openai.chat.completions as any).create({
        model: "qwen3.5-plus",
        messages: apiMessages,
        temperature: 0.2,
        stream: true,
        extra_body: { enable_thinking: true },
      });

      for await (const chunk2 of stream2) {
        const d2 = chunk2.choices?.[0]?.delta;
        if (d2?.reasoning_content) {
          send({ type: "log", message: d2.reasoning_content });
        }
        if (d2?.content) {
          contentBuffer += d2.content;
          send({ type: "content_delta", text: d2.content });
        }
      }
    }
  }

  // Parse LLM's JSON decision
  const jsonStr = contentBuffer.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();

  try {
    const parsed = JSON.parse(jsonStr) as LLMDecision;
    return {
      learnerAssessment: parsed.learnerAssessment ?? "Assessment not provided",
      ratios: {
        easy: parsed.ratios?.easy ?? 0.33,
        medium: parsed.ratios?.medium ?? 0.34,
        hard: parsed.ratios?.hard ?? 0.33,
      },
      ratioRationale: parsed.ratioRationale ?? "Default distribution applied",
      coreTopics: parsed.coreTopics ?? [],
      essentialRatio: parsed.essentialRatio ?? 0.6,
      priorityRationale: parsed.priorityRationale ?? "Default priority rules applied",
    };
  } catch {
    send({ type: "error", message: "Failed to parse LLM decision, using defaults" });
    return {
      learnerAssessment: "Could not assess (parse error)",
      ratios: { easy: 0.33, medium: 0.34, hard: 0.33 },
      ratioRationale: "Default even distribution (fallback)",
      coreTopics: [],
      essentialRatio: 0.6,
      priorityRationale: "Default (fallback)",
    };
  }
}

// ---------------------------------------------------------------------------
// 5. Priority assignment (algorithmic, informed by LLM's coreTopics decision)
// ---------------------------------------------------------------------------

function assignPriorities(
  problems: ProblemWithTopic[],
  coreTopics: string[],
  essentialRatio: number,
  ratios: { easy: number; medium: number; hard: number },
  send: (event: DesignerEvent) => void,
): Record<string, Priority> {
  const coreSet = new Set(coreTopics);
  const priorities: Record<string, Priority> = {};
  const maxEssential = Math.floor(problems.length * essentialRatio);

  // Allocate essential slots per difficulty, following the LLM's ratios.
  // The dominant difficulty gets the most essential slots — that is the
  // learner's challenge zone.
  let easySlots = Math.round(maxEssential * ratios.easy);
  let mediumSlots = Math.round(maxEssential * ratios.medium);
  let hardSlots = Math.round(maxEssential * ratios.hard);

  // Fix rounding so total matches maxEssential
  const diff = maxEssential - (easySlots + mediumSlots + hardSlots);
  // Add remainder to the dominant difficulty
  if (ratios.medium >= ratios.easy && ratios.medium >= ratios.hard) mediumSlots += diff;
  else if (ratios.hard >= ratios.easy && ratios.hard >= ratios.medium) hardSlots += diff;
  else easySlots += diff;

  // Helper: fill slots for a given difficulty, core topics first
  function fillSlots(
    difficulty: string,
    slots: number,
  ): number {
    let done = 0;
    if (slots <= 0) return 0;

    // Pass A: core topics first
    for (const p of problems) {
      if (done >= slots) break;
      if (p.difficulty !== difficulty || priorities[p.slug]) continue;
      const isCore = coreSet.size === 0 || p.topics.some((t) => coreSet.has(t));
      if (isCore) {
        priorities[p.slug] = "essential";
        done++;
      }
    }

    // Pass B: remaining problems of this difficulty
    for (const p of problems) {
      if (done >= slots) break;
      if (p.difficulty !== difficulty || priorities[p.slug]) continue;
      priorities[p.slug] = "essential";
      done++;
    }

    return done;
  }

  // Fill in order of the learner's challenge zone (dominant difficulty first)
  const order: { diff: string; slots: number }[] = [
    { diff: "Easy", slots: easySlots },
    { diff: "Medium", slots: mediumSlots },
    { diff: "Hard", slots: hardSlots },
  ].sort((a, b) => b.slots - a.slots);

  const doneMap: Record<string, number> = {};
  for (const o of order) {
    doneMap[o.diff] = fillSlots(o.diff, o.slots);
  }

  const easyDone = doneMap["Easy"] ?? 0;
  const mediumDone = doneMap["Medium"] ?? 0;
  const hardDone = doneMap["Hard"] ?? 0;
  const essentialCount = easyDone + mediumDone + hardDone;

  // Everything else is extra
  for (const p of problems) {
    if (!priorities[p.slug]) priorities[p.slug] = "extra";
  }

  send({
    type: "log",
    message: `${essentialCount} essential / ${problems.length - essentialCount} extra ` +
      `(Easy ${easyDone}/${easySlots}, Medium ${mediumDone}/${mediumSlots}, Hard ${hardDone}/${hardSlots})`,
  });

  return priorities;
}

// ---------------------------------------------------------------------------
// 6. Main entry point
// ---------------------------------------------------------------------------

export async function designStudyPlan(
  problems: ProblemWithTopic[],
  studyInfo: ParsedStudyInfo,
  send: (event: DesignerEvent) => void,
): Promise<DesignerOutput> {
  // Step 1: Filter
  const relevant = filterProblems(problems);
  send({
    type: "log",
    message: `${relevant.length}/${problems.length} problems are relevant (unsolved or stale)`,
  });

  if (relevant.length === 0) {
    return {
      plan: [],
      summary: { totalProblems: 0, essentialCount: 0, extraCount: 0, totalDays: 0, totalHours: 0 },
      rationale: "No relevant problems to schedule.",
    };
  }

  // Step 2: LLM decides distribution ratios + priority rules
  const decision = await decideDistribution(relevant, studyInfo, send);
  send({ type: "log", message: `Level: ${decision.learnerAssessment}` });
  send({ type: "log", message: `Ratios: Easy ${Math.round(decision.ratios.easy * 100)}% / Medium ${Math.round(decision.ratios.medium * 100)}% / Hard ${Math.round(decision.ratios.hard * 100)}%` });
  send({ type: "log", message: `Rationale: ${decision.ratioRationale}` });

  // Step 3: Assign priorities using LLM's topic/ratio decisions
  const priorities = assignPriorities(relevant, decision.coreTopics, decision.essentialRatio, decision.ratios, send);

  // Step 4: Tag with priority and time
  const hoursPerDay = studyInfo.hoursPerDay ?? 3;
  const prioritized: PrioritizedProblem[] = relevant.map((p) => ({
    ...p,
    priority: priorities[p.slug] ?? "extra",
    timeHours: DIFFICULTY_HOURS[p.difficulty] ?? 1.0,
  }));

  // Step 5: Generate study dates
  const studyDates = generateStudyDates(
    studyInfo.studyDays ?? [1, 2, 3, 4, 5],
    studyInfo.timeFrameDays ?? 90,
  );

  // Step 6: Distribute according to LLM ratios
  const plan = distribute(prioritized, studyDates, hoursPerDay, decision.ratios);

  // Summary
  const essentialCount = plan.reduce((sum, d) => sum + d.essential.length, 0);
  const extraCount = plan.reduce((sum, d) => sum + d.extra.length, 0);
  const totalHours = prioritized
    .filter((p) => p.priority === "essential")
    .reduce((sum, p) => sum + p.timeHours, 0);

  // Build combined rationale
  const rationale = [
    `Learner: ${decision.learnerAssessment}`,
    `Ratios: ${Math.round(decision.ratios.easy * 100)}% Easy / ${Math.round(decision.ratios.medium * 100)}% Medium / ${Math.round(decision.ratios.hard * 100)}% Hard`,
    `Why: ${decision.ratioRationale}`,
    `Priorities: ${decision.priorityRationale}`,
  ].join("\n\n");

  return {
    plan,
    summary: {
      totalProblems: prioritized.length,
      essentialCount,
      extraCount,
      totalDays: studyDates.length,
      totalHours: Math.round(totalHours * 10) / 10,
    },
    rationale,
  };
}