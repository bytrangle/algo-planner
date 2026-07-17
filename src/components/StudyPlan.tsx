"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProblemWithTopic } from "../utils/flatten-problems";
import type { StudyPlanParams, UserCapacity } from "../agents/analyst";
import type { DesignerOutput } from "../agents/designer";

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
  | { stage: "designing"; reasoning: string; history: ChatMessage[]; studyInfo: StudyPlanParams; userCapacity: UserCapacity; plan: DesignerOutput };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUMINATING_ICONS = ["•", "★", "∗", "☀", "❄", "◇"];
const dayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// Component
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
  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [result, setResult] = useState<PlanStage | null>(null);
  const [sent, setSent] = useState(false);

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
  const isDesigning = result?.stage === "designing";

  // ---------------------------------------------------------------------------
  // API call — SSE streaming
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isSubmitting) return;
      setIsSubmitting(true);
      setStreaming(true);
      setThinkingLogs([]);
      setReasoning(null);
      setResult(null);

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
                  setThinkingLogs((prev) => [...prev, payload.message]);
                  break;
                case "content_delta":
                  setReasoning((prev) => (prev ?? "") + payload.text);
                  break;
                case "done":
                  setResult(payload);
                  setHistory(payload.history);
                  setStreaming(false);
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
    [history, username, unsolvedProblems, solvedProblems, isSubmitting],
  );

  const onInitialSubmit = useCallback(() => {
    if (!draft.trim()) return;
    setSent(true);
    sendMessage(draft);
  }, [draft, sendMessage]);

  const onReplySubmit = useCallback(() => {
    if (!reply.trim()) return;
    sendMessage(reply);
  }, [reply, sendMessage]);

  // ---------------------------------------------------------------------------
  // Render: Plan (Designing stage)
  // ---------------------------------------------------------------------------

  if (isDesigning && result?.stage === "designing") {
    const { studyInfo, userCapacity, plan } = result;
    return (
      <div className="w-full mt-4 space-y-6">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 space-y-3">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Your Study Plan</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{result.reasoning}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
              <div className="text-zinc-500 dark:text-zinc-400">Timeframe</div>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">{studyInfo.timeFrameDays} days</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
              <div className="text-zinc-500 dark:text-zinc-400">Hours/day</div>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">{studyInfo.hoursPerDay}h</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
              <div className="text-zinc-500 dark:text-zinc-400">Study Days</div>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">{studyInfo.studyDays.map((d) => dayOrder[d]).join(", ")}</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
              <div className="text-zinc-500 dark:text-zinc-400">Problems</div>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">{plan.summary.totalProblems}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Velocity: {userCapacity.weeklyVelocity.toFixed(1)} probs/week</span>
            {userCapacity.isAggressiveTimeline && <span className="text-amber-600 dark:text-amber-400 font-medium">Aggressive timeline</span>}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Summary</h4>
          <div className="grid grid-cols-5 gap-2 text-sm text-center">
            <div><div className="text-2xl font-bold text-blue-600">{plan.summary.totalProblems}</div><div className="text-zinc-500 text-xs">Problems</div></div>
            <div><div className="text-2xl font-bold text-green-600">{plan.summary.essentialCount}</div><div className="text-zinc-500 text-xs">Essential</div></div>
            <div><div className="text-2xl font-bold text-amber-600">{plan.summary.extraCount}</div><div className="text-zinc-500 text-xs">Extra</div></div>
            <div><div className="text-2xl font-bold text-purple-600">{plan.summary.totalDays}</div><div className="text-zinc-500 text-xs">Days</div></div>
            <div><div className="text-2xl font-bold text-rose-600">{plan.summary.totalHours}</div><div className="text-zinc-500 text-xs">Hours</div></div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Daily Schedule</h4>
          <div className="max-h-[500px] overflow-y-auto space-y-2">
            {plan.plan.filter((d) => d.essential.length > 0 || d.extra.length > 0).map((day, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <div className="w-20 shrink-0 text-right">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{day.dayOfWeek.slice(0, 3)}</div>
                  <div className="text-xs font-mono text-zinc-400 dark:text-zinc-500">{day.date.slice(5)}</div>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  {day.essential.map((p, j) => (
                    <div key={`e-${j}`} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-[10px] font-bold flex items-center justify-center shrink-0">E</span>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate">{p.title}</a>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${p.difficulty === "Easy" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : p.difficulty === "Medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"}`}>{p.difficulty}</span>
                    </div>
                  ))}
                  {day.extra.map((p, j) => (
                    <div key={`x-${j}`} className="flex items-center gap-2 text-sm opacity-60">
                      <span className="w-5 h-5 rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-[10px] font-bold flex items-center justify-center shrink-0">X</span>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate">{p.title}</a>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${p.difficulty === "Easy" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : p.difficulty === "Medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"}`}>{p.difficulty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <details className="text-xs text-zinc-500 dark:text-zinc-400">
          <summary className="cursor-pointer">Conversation log</summary>
          <div className="mt-2 space-y-1 font-mono">
            {history.map((msg, i) => (
              <p key={i} className={msg.role === "user" ? "text-blue-600" : "text-zinc-500"}>
                <span className="select-none">{msg.role === "user" ? ">>>" : ">"}</span>{" "}
                {msg.content.slice(0, 200)}{msg.content.length > 200 ? "…" : ""}
              </p>
            ))}
          </div>
        </details>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Input
  // ---------------------------------------------------------------------------

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: 0% 0; }
        }
        .shimmer-text {
          background-image: linear-gradient(90deg,
            rgba(156, 163, 175, 0.4) calc(50% - 8px),
            rgba(55, 65, 81, 1) 50%,
            rgba(156, 163, 175, 0.4) calc(50% + 8px));
          background-size: 250% 100%;
          background-repeat: no-repeat;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          color: transparent;
          animation: shimmer 2.5s linear infinite;
        }
        @media (prefers-color-scheme: dark) {
          .shimmer-text {
            background-image: linear-gradient(90deg,
              rgba(107, 114, 128, 0.4) calc(50% - 8px),
              rgba(209, 213, 219, 1) 50%,
              rgba(107, 114, 128, 0.4) calc(50% + 8px));
          }
        }
      `}</style>

      <div className="w-full mt-2">
        <h2>Study Plan</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Tell us your time frame and capacity — e.g. &ldquo;3 months, 2 hours/day, Mon&ndash;Fri&rdquo;.
        </p>

        {/* Textarea — disabled after first send */}
        <div className="relative w-full mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            disabled={sent || isSubmitting}
            className="w-full p-4 pr-14 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Give me a plan for..."
          />

          {(!sent || isSubmitting) && (
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
          )}
        </div>

        {/* Streaming: Reasoning toggle + thinking logs */}
        {(streaming || reasoning) && (
          <div className="mt-4 space-y-2">
            <details open={streaming}>
              <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center gap-1.5">
                <div className={streaming ? "shimmer-text font-medium" : "text-zinc-600 dark:text-zinc-400"}>
                  <svg className="w-4 h-4 shrink-0 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.5 7.5H22l-6 4.5 2.5 7.5L12 17l-6.5 4.5L8 14l-6-4.5h7.5z" />
                    <circle cx="7" cy="8" r="1" fill="currentColor" stroke="none" />
                    <circle cx="18" cy="6" r="0.8" fill="currentColor" stroke="none" />
                  </svg>
                  {" "}Reasoning
                </div>
                <svg className={`w-3.5 h-3.5 shrink-0 ml-auto transition-transform ${streaming ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </summary>
              {reasoning && (
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{reasoning}</p>
              )}
              {thinkingLogs.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer">Thinking…</summary>
                  <div className="mt-1 space-y-0.5 font-mono text-[11px] text-zinc-400 dark:text-zinc-500 max-h-40 overflow-y-auto">
                    {thinkingLogs.map((log, i) => (
                      <p key={i}>{log}</p>
                    ))}
                  </div>
                </details>
              )}
            </details>
          </div>
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
    </>
  );
}
