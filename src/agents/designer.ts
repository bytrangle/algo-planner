import OpenAI from "openai";
import type { ParsedStudyInfo } from "./parser";
import type { ProblemWithTopic } from "../utils/flatten-problems";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ProblemWithTopic } from "../utils/flatten-problems";

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
// 1. Filter: keep unsolved + solved > 6 months ago
// ---------------------------------------------------------------------------

export function filterProblems(
  problems: (ProblemWithTopic & { lastSolvedAt?: string })[],
): ProblemWithTopic[] {
  const cutoff = Date.now() - SIX_MONTHS_MS;

  return problems.filter((p) => {
    if (!p.lastSolvedAt) return true; // never solved → keep
    const solvedMs = Number(p.lastSolvedAt) * 1000; // Unix seconds → ms
    return solvedMs < cutoff; // solved long ago → keep for review
  });
}

// ---------------------------------------------------------------------------
// 2. Fetch priorities via LLM + web_extractor
// ---------------------------------------------------------------------------

/**
 * Ask the LLM to research labuladong.online and classify each problem as
 * "essential" (featured prominently, has a dedicated page, mentioned multiple
 * times) or "extra" (barely mentioned or absent).
 */
export async function fetchPriorities(
  problems: ProblemWithTopic[],
): Promise<Record<string, Priority>> {
  if (problems.length === 0) return {};

  // Build a compact problem list for the prompt: slug + title + topic
  const problemList = problems
    .map(
      (p) =>
        `  {"slug": "${p.slug}", "title": "${p.title}", "topics": [${p.topics.map((t) => `"${t}"`).join(", ")}]}`,
    )
    .join(",\n");

  const prompt = `You are Designer, the second agent in a multi-agent system that creates personalised
algorithm study plans.

Your task: determine which LeetCode problems are **essential** and which are **extra
credits** by researching labuladong.online (also known as labuladong's algorithm
website).  labuladong is the authoritative source for the algorithm curriculum.

=== PROBLEM LIST ===
[
${problemList}
]

=== CRITERIA ===
Mark a problem as **essential** when it meets one of the following criteria:
- It has a dedicated page/article on labuladong.online
- It is mentioned in multiple places across the site
- It appears in labuladong's core algorithm curriculum or "must-know" lists

Mark a problem as **extra** when it is mentioned only once or not at all on labuladong

=== STRATEGY ===
1. Use web_search to find labuladong pages about algorithm topics and problem
   lists (search for "labuladong" + topic names like "linked list", "dynamic
   programming", "binary tree", etc.)
2. Use web_extractor to read the most relevant pages — especially the table of
   contents and any problem-index / curriculum pages
3. Cross-reference: a problem that appears in labuladong's main curriculum or
   has its own dedicated article is essential

=== OUTPUT ===
Return ONLY a JSON object mapping every problem slug to "essential" or "extra".
No other text — just valid JSON:

{
  "two-sum": "essential",
  "valid-anagram": "essential",
  "some-obscure-problem": "extra"
}`;

  console.log(`Designer: fetching priorities for ${problems.length} problems...`);

  try {
    const params = {
      model: "qwen3-max-2026-01-23" as const,
      input: prompt,
      // web_extractor and extra_body are DashScope extensions not in the OpenAI SDK types
      tools: [{ type: "web_search" as const }, { type: "web_extractor" as const }],
      extra_body: { enable_thinking: true },
    };
    const response = await openai.responses.create(
      params as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming,
    );

    const text = response.output_text?.trim() ?? "";

    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
    const priorities = JSON.parse(jsonStr) as Record<string, Priority>;

    // Validate: every input slug must have a priority
    for (const p of problems) {
      if (!priorities[p.slug]) {
        console.warn(`Designer: no priority for "${p.slug}", defaulting to "extra"`);
        priorities[p.slug] = "extra";
      }
    }

    console.log(
      `Designer: priorities fetched — ${Object.values(priorities).filter((v) => v === "essential").length} essential, ${Object.values(priorities).filter((v) => v === "extra").length} extra`,
    );
    return priorities;
  } catch (err) {
    console.error("Designer: failed to fetch priorities, defaulting all to extra:", err);
    // Fallback: everything is extra (safe default)
    const fallback: Record<string, Priority> = {};
    for (const p of problems) {
      fallback[p.slug] = "extra";
    }
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 3. Generate study dates from studyDays + timeFrameDays
// ---------------------------------------------------------------------------

/** Generate all study dates within the time frame that fall on the given days of week,
 *  starting from next Monday. */
function generateStudyDates(
  studyDays: number[],
  timeFrameDays: number,
): Date[] {
  const daySet = new Set(studyDays);
  const dates: Date[] = [];

  // Start from next Monday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilMonday = (8 - today.getDay()) % 7;
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
// 4. Distribute problems across study days
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
  return d.toISOString().split("T")[0];
}

/**
 * Distribute prioritized problems evenly across study days, splitting each day
 * into Essential (must fit within hoursPerDay) and Extra (overflow).
 */
function distribute(
  problems: PrioritizedProblem[],
  studyDates: Date[],
  hoursPerDay: number,
): DayPlan[] {
  if (studyDates.length === 0) return [];

  // Separate essentials and extras
  const essentialPool = problems.filter((p) => p.priority === "essential");
  const extraPool = problems.filter((p) => p.priority === "extra");

  // Sort by difficulty descending (hard first) within each pool for better
  // capacity packing — hard problems anchor a day, easier ones fill gaps.
  const diffOrder = { Hard: 3, Medium: 2, Easy: 1 };
  essentialPool.sort(
    (a, b) => (diffOrder[b.difficulty] ?? 0) - (diffOrder[a.difficulty] ?? 0),
  );
  extraPool.sort(
    (a, b) => (diffOrder[b.difficulty] ?? 0) - (diffOrder[a.difficulty] ?? 0),
  );

  const plan: DayPlan[] = studyDates.map((d) => ({
    date: formatDate(d),
    dayOfWeek: DAY_NAMES[d.getDay()],
    essential: [],
    extra: [],
  }));

  // ---- Pass 1: distribute Essential problems evenly across all days ----
  // Greedy: assign each essential to the day with the smallest total time so far.
  const dayTotalTime: number[] = new Array(plan.length).fill(0);

  for (const p of essentialPool) {
    // Find the day with the smallest current total
    let minIdx = 0;
    let minTime = dayTotalTime[0];
    for (let i = 1; i < dayTotalTime.length; i++) {
      if (dayTotalTime[i] < minTime) {
        minTime = dayTotalTime[i];
        minIdx = i;
      }
    }
    plan[minIdx].essential.push(p);
    dayTotalTime[minIdx] += p.timeHours;
  }

  // ---- Pass 2: split overloaded days → overflow to Extra ----
  for (let i = 0; i < plan.length; i++) {
    const day = plan[i];
    let totalEssentialTime = day.essential.reduce((sum, p) => sum + p.timeHours, 0);

    // Move the easiest problem from Essential to Extra until Essentials fit
    while (totalEssentialTime > hoursPerDay && day.essential.length > 0) {
      const moved = day.essential.pop()!;
      totalEssentialTime -= moved.timeHours;
      day.extra.unshift(moved);
    }
  }

  // ---- Pass 3: distribute Extra problems to under-capacity days ----
  // Collect all extra problems (from extraPool + overflowed essentials)
  const allExtras = [
    ...extraPool,
    ...plan.flatMap((d) => d.extra), // overflowed essentials currently in extra
  ];

  // Clear all extras, we'll redistribute
  for (const day of plan) day.extra = [];

  // Recalculate free capacity per day
  const freeCapacity: number[] = plan.map((day) => {
    const used = day.essential.reduce((sum, p) => sum + p.timeHours, 0);
    return Math.max(0, hoursPerDay - used);
  });

  // Skip if no day has remaining capacity
  const totalFree = freeCapacity.reduce((sum, cap) => sum + cap, 0);
  if (totalFree <= 0) return plan;

  // Greedy fill: assign extras to days with the most free capacity
  for (const p of allExtras) {
    let bestIdx = -1;
    let bestCap = 0;
    for (let i = 0; i < freeCapacity.length; i++) {
      if (freeCapacity[i] >= p.timeHours && freeCapacity[i] > bestCap) {
        bestCap = freeCapacity[i];
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      plan[bestIdx].extra.push(p);
      freeCapacity[bestIdx] -= p.timeHours;
    }
    // If no day has room, skip this extra — the Optimizer can handle it later
  }

  return plan;
}

// ---------------------------------------------------------------------------
// 5. Main entry point
// ---------------------------------------------------------------------------

export async function designStudyPlan(
  problems: ProblemWithTopic[],
  studyInfo: ParsedStudyInfo,
): Promise<DesignerOutput> {
  // Step 1: Filter
  const relevant = filterProblems(problems);
  console.log(
    `Designer: ${relevant.length}/${problems.length} problems are relevant (unsolved or stale)`,
  );

  if (relevant.length === 0) {
    return {
      plan: [],
      summary: { totalProblems: 0, essentialCount: 0, extraCount: 0, totalDays: 0, totalHours: 0 },
    };
  }

  // Step 2: Fetch priorities via LLM + web_extractor
  const priorities = await fetchPriorities(relevant);

  // Step 3: Tag with priority and time
  const hoursPerDay = studyInfo.hoursPerDay ?? 3;
  const prioritized: PrioritizedProblem[] = relevant.map((p) => ({
    ...p,
    priority: priorities[p.slug] ?? "extra",
    timeHours: DIFFICULTY_HOURS[p.difficulty] ?? 1.0,
  }));

  // Step 4: Generate study dates
  const studyDates = generateStudyDates(
    studyInfo.studyDays ?? [1, 2, 3, 4, 5],
    studyInfo.timeFrameDays ?? 90,
  );
  console.log(`Designer: ${studyDates.length} study days across the time frame`);

  // Step 5: Distribute
  const plan = distribute(prioritized, studyDates, hoursPerDay);

  // Summary
  const essentialCount = plan.reduce((sum, d) => sum + d.essential.length, 0);
  const extraCount = plan.reduce((sum, d) => sum + d.extra.length, 0);
  const totalHours = prioritized.reduce((sum, p) => sum + p.timeHours, 0);

  return {
    plan,
    summary: {
      totalProblems: prioritized.length,
      essentialCount,
      extraCount,
      totalDays: studyDates.length,
      totalHours: Math.round(totalHours * 10) / 10,
    },
  };
}
