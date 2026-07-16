import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParserOutput {
  /** Total number of days in the study time frame. */
  timeFrameDays: number | null;
  /** Maximum hours the learner can study per day. */
  hoursPerDay: number | null;
  /** Which days of the week, as numbers: 0=Sun, 1=Mon, …, 6=Sat. */
  studyDays: number[] | null;
  /** Clarification question, null when all fields are filled. */
  question: string | null;
}

export interface ParsedStudyInfo {
  timeFrameDays: number | null;
  hoursPerDay: number | null;
  studyDays: number[] | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Parser, the first chain in a multi-agent system for designing a smart study plan for data structures and algorithm.

Extract study plan information from the user's messages. You need three fields:
- timeFrameDays: total number of days — compute this yourself.
  Examples: "3 months" → 90, "6 months" → 180, "1 year" → 365, "2 weeks" → 14, "30 days" → 30
- hoursPerDay: maximum hours per day.
  Examples: "2 hours" → 2, "one and a half hours" → 1.5, "1h30m" → 1.5
- studyDays: which days of the week as numbers (0=Sun, 1=Mon, …, 6=Sat).
  Examples: "Monday to Friday" → [1,2,3,4,5], "Monday, Wednesday, Friday" → [1,3,5], "weekends" → [0,6], "every day" → [0,1,2,3,4,5,6]

This is a multi-turn conversation. If the user has only sent one message and any fields are missing, respond with what you extracted plus a friendly question asking for everything that's missing:
{
  "timeFrameDays": <number or null>,
  "hoursPerDay": <number or null>,
  "studyDays": <number array or null>,
  "question": "<one sentence asking for the missing info>"
}

If the user has already responded to your clarification question (this is the second user message in the conversation), apply these defaults for any field still missing:
- timeFrameDays → 90
- hoursPerDay → 3
- studyDays → [1, 2, 3, 4, 5]

Then respond with question set to null:
{
  "timeFrameDays": <number>,
  "hoursPerDay": <number>,
  "studyDays": [<numbers>],
  "question": null
}

Rules:
- Compute the CONCRETE values yourself. "3 months" → 90, "6 months" → 180, "30 days" → 30, etc.
- Do not invent values for missing fields on the first turn — return null and ask
- On the second turn, apply defaults for anything still missing`;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

const openai = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

export async function parseStudyInfo(
  messages: ChatMessage[],
): Promise<ParserOutput> {
  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "qwen3.6-flash",
      messages: apiMessages,
      temperature: 0.1,
    });

    const content = response.choices?.[0]?.message?.content?.trim() ?? "";

    // Strip markdown code fences if present
    const jsonStr = content.replace(/^```(?:json)?\s*|\s*```$/g, "");

    const parsed = JSON.parse(jsonStr) as ParserOutput;
    return {
      timeFrameDays:
        typeof parsed.timeFrameDays === "number" ? parsed.timeFrameDays : null,
      hoursPerDay:
        typeof parsed.hoursPerDay === "number" ? parsed.hoursPerDay : null,
      studyDays:
        Array.isArray(parsed.studyDays)
          ? (parsed.studyDays as number[]).filter((n) => typeof n === "number")
          : null,
      question: typeof parsed.question === "string" ? parsed.question : null,
    };
  } catch (err) {
    console.error("Failed to parse study info:", err);
    return {
      timeFrameDays: 90,
      hoursPerDay: 3,
      studyDays: [1, 2, 3, 4, 5],
      question: null,
    };
  }
}
