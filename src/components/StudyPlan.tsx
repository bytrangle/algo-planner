"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SolvedTimestamps, AlgoProblemsData } from "../utils/fetch-leetcode-data";
import { collectLocalSlugs } from "../utils/fetch-leetcode-data";

interface StudyPlanProps {
  solvedTimestamps: SolvedTimestamps | null;
}

interface ParsedStudyInfo {
  timeFrame: string | null;
  hoursPerDay: number | null;
  studyDays: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PlanResponse {
  ok: boolean;
  question: string | null;
  history: ChatMessage[];
  studyInfo: ParsedStudyInfo;
}

const RUMINATING_ICONS = ["•", "★", "∗", "☀", "❄", "◇"];

export default function StudyPlan({ solvedTimestamps }: StudyPlanProps) {
  const [draft, setDraft] = useState("");
  const [allSlugs, setAllSlugs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [done, setDone] = useState(false);
  const [clarificationSent, setClarificationSent] = useState(false);
  const clarificationInputRef = useRef<HTMLSpanElement>(null);

  // Cycle through ruminating icons while submitting
  const [iconIndex, setIconIndex] = useState(0);
  useEffect(() => {
    if (!isSubmitting) return;
    const id = setInterval(() => setIconIndex((i) => (i + 1) % RUMINATING_ICONS.length), 800);
    return () => clearInterval(id);
  }, [isSubmitting]);

  // Derived state
  const needsClarification = history.length === 2 && history[history.length - 1].role === "assistant";
  const lastQuestion = needsClarification ? history[history.length - 1].content : null;

  // Fetch all problem slugs on mount
  useEffect(() => {
    fetch("/data/algo-problems.json")
      .then((r) => r.json())
      .then((data: AlgoProblemsData) => {
        setAllSlugs(collectLocalSlugs(data));
      })
      .catch(() => {});
  }, []);

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim() || isSubmitting) return;

    setIsSubmitting(true);

    const unsolvedProblems = allSlugs.filter(
      (slug) => !(slug in (solvedTimestamps ?? {})),
    );

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          data: { unsolvedProblems, solvedProblems: solvedTimestamps ?? {} },
        }),
      });

      const result: PlanResponse = await res.json();

      setIsSubmitting(false);

      if (result.ok) {
        setDone(true);
        setHistory(result.history);
        setDraft("");
        console.log("Study plan ready:", result.studyInfo);
      } else {
        setHistory(result.history);
      }
    } catch (err) {
      console.error("Failed to send study plan request:", err);
      setIsSubmitting(false);
    }
  }, [history, allSlugs, solvedTimestamps, isSubmitting]);

  const onInitialSubmit = useCallback(() => handleSubmit(draft), [draft, handleSubmit]);

  const onClarificationSubmit = useCallback(() => {
    const el = clarificationInputRef.current;
    if (!el || !el.innerText.trim()) return;
    setClarificationSent(true);
    handleSubmit(el.innerText.trim());
  }, [handleSubmit]);

  return (
    <>
      <h2>Study Plan</h2>
      <p>Tell us your time frame (how long you are going to study) and capacity (number of hours per day and days per week that you can dedicate to studying):.</p>

      {done ? (
        <div className="w-full mt-2 font-mono text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
          {history.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <p key={i}>
                  <span className="select-none">{">>>"}</span> {msg.content}
                </p>
              );
            }
            // Skip the final "Study plan information collected." boilerplate
            if (msg.content === "Study plan information collected.") return null;
            return (
              <p key={i}>
                <span className="select-none">{">"}</span> {msg.content}
              </p>
            );
          })}
        </div>
      ) : (
        <div className="relative w-full mt-2">
          <textarea
            id="study-info"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            disabled={needsClarification || isSubmitting}
            className={`w-full p-4 pr-14 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
            placeholder="e.g., 3 months, 2 hours/day, 5 days/week"
          />

          {needsClarification ? (
            <>
              <div className="mt-2 font-mono text-sm text-zinc-700 dark:text-zinc-300 flex flex-wrap items-start">
                <span className="mr-1 select-none shrink-0">{">"}</span>
                <span className="whitespace-pre-wrap shrink-0">{lastQuestion} </span>
                <span
                  ref={clarificationInputRef}
                  contentEditable={!clarificationSent && !isSubmitting}
                  suppressContentEditableWarning
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onClarificationSubmit();
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData("text/plain");
                    document.execCommand("insertText", false, text);
                  }}
                  className={`bg-transparent border-b outline-none ${
                    clarificationSent
                      ? "border-none text-zinc-500 dark:text-zinc-500 cursor-default"
                      : "border-zinc-400 dark:border-zinc-500 text-zinc-700 dark:text-zinc-300"
                  }`}
                  style={{ minWidth: "20ch", caretShape: clarificationSent ? "auto" : "block" }}
                  spellCheck={false}
                />
              </div>
              {isSubmitting && (
                <p className="mt-3 font-mono text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="inline-block w-[1.2em] text-center">{RUMINATING_ICONS[iconIndex]}</span> Ruminating...
                </p>
              )}
            </>
          ) : (
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
      )}
    </>
  );
}
