"use client";

import { useState, useCallback, useRef } from "react";
import type { ProblemWithTopic } from "../utils/flatten-problems";
import type { StudyPlanParams, UserCapacity } from "../agents/analyst";
import type { OptimizedPlan } from "../agents/optimizer";
import ReasoningPanel from "./ReasoningPanel";
import { CalendarMonth, groupDaysByMonth } from "./StudyCalendar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type PlanStage =
  | { stage: "optimizing"; reasoning: string; history: ChatMessage[]; studyInfo: StudyPlanParams; userCapacity: UserCapacity; plan: OptimizedPlan };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudyPlan({
  username,
  unsolvedProblems,
  solvedProblems,
}: {
  username: string;
  unsolvedProblems: ProblemWithTopic[];
  solvedProblems: (ProblemWithTopic & { lastSolvedAt: string })[];
}) {
  const [draft, setDraft] = useState("");
  const [sentText, setSentText] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<PlanStage | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const phaseRef = useRef<"analyst" | "designer" | "optimizer">("analyst");
  const [agentPhase, setAgentPhase] = useState<"analyst" | "designer" | "optimizer">("analyst");

  const [analystThinkingLogs, setAnalystThinkingLogs] = useState<string[]>([]);
  const [analystReasoning, setAnalystReasoning] = useState<string | null>(null);
  const [designerThinkingLogs, setDesignerThinkingLogs] = useState<string[]>([]);
  const [designerReasoning, setDesignerReasoning] = useState<string | null>(null);
  const [optimizerThinkingLogs, setOptimizerThinkingLogs] = useState<string[]>([]);
  const [optimizerReasoning, setOptimizerReasoning] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      setIsSubmitting(true);
      setStreaming(true);
      setSentText(text);
      setSent(true);

      // Reset
      setHistory([]);
      setResult(null);
      setAnalystThinkingLogs([]);
      setAnalystReasoning(null);
      setDesignerThinkingLogs([]);
      setDesignerReasoning(null);
      setOptimizerThinkingLogs([]);
      setOptimizerReasoning(null);
      setAgentPhase("analyst");
      phaseRef.current = "analyst";

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
        let buf = "";
        let eventType = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const payload = JSON.parse(data);
                switch (eventType) {
                  case "log": {
                    if (phaseRef.current === "analyst") {
                      setAnalystThinkingLogs((prev) => [...prev, payload.message]);
                    } else if (phaseRef.current === "designer") {
                      setDesignerThinkingLogs((prev) => [...prev, payload.message]);
                    } else {
                      setOptimizerThinkingLogs((prev) => [...prev, payload.message]);
                    }
                    break;
                  }
                  case "content_delta": {
                    if (phaseRef.current === "analyst") {
                      setAnalystReasoning((prev) => (prev ?? "") + payload.text);
                    } else if (phaseRef.current === "designer") {
                      setDesignerReasoning((prev) => (prev ?? "") + payload.text);
                    } else {
                      setOptimizerReasoning((prev) => (prev ?? "") + payload.text);
                    }
                    break;
                  }
                  case "analyst_done": {
                    phaseRef.current = "designer";
                    setAgentPhase("designer");
                    setAnalystReasoning(payload.reasoning || null);
                    break;
                  }
                  case "designer_done": {
                    phaseRef.current = "optimizer";
                    setAgentPhase("optimizer");
                    break;
                  }
                  case "done": {
                    setResult(payload);
                    setHistory(payload.history);
                    setStreaming(false);
                    setIsSubmitting(false);
                    break;
                  }
                  case "error": {
                    setStreaming(false);
                    setIsSubmitting(false);
                    console.error("Stream error:", payload.message);
                    break;
                  }
                }
                eventType = "";
              } catch { /* skip malformed JSON */ }
            }
          }
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setStreaming(false);
        setIsSubmitting(false);
      }
    },
    [history, username, unsolvedProblems, solvedProblems],
  );

  // ---------------------------------------------------------------------------
  // Submit handlers
  // ---------------------------------------------------------------------------

  const onInitialSubmit = useCallback(() => {
    if (!draft.trim() || isSubmitting) return;
    sendMessage(draft.trim());
    setDraft("");
  }, [draft, isSubmitting, sendMessage]);

  const isOptimizing = result?.stage === "optimizing";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full mt-2">
      <h2>Study Plan</h2>
      <p className="mt-1">
        In order to craft the best possible plan, please share your study preferences.{" "}
        <em>How long</em> are you going to study? <em>How many hours</em> you can
        practice per day? Do you want <em>days off</em>? If you don&apos;t know, no
        worry. We&apos;ll make it work.
      </p>

      {/* Textarea / sent text */}
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
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="font-mono mt-3 space-y-1 text-blue-700 dark:text-blue-300">
          {sentText && (
            <p>
              <span className="select-none mr-2">{">"}</span>
              {sentText}
            </p>
          )}
        </div>
      )}

      {/* Analyst Reasoning */}
      <ReasoningPanel
        label="Analyst Reasoning"
        reasoning={analystReasoning}
        thinkingLogs={analystThinkingLogs}
        streaming={streaming && agentPhase === "analyst"}
      />

      {/* Designer Reasoning */}
      <ReasoningPanel
        label="Designer Reasoning"
        reasoning={designerReasoning}
        thinkingLogs={designerThinkingLogs}
        streaming={streaming && agentPhase === "designer"}
      />

      {/* Optimizer Reasoning */}
      {agentPhase === "optimizer" && (
        <ReasoningPanel
          label="Optimizer Reasoning"
          reasoning={optimizerReasoning}
          thinkingLogs={optimizerThinkingLogs}
          streaming={streaming}
        />
      )}

      {/* Final result: summary + calendar */}
      {isOptimizing && (
        <FinalResult plan={result.plan} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final result sub-component
// ---------------------------------------------------------------------------

function FinalResult({ plan }: { plan: OptimizedPlan }) {
  const monthGroups = groupDaysByMonth(plan.plan);
  const [activeMonth, setActiveMonth] = useState(0);
  const current = monthGroups[activeMonth];

  return (
    <div className="mt-6 space-y-6">
      {/* Summary */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Plan Summary</h3>
        <div className="grid grid-cols-5 gap-2 text-sm text-center">
          <div><div className="text-2xl font-bold">{plan.summary.totalProblems}</div><div className="text-zinc-500 text-xs">Problems</div></div>
          <div><div className="text-2xl font-bold">{plan.summary.essentialCount}</div><div className="text-zinc-500 text-xs">Essential</div></div>
          <div><div className="text-2xl font-bold">{plan.summary.extraCount}</div><div className="text-zinc-500 text-xs">Extra</div></div>
          <div><div className="text-2xl font-bold">{plan.summary.totalDays}</div><div className="text-zinc-500 text-xs">Days</div></div>
          <div><div className="text-2xl font-bold">{plan.summary.totalHours}</div><div className="text-zinc-500 text-xs">Hours</div></div>
        </div>
      </div>

      {/* Recap: rationale behind distribution & reordering */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 space-y-4">
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Why This Plan</h4>

        {/* Designer rationale */}
        {plan.rationale && (
          <div>
            <h5 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Difficulty Distribution &amp; Core Topics
            </h5>
            <p className="leading-relaxed whitespace-pre-line">
              {plan.rationale}
            </p>
          </div>
        )}

        {/* Optimizer rationale */}
        {plan.optimizations?.skillBasedAdjustments && (
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <h5 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Problem Ordering &amp; Skill Weakness
            </h5>
            <p className="leading-relaxed whitespace-pre-line">
              {plan.optimizations.skillBasedAdjustments}
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Easy
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Medium
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Hard
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 opacity-50" />
          <span className="opacity-50">Extra</span>
        </div>
      </div>

      {/* Calendar */}
      <div>
        <h3 className="mb-4">Study Calendar</h3>

        {current && (
          <div className="w-screen relative left-1/2 -translate-x-1/2">
            <div className="max-w-[1600px] mx-auto px-4">
              <CalendarMonth 
                monthGroup={current}
                onPrevMonth={monthGroups.length > 1 ? () => setActiveMonth((m) => m - 1) : undefined}
                onNextMonth={monthGroups.length > 1 ? () => setActiveMonth((m) => m + 1) : undefined}
                canGoPrev={activeMonth > 0}
                canGoNext={activeMonth < monthGroups.length - 1}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}