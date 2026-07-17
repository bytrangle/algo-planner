import { NextRequest } from "next/server";
import {
  analyzeStudyPlan,
  type ChatMessage,
  type AnalystEvent,
  type StudyPlanParams,
} from "@/src/agents/analyst";
import { designStudyPlan, type ParsedStudyInfo } from "@/src/agents/designer";
import type { ProblemWithTopic } from "@/src/utils/flatten-problems";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// POST /api/plan  (SSE streaming)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const { message, history, username, data } = body as {
    message: string;
    history: ChatMessage[];
    username: string;
    data?: {
      unsolvedProblems?: ProblemWithTopic[];
      solvedProblems?: (ProblemWithTopic & { lastSolvedAt: string })[];
    };
  };

  if (!message || !username) {
    return new Response(
      JSON.stringify({ error: "message and username are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const updatedHistory: ChatMessage[] = [
    ...history,
    { role: "user" as const, content: message },
  ];

  const allProblems: ProblemWithTopic[] = [
    ...(data?.unsolvedProblems ?? []),
    ...(data?.solvedProblems ?? []),
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AnalystEvent) => {
        controller.enqueue(encoder.encode(sse(event.type, event)));
      };

      try {
        // ---- Agent 1: Analyst (streaming) ----
        const analystResult = await analyzeStudyPlan(
          updatedHistory,
          username,
          send,
        );

        // If Analyst needs clarification, stop here
        if (analystResult.question) {
          updatedHistory.push({
            role: "assistant",
            content: analystResult.question,
          });
          controller.enqueue(
            encoder.encode(
              sse("done", {
                stage: "analyzing",
                question: analystResult.question,
                reasoning: analystResult.reasoning,
                conflictExplanation: analystResult.conflictExplanation,
                history: updatedHistory,
                studyInfo: analystResult.studyInfo,
              }),
            ),
          );
          controller.close();
          return;
        }

        // ---- Agent 2: Designer ----
        send({ type: "log", message: "Designing your study plan..." });

        const studyInfo: ParsedStudyInfo = {
          timeFrameDays: analystResult.studyInfo.timeFrameDays,
          hoursPerDay: analystResult.studyInfo.hoursPerDay,
          studyDays: analystResult.studyInfo.studyDays,
          userCapacity: analystResult.userCapacity,
        };

        const plan = await designStudyPlan(allProblems, studyInfo);

        updatedHistory.push({
          role: "assistant",
          content: analystResult.reasoning,
        });

        controller.enqueue(
          encoder.encode(
            sse("done", {
              stage: "designing",
              reasoning: analystResult.reasoning,
              history: updatedHistory,
              studyInfo: analystResult.studyInfo,
              userCapacity: analystResult.userCapacity,
              plan,
            }),
          ),
        );
        controller.close();
      } catch (err) {
        console.error("Plan error:", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
