// ---------------------------------------------------------------------------
// Analyst Agent
// ---------------------------------------------------------------------------
// LLM-driven agent that:
//  1. Extracts study parameters from the learner's natural language message
//  2. Decides whether to call LeetCode behavioural-data functions
//  3. Compiles timeFrameDays, hoursPerDay, studyDays and hands off to Designer
// ---------------------------------------------------------------------------

import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StudyPlanParams {
  timeFrameDays: number;
  hoursPerDay: number;
  studyDays: number[];
}

export interface UserCapacity {
  /** Problems per week based on historical submission data. */
  weeklyVelocity: number;
  /** True when the learner's requested timeline is significantly shorter
   *  than what their velocity suggests. */
  isAggressiveTimeline: boolean;
}

export interface AnalystResult {
  thinkingLogs: string[];
  /** Finalised study parameters — ready for Designer. */
  studyInfo: StudyPlanParams;
  /** Human-readable reasoning the UI can display. */
  reasoning: string;
  /** Clarification question when more info is needed, null when ready. */
  question: string | null;
  /**
   * When the Analyst's data-driven recommendation differs from what the
   * learner explicitly stated, this explains the contrast (e.g. "Your 12-week
   * plan requires 7.5 probs/week but your pace is 3/week").
   * Null when there is no conflict or it has been resolved.
   */
  conflictExplanation: string | null;
  /** Capacity metrics derived from LeetCode data. */
  userCapacity: UserCapacity;
}

export interface LeetCodeCalendar {
  streak: number;
  totalActiveDays: number;
  activeYears: number[];
  submissionCalendar: Record<string, number>;
}

export interface LeetCodeBadge {
  name: string;
  shortName: string;
  creationDate: string;
  category: string;
}

export interface LeetCodeProfile {
  calendar: LeetCodeCalendar;
  badges: LeetCodeBadge[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PARAMS: StudyPlanParams = {
  timeFrameDays: 90,
  hoursPerDay: 3,
  studyDays: [1, 2, 3, 4, 5],
};

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

async function fetchLeetCodeCalendar(
  username: string,
): Promise<LeetCodeCalendar> {
  const res = await fetch(
    `https://leetcode-api-pied.vercel.app/user/${username}/calendar`,
  );
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
  return res.json();
}

async function fetchLeetCodeBadges(username: string): Promise<LeetCodeBadge[]> {
  const res = await fetch(
    `https://leetcode-api-pied.vercel.app/user/${username}/badges`,
  );
  if (!res.ok) throw new Error(`Badges fetch failed: ${res.status}`);
  const data = await res.json();
  return data.badges ?? [];
}

export async function fetchLeetCodeProfile(
  username: string,
): Promise<LeetCodeProfile> {
  const [calendar, badges] = await Promise.all([
    fetchLeetCodeCalendar(username),
    fetchLeetCodeBadges(username),
  ]);
  return { calendar, badges };
}

// ---------------------------------------------------------------------------
// Tool implementations — concrete computations the LLM calls
// ---------------------------------------------------------------------------

/**
 * Weekly problem-solving velocity from submission history.
 * (total submissions / days with data) × 7
 */
export function calculateVelocity(calendar: LeetCodeCalendar): number {
  const entries = Object.values(calendar.submissionCalendar);
  if (entries.length === 0) return 0;
  const total = entries.reduce((a, b) => a + b, 0);
  return (total / entries.length) * 7;
}

/**
 * Top 3 days of the week the learner is most active, sorted Sun→Sat.
 */


// ---------------------------------------------------------------------------
// LLM tool definitions — only concrete computations the LLM can't easily do
// ---------------------------------------------------------------------------

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "fetchLeetCodeProfile",
      description:
        "Fetch a learner's LeetCode calendar and badges. The calendar contains submission counts per day; badges show milestone achievements (streak, yearly, etc.). Use this raw data to assess their consistency, velocity, and habits.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "LeetCode username." },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculateVelocity",
      description:
        "Compute weekly problem-solving velocity (problems/week) from raw submission calendar data.",
      parameters: {
        type: "object",
        properties: {
          submissionCalendar: {
            type: "object",
            description: "Raw calendar: timestamp → submission count.",
          },
        },
        required: ["submissionCalendar"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are **Analyst**, the first agent in a multi-agent system that creates personalised
algorithm study plans.

**Your job:**

1. **Extract parameters** the learner stated:
   - timeFrameDays: "3 months" → 90, "6 weeks" → 42, "1 month" → 30
   - hoursPerDay: "2 hours" → 2, "1.5h" → 1.5
   - studyDays: 0=Sun…6=Sat, "Mon-Fri" → [1,2,3,4,5]

2. **Call tools**: \`fetchLeetCodeProfile\` then \`calculateVelocity\`.
   From the data, infer:
   - hoursPerDay from badge tiers / streak (if not stated)
   - recommended timeframe = (90 ÷ weeklyVelocity) weeks, rounded up, × 7
   - isAggressiveTimeline = learner's days < 70% of recommended

3. **Report back**. Your response does TWO things in one go:
   - Share what you learned (velocity, badges, recommended timeframe)
   - Ask ONE question if anything is missing or the data suggests otherwise.
     - If any extracted parameter from the learner is missing → ask if the learner wants to use your insight, or if they have a preference.
     - If your recommendation differs from the extracted parameters from learner's message → mention it and ask which to use.
     - Combine both into a single sentence.

   **You get ONE question. After the learner replies, finalise and return
   \`question: null\`.** Accept their answers — if they override you, use
   their numbers. If they give partial answers, fill gaps with defaults.

4. **Defaults** (only when neither learner nor data provides a value):
   timeFrameDays=90, hoursPerDay=3, studyDays=[1,2,3,4,5]

5. **Output** — ONLY valid JSON:

{
  "studyInfo": { "timeFrameDays": N, "hoursPerDay": N, "studyDays": [...] },
  "reasoning": "<1-2 sentence summary of what you found>",
  "question": "<one question covering everything | null>",
  "conflictExplanation": "<why data differs from request | null>",
  "userCapacity": { "weeklyVelocity": N, "isAggressiveTimeline": bool },
  "thinkingLogs": ["<step>", ...]
}`;

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "fetchLeetCodeProfile":
      return fetchLeetCodeProfile(args.username as string);
    case "calculateVelocity":
      return calculateVelocity({
        submissionCalendar: args.submissionCalendar as Record<string, number>,
      } as LeetCodeCalendar);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Streaming events
// ---------------------------------------------------------------------------

export type AnalystEvent =
  | { type: "log"; message: string }
  | { type: "content_delta"; text: string }
  | { type: "analyst"; result: AnalystResult }
  | { type: "error"; message: string };

export type StreamController = (event: AnalystEvent) => void;

// ---------------------------------------------------------------------------
// Main entry point — streaming via Qwen DashScope native SSE
// ---------------------------------------------------------------------------

export async function analyzeStudyPlan(
  messages: ChatMessage[],
  username: string,
  stream?: StreamController,
): Promise<AnalystResult> {
  // Build messages with explicit cache control for static content
  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    // System prompt — cached (large, static)
    {
      role: "system",
      content: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // @ts-expect-error — cache_control is a DashScope extension
          cache_control: { type: "ephemeral" },
        },
      ],
    },
    // User context — cached (static per user session)
    {
      role: "system",
      content: [
        {
          type: "text",
          text: `The learner's LeetCode username is "${username}". Call \`fetchLeetCodeProfile\` to get their behavioural data, then \`calculateVelocity\` on the calendar. Use the raw profile (badges, streak, active days) to reason about their consistency and determine \`hoursPerDay\`.`,
          // @ts-expect-error — cache_control is a DashScope extension
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];

  // Dynamic conversation history — not cached
  for (const m of messages) {
    apiMessages.push({
      role: m.role as "user" | "assistant",
      content: m.content,
    });
  }

  const thinkingLogs: string[] = [];

  for (let turn = 0; turn < 8; turn++) {
    // ---------- native streaming ----------
    // extra_body is a DashScope extension not in the OpenAI SDK types
    // Enable thinking only after tool results are in the conversation
    // (i.e., when the LLM is about to produce the final analysis).
    // Tool-calling turns don't need the overhead.
    const hasToolResults = apiMessages.some(
      (m) => m.role === "tool" || (m.role === "assistant" && "tool_calls" in m),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completionStream = await (openai.chat.completions as any).create({
      model: "qwen3.5-plus",
      messages: apiMessages,
      tools: TOOLS,
      temperature: 0.2,
      stream: true,
      extra_body: { enable_thinking: hasToolResults },
    });

    // Accumulators for deltas
    let contentBuffer = "";
    const toolAccumulators = new Map<
      number,
      { id: string; name: string; args: string }
    >();
    let finishReason = "";

    for await (const chunk of completionStream) {
      const delta = chunk.choices?.[0]?.delta;
      finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;

      // Phase 1: thinking tokens
      if ((delta as Record<string, unknown>)?.reasoning_content) {
        const rc = (delta as Record<string, string>).reasoning_content;
        thinkingLogs.push(rc);
        stream?.({ type: "log", message: rc });
      }

      // Phase 2: tool call deltas — accumulate partial arguments
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolAccumulators.has(idx)) {
            toolAccumulators.set(idx, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              args: "",
            });
          }
          const acc = toolAccumulators.get(idx)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
        }
      }

      // Phase 3: content deltas (final answer) — stream to client
      if (delta?.content) {
        contentBuffer += delta.content;
        stream?.({ type: "content_delta", text: delta.content });
      }
    }

    // Stream ended — check what happened
    if (finishReason === "tool_calls") {
      // Build tool call messages from accumulators
      const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
        [];
      for (const [, acc] of toolAccumulators) {
        const callMsg = `Calling ${acc.name}(${acc.args.slice(0, 120)}${acc.args.length > 120 ? "…" : ""})`;
        thinkingLogs.push(callMsg);
        stream?.({ type: "log", message: callMsg });

        toolCalls.push({
          id: acc.id,
          type: "function",
          function: { name: acc.name, arguments: acc.args },
        });
      }

      // Push assistant message with tool calls
      apiMessages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);

      // Execute each tool and push results
      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;

        const raw = tc.function.arguments.trim();

        // Streaming can truncate tool-call JSON. Repair common truncations.
        let json = raw;
        if (json.startsWith("{") && !json.endsWith("}")) {
          // Missing closing brace — try appending enough to close it
          if (json.endsWith('"')) json += "}";
          else json += '"}';
        }

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(json);
        } catch {
          console.error(
            `Tool "${tc.function.name}" malformed JSON (${raw.length} chars):`,
            raw.slice(0, 300),
          );
          throw new Error(
            `Streaming delivered truncated JSON for tool "${tc.function.name}". Please try again.`,
          );
        }

        let result: unknown;
        try {
          result = await dispatchTool(tc.function.name, args as Record<string, unknown>);
        } catch (err) {
          result = { error: (err as Error).message };
        }

        const resultStr = JSON.stringify(result);
        const summaryLog = `${tc.function.name} → ${resultStr.slice(0, 120)}${resultStr.length > 120 ? "…" : ""}`;
        thinkingLogs.push(summaryLog);
        stream?.({ type: "log", message: summaryLog });

        apiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: resultStr,
        } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
      }

      continue; // next turn — LLM processes tool results
    }

    // finishReason === "stop" — final response
    const doneLog = "Analysis complete";
    thinkingLogs.push(doneLog);
    stream?.({ type: "log", message: doneLog });

    const jsonStr = contentBuffer.replace(/^```(?:json)?\s*|\s*```$/g, "");

    try {
      const parsed = JSON.parse(jsonStr) as {
        studyInfo: StudyPlanParams;
        reasoning: string;
        question: string | null;
        conflictExplanation: string | null;
        userCapacity: UserCapacity;
        thinkingLogs?: string[];
      };

      const result: AnalystResult = {
        thinkingLogs: [...thinkingLogs, ...(parsed.thinkingLogs ?? [])],
        studyInfo: parsed.studyInfo,
        reasoning: parsed.reasoning,
        question: parsed.question ?? null,
        conflictExplanation: parsed.conflictExplanation ?? null,
        userCapacity: parsed.userCapacity ?? { weeklyVelocity: 0, isAggressiveTimeline: false },
      };
      stream?.({ type: "analyst", result });
      return result;
    } catch {
      console.error("Analyst: failed to parse LLM output:", jsonStr.slice(0, 300));
      stream?.({ type: "error", message: "Failed to parse Analyst output" });
      return {
        thinkingLogs,
        studyInfo: { ...DEFAULT_PARAMS },
        reasoning: "Based on your preferences, here's a balanced study plan. Adjust as needed.",
        question: null,
        conflictExplanation: null,
        userCapacity: { weeklyVelocity: 0, isAggressiveTimeline: false },
      };
    }
  }

  throw new Error("Analyst: tool-calling loop exceeded max turns");
}
