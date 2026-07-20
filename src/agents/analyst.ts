// ---------------------------------------------------------------------------
// Analyst Agent
// ---------------------------------------------------------------------------
// LLM-driven agent that:
//  1. Extracts study parameters from the learner's natural language message
//  2. Fetches LeetCode behavioural data to fill missing parameters
//  3. Returns finalised studyInfo — no questions, no continuation
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
  weeklyVelocity: number;
  isAggressiveTimeline: boolean;
}

export interface AnalystResult {
  thinkingLogs: string[];
  studyInfo: StudyPlanParams;
  reasoning: string;
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
// Tool implementations
// ---------------------------------------------------------------------------

export function calculateVelocity(calendar: LeetCodeCalendar): number {
  const entries = Object.values(calendar.submissionCalendar);
  if (entries.length === 0) return 0;
  const total = entries.reduce((a, b) => a + b, 0);
  return (total / entries.length) * 7;
}

// ---------------------------------------------------------------------------
// LLM tool definitions
// ---------------------------------------------------------------------------

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "fetchLeetCodeProfile",
      description:
        "Fetch a learner's LeetCode calendar and badges. The calendar contains submission counts per day; badges show milestone achievements (streak, yearly, etc.). Use this to estimate hoursPerDay and assess consistency.",
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

const SYSTEM_PROMPT = `You are Analyst. Extract study-plan parameters from the learner's message,
filling gaps with LeetCode behavioural data.

1. Extract what they stated: timeframe, hours/day, studyDays.
   "3 months"=90, "6 weeks"=42, "1 month"=30, "2h"=2.
   studyDays as an array of number: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun.

2. Call fetchLeetCodeProfile then calculateVelocity to get their data.

3. Fill missing parameters:
   - timeFrameDays: default 90 if not stated
   - hoursPerDay: estimate from velocity (~2.5/day = 2h, ~5/day = 3h, <2/day = 1h)
   - studyDays: default [1,2,3,4,5] (Mon-Fri) if not stated
   - Reasoning: 1-2 sentences summarising what you did

Output ONLY valid JSON:
{
  "studyInfo": { "timeFrameDays": N, "hoursPerDay": N, "studyDays": [...] },
  "reasoning": "<1-2 sentence summary>",
  "userCapacity": { "weeklyVelocity": N }
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
  | { type: "analyst_done"; reasoning: string; studyInfo: StudyPlanParams; userCapacity: UserCapacity }
  | { type: "error"; message: string };

export type StreamController = (event: AnalystEvent) => void;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function analyzeStudyPlan(
  messages: ChatMessage[],
  username: string,
  stream?: StreamController,
): Promise<AnalystResult> {
  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
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
    {
      role: "system",
      content: [
        {
          type: "text",
          text: `LeetCode username: "${username}". Call fetchLeetCodeProfile to get their behavioural data, then calculateVelocity on the calendar. Estimate hoursPerDay from velocity if not stated.`,
          // @ts-expect-error — cache_control is a DashScope extension
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];

  for (const m of messages) {
    apiMessages.push({
      role: m.role as "user" | "assistant",
      content: m.content,
    });
  }

  const thinkingLogs: string[] = [];

  for (let turn = 0; turn < 8; turn++) {
    const hasToolResults = apiMessages.some(
      (m) => m.role === "tool" || (m.role === "assistant" && "tool_calls" in m),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completionStream = await (openai.chat.completions as any).create({
      model: "qwen3.6-plus",
      messages: apiMessages,
      tools: TOOLS,
      temperature: 0.2,
      stream: true,
      extra_body: { enable_thinking: hasToolResults },
    });

    let contentBuffer = "";
    const toolAccumulators = new Map<
      number,
      { id: string; name: string; args: string }
    >();
    let finishReason = "";

    for await (const chunk of completionStream) {
      const delta = chunk.choices?.[0]?.delta;
      finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;

      if ((delta as Record<string, unknown>)?.reasoning_content) {
        const rc = (delta as Record<string, string>).reasoning_content;
        thinkingLogs.push(rc);
        stream?.({ type: "log", message: rc });
      }

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

      if (delta?.content) {
        contentBuffer += delta.content;
        stream?.({ type: "content_delta", text: delta.content });
      }
    }

    if (finishReason === "tool_calls") {
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

      apiMessages.push({
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);

      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;

        const raw = tc.function.arguments.trim();

        let json = raw;
        if (json.startsWith("{") && !json.endsWith("}")) {
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

      continue;
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
        userCapacity: UserCapacity;
      };

      const result: AnalystResult = {
        thinkingLogs,
        studyInfo: {
          timeFrameDays: parsed.studyInfo.timeFrameDays || DEFAULT_PARAMS.timeFrameDays,
          hoursPerDay: parsed.studyInfo.hoursPerDay || DEFAULT_PARAMS.hoursPerDay,
          studyDays: parsed.studyInfo.studyDays?.length
            ? parsed.studyInfo.studyDays
            : DEFAULT_PARAMS.studyDays,
        },
        reasoning: parsed.reasoning,
        userCapacity: parsed.userCapacity ?? { weeklyVelocity: 0, isAggressiveTimeline: false },
      };
      stream?.({
        type: "analyst_done",
        reasoning: result.reasoning,
        studyInfo: result.studyInfo,
        userCapacity: result.userCapacity,
      });
      return result;
    } catch {
      console.error("Analyst: failed to parse LLM output:", jsonStr.slice(0, 300));
      stream?.({ type: "error", message: "Failed to parse Analyst output" });
      return {
        thinkingLogs,
        studyInfo: { ...DEFAULT_PARAMS },
        reasoning: "Based on your preferences, here's a balanced study plan.",
        userCapacity: { weeklyVelocity: 0, isAggressiveTimeline: false },
      };
    }
  }

  throw new Error("Analyst: tool-calling loop exceeded max turns");
}