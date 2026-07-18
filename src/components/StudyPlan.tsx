"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProblemWithTopic } from "../utils/flatten-problems";
import type { StudyPlanParams, UserCapacity } from "../agents/analyst";
import type { OptimizedPlan } from "../agents/optimizer";
import ReasoningPanel from "./ReasoningPanel";
import OptimizedPlanView from "./OptimizedPlanView";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StudyPlanProps {
  username: string;
  unsolvedProblems: ProblemWithTopic[];
  solvedProblems: (ProblemWithTopic & { lastSolvedAt: string })[];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type PlanStage =
  | { stage: "analyzing"; question: string; reasoning: string; conflictExplanation: string | null; history: ChatMessage[]; studyInfo: Partial<StudyPlanParams> }
  | { stage: "optimizing"; reasoning: string; history: ChatMessage[]; studyInfo: StudyPlanParams; userCapacity: UserCapacity; plan: OptimizedPlan };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUMINATING_ICONS = ["•", "★", "∗", "☀", "❄", "◇"];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function StudyPlan({
  username,
  unsolvedProblems,
  solvedProblems,
}: StudyPlanProps) {
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [analystThinkingLogs, setAnalystThinkingLogs] = useState<string[]>([]);
  const [analystReasoning, setAnalystReasoning] = useState<string | null>(null);
  const [optimizerThinkingLogs, setOptimizerThinkingLogs] = useState<string[]>([]);
  const [optimizerReasoning, setOptimizerReasoning] = useState<string | null>(null);
  const [result, setResult] = useState<PlanStage | null>(null);
  const [sent, setSent] = useState(false);
  const [isReplyCall, setIsReplyCall] = useState(false);

  // Saved from the first call's analyzing stage, so we can show it
  // in the final optimizing view.
  const [savedAnalysis, setSavedAnalysis] = useState<{
    question: string;
    conflictExplanation: string | null;
  } | null>(null);

  const [iconIndex, setIconIndex] = useState(0);
  useEffect(() => {
    if (!isSubmitting) return;
    const id = setInterval(
      () => setIconIndex((i) => (i + 1) % RUMINATING_ICONS.length),
      800,
    );
    return () => clearInterval(id);
  }, [isSubmitting]);

  const isAnalyzing = result?.stage === "analyzing";
  const isOptimizing = result?.stage === "optimizing";

  // ---------------------------------------------------------------------------
  // API call — SSE streaming
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isSubmitting) return;
      setIsSubmitting(true);
      setStreaming(true);
      setResult(null);

      // Route reasoning to the correct state group
      const isReply = sent; // already sent initial msg → this is a reply
      setIsReplyCall(isReply);
      if (isReply) {
        setOptimizerThinkingLogs([]);
        setOptimizerReasoning(null);
      } else {
        setAnalystThinkingLogs([]);
        setAnalystReasoning(null);
      }

      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history,
            username,
            data: { unsolvedProblems, solvedProblems },
          }),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const payload = JSON.parse(line.slice(6));
              switch (eventType) {
                case "log":
                  if (isReply) {
                    setOptimizerThinkingLogs((prev) => [...prev, payload.message]);
                  } else {
                    setAnalystThinkingLogs((prev) => [...prev, payload.message]);
                  }
                  break;
                case "content_delta":
                  if (isReply) {
                    setOptimizerReasoning((prev) => (prev ?? "") + payload.text);
                  } else {
                    setAnalystReasoning((prev) => (prev ?? "") + payload.text);
                  }
                  break;
                case "done":
                  setResult(payload);
                  setHistory(payload.history);
                  setStreaming(false);
                  setSent(true);
                  // Capture Analyst's question for the final chronological view
                  if (payload.stage === "analyzing") {
                    setSavedAnalysis({
                      question: payload.question,
                      conflictExplanation: payload.conflictExplanation,
                    });
                  }
                  break;
                case "error":
                  setStreaming(false);
                  console.error("Stream error:", payload.message);
                  break;
              }
              eventType = "";
            }
          }
        }
      } catch (err) {
        console.error("Failed to send study plan request:", err);
        setStreaming(false);
      } finally {
        setIsSubmitting(false);
        setReply("");
      }
    },
    [history, username, unsolvedProblems, solvedProblems, isSubmitting, sent],
  );

  const onInitialSubmit = useCallback(() => {
    if (!draft.trim()) return;
    sendMessage(draft);
  }, [draft, sendMessage]);

  const onReplySubmit = useCallback(() => {
    if (!reply.trim()) return;
    sendMessage(reply);
  }, [reply, sendMessage]);

  // ---------------------------------------------------------------------------
  // Render: Optimized Plan (Final stage with calendar)
  // ---------------------------------------------------------------------------

  if (isOptimizing && result?.stage === "optimizing") {
    return (
      <OptimizedPlanView
        studyInfo={result.studyInfo}
        userCapacity={result.userCapacity}
        plan={result.plan}
        history={history}
        analystReasoning={analystReasoning}
        analystThinkingLogs={analystThinkingLogs}
        optimizerReasoning={optimizerReasoning}
        optimizerThinkingLogs={optimizerThinkingLogs}
        analystQuestion={savedAnalysis?.question ?? null}
        conflictExplanation={savedAnalysis?.conflictExplanation ?? null}
        streaming={streaming}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Input
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full mt-2">
        <h2>Study Plan</h2>
        <p className="mt-1">
          In order to craft the best possible plan, please share your study preferences. <em>How long </em>are you going to study? <em>How many hours </em>you can practice per day? Do you want <em>days off</em>? If you don&apos;t know, no worry. We&apos;ll make it work.
        </p>

        {/* User messages — textarea before send, plain text after */}
        {!sent ? (
          <div className="relative w-full mt-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              disabled={isSubmitting}
              className="w-full p-4 pr-14 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              placeholder="Give me a plan for..."
            />
            <button
              onClick={onInitialSubmit}
              disabled={!draft.trim() || isSubmitting}
              className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center text-white shadow-lg transition-colors cursor-pointer"
              aria-label="Submit"
            >
              {isSubmitting ? (
                <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                </svg>
              )}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-1 font-mono text-sm">
            {history
              .filter((m) => m.role === "user")
              .map((m, i) => (
                <p key={i} className="text-zinc-700 dark:text-zinc-300">
                  <span className="select-none text-zinc-400 dark:text-zinc-500 mr-2">{">"}</span>
                  {m.content}
                </p>
              ))}
          </div>
        )}

        {/* Analyst Reasoning */}
        {!isReplyCall && (
          <ReasoningPanel
            label="Analyst Reasoning"
            reasoning={analystReasoning}
            thinkingLogs={analystThinkingLogs}
            streaming={streaming}
          />
        )}

        {/* Analyst response: question + reply input */}
        {isAnalyzing && result?.stage === "analyzing" && (
          <div className="mt-4 space-y-3">
            {result.conflictExplanation && (
              <p className="text-amber-700 dark:text-amber-300">{result.conflictExplanation}</p>
            )}
            <p className="font-medium text-zinc-800 dark:text-zinc-200">{result.question}</p>

            <div className="flex gap-2">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onReplySubmit(); }}
                disabled={isSubmitting}
                placeholder='e.g. "yes", "stick to my plan", "Mon-Fri"...'
                className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                onClick={onReplySubmit}
                disabled={!reply.trim() || isSubmitting}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-sm font-medium text-white transition-colors cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="inline-block w-[1em] text-center">{RUMINATING_ICONS[iconIndex]}</span>
                ) : (
                  "Send"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
