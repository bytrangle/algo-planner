import { NextRequest, NextResponse } from "next/server";
import {
  parseStudyInfo,
  type ChatMessage,
  type ParsedStudyInfo,
} from "@/src/agents/parser";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { message, history } = body as {
    message: string;
    history: ChatMessage[];
  };

  console.log("=== /api/plan request ===");
  console.log("Message:", message);
  console.log("History:", JSON.stringify(history, null, 2));

  // Build the conversation: existing history + new user message
  const messages: ChatMessage[] = [
    ...(history ?? []),
    { role: "user" as const, content: message },
  ];

  const result = await parseStudyInfo(messages);
  console.log("Parser result:", JSON.stringify(result, null, 2));

  // Append the assistant's response to history
  const assistantContent =
    result.question ?? "Study plan information collected.";
  const updatedHistory: ChatMessage[] = [
    ...messages,
    { role: "assistant" as const, content: assistantContent },
  ];

  return NextResponse.json({
    ok: result.question === null,
    question: result.question,
    history: updatedHistory,
    studyInfo: {
      timeFrame: result.timeFrame,
      hoursPerDay: result.hoursPerDay,
      studyDays: result.studyDays,
    } satisfies ParsedStudyInfo,
  });
}
