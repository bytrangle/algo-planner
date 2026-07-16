import { NextRequest, NextResponse } from "next/server";
import {
  parseStudyInfo,
  type ChatMessage,
  type ParsedStudyInfo,
} from "@/src/agents/parser";
import {
  designStudyPlan,
  type DesignerOutput,
} from "@/src/agents/designer";
import type { ProblemWithTopic } from "@/src/utils/flatten-problems";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { message, history, data } = body as {
    message: string;
    history: ChatMessage[];
    data?: {
      unsolvedProblems?: ProblemWithTopic[];
      solvedProblems?: (ProblemWithTopic & { lastSolvedAt: string })[];
    };
  };

  console.log("=== /api/plan request ===");
  console.log("Message:", message);
  console.log("History:", JSON.stringify(history, null, 2));

  // Build the conversation: existing history + new user message
  const messages: ChatMessage[] = [
    ...(history ?? []),
    { role: "user" as const, content: message },
  ];

  // ---- Agent 1: Parser ----
  const result = await parseStudyInfo(messages);
  console.log("Parser result:", JSON.stringify(result, null, 2));

  const studyInfo: ParsedStudyInfo = {
    timeFrameDays: result.timeFrameDays,
    hoursPerDay: result.hoursPerDay,
    studyDays: result.studyDays,
  };

  // Append the assistant's response to history
  const assistantContent =
    result.question ?? "Study plan information collected.";
  const updatedHistory: ChatMessage[] = [
    ...messages,
    { role: "assistant" as const, content: assistantContent },
  ];

  // ---- Agent 2: Designer (only when Parser is done) ----
  let plan: DesignerOutput | null = null;

  if (result.question === null) {
    try {
      const allProblems = [
        ...(data?.unsolvedProblems ?? []),
        ...(data?.solvedProblems ?? []),
      ];
      plan = await designStudyPlan(allProblems, studyInfo);
      console.log("Designer summary:", JSON.stringify(plan.summary, null, 2));
    } catch (err) {
      console.error("Designer failed:", err);
    }
  }

  return NextResponse.json({
    ok: result.question === null,
    question: result.question,
    history: updatedHistory,
    studyInfo,
    plan,
  });
}
