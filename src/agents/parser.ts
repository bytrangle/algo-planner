import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParserOutput {
  timeFrame: string | null;
  hoursPerDay: number | null;
  studyDays: string | null;
  question: string | null;
}

export interface ParsedStudyInfo {
  timeFrame: string | null;
  hoursPerDay: number | null;
  studyDays: string | null;
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
- timeFrame: how long they plan to study overall (e.g., "3 months", "6 months", "1 year")
- hoursPerDay: maximum hours per day as a number
- studyDays: which days of the week (e.g., "Monday to Friday", "Monday, Wednesday, Friday")

This is a multi-turn conversation. If the user has only sent one message and any fields are missing, respond with what you extracted plus a friendly question asking for everything that's missing:
{
  "timeFrame": <value or null>,
  "hoursPerDay": <number or null>,
  "studyDays": <value or null>,
  "question": "<one sentence asking for the missing info>"
}

If the user has already responded to your clarification question (this is the second user message in the conversation), apply these defaults for any field still missing:
- timeFrame → "3 months"
- hoursPerDay → 3
- studyDays → "all weekdays"

Then respond with question set to null:
{
  "timeFrame": "...",
  "hoursPerDay": <number>,
  "studyDays": "...",
  "question": null
}

Rules:
- For studyDays: if they say a number of days without naming them, default to "Monday to Friday"
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
      timeFrame: typeof parsed.timeFrame === "string" ? parsed.timeFrame : null,
      hoursPerDay:
        typeof parsed.hoursPerDay === "number" ? parsed.hoursPerDay : null,
      studyDays: typeof parsed.studyDays === "string" ? parsed.studyDays : null,
      question: typeof parsed.question === "string" ? parsed.question : null,
    };
  } catch (err) {
    console.error("Failed to parse study info:", err);
    return {
      timeFrame: "3 months",
      hoursPerDay: 3,
      studyDays: "all weekdays",
      question: null,
    };
  }
}
