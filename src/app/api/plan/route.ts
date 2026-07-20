import { NextRequest } from "next/server";
import {
  analyzeStudyPlan,
  type ChatMessage,
  type AnalystEvent,
} from "@/src/agents/analyst";
import { designStudyPlan, type ParsedStudyInfo } from "@/src/agents/designer";
import { optimizeStudyPlan, type OptimizerEvent } from "@/src/agents/optimizer";
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
      const send = (event: AnalystEvent | OptimizerEvent) => {
        controller.enqueue(encoder.encode(sse(event.type, event)));
      };

      try {
        // ---- Agent 1: Analyst ----
        const analystResult = await analyzeStudyPlan(
          updatedHistory,
          username,
          send,
        );

        // ---- Agent 2: Designer ----

        const studyInfo: ParsedStudyInfo = {
          timeFrameDays: analystResult.studyInfo.timeFrameDays,
          hoursPerDay: analystResult.studyInfo.hoursPerDay,
          studyDays: analystResult.studyInfo.studyDays,
          userCapacity: analystResult.userCapacity,
          username: username,
        };

        const designerOutput = await designStudyPlan(allProblems, studyInfo, send);

        // ---- Agent 3: Optimizer ----
        controller.enqueue(
          encoder.encode(sse("designer_done", {})),
        );
        send({ type: "log", message: "Optimizing for effective learning..." });

        const optimizedPlan = await optimizeStudyPlan(
          designerOutput,
          analystResult.studyInfo,
          analystResult.userCapacity,
          username,
          send,
        );

        updatedHistory.push({
          role: "assistant",
          content: analystResult.reasoning,
        });

        controller.enqueue(
          encoder.encode(
            sse("done", {
              stage: "optimizing",
              reasoning: analystResult.reasoning,
              history: updatedHistory,
              studyInfo: analystResult.studyInfo,
              userCapacity: analystResult.userCapacity,
              plan: optimizedPlan,
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