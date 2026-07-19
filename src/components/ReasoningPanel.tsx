// ---------------------------------------------------------------------------
// ReasoningPanel — collapsible streaming reasoning display
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from "react";

function fmtElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface ReasoningPanelProps {
  /** Heading label, e.g. "Analyst Reasoning" */
  label: string;
  /** Accumulated reasoning text from content_delta events */
  reasoning: string | null;
  /** Raw thinking-log entries from the LLM */
  thinkingLogs: string[];
  /** Whether the parent is currently streaming — enables shimmer */
  streaming: boolean;
  /** Optional extra className on the wrapper <div> */
  className?: string;
  /** Frozen elapsed time (seconds) — used when a panel is preserved after streaming stops */
  frozenElapsed?: number;
}

export default function ReasoningPanel({
  label,
  reasoning,
  thinkingLogs,
  streaming,
  className,
  frozenElapsed,
}: ReasoningPanelProps) {
  const [open, setOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (streaming) {
      startRef.current = Date.now();
      const id = setInterval(() => {
        if (startRef.current != null) {
          setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
        }
      }, 200);
      return () => clearInterval(id);
    }
    // Streaming stopped — leave elapsed at its final value
  }, [streaming]);

  const hasContent = reasoning || thinkingLogs.length > 0;
  if (!streaming && !hasContent) return null;

  return (
    <div className={className ?? "mt-4 space-y-2"}>
      {/* Header */}
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full cursor-pointer select-none"
        role="button"
        aria-expanded={open}
      >
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2l2.5 7.5H22l-6 4.5 2.5 7.5L12 17l-6.5 4.5L8 14l-6-4.5h7.5z" />
          <circle cx="7" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="18" cy="6" r="0.8" fill="currentColor" stroke="none" />
        </svg>
        <span
          className={
            streaming
              ? "font-medium bg-clip-text text-transparent bg-gradient-to-r from-zinc-300 via-zinc-800 to-zinc-300 dark:from-zinc-600 dark:via-zinc-200 dark:to-zinc-600 bg-[length:200%_100%] animate-[shimmer_2.5s_linear_infinite]"
              : "text-zinc-600 dark:text-zinc-400"
          }
        >
          {label}
        </span>
        {(elapsed > 0 || (frozenElapsed ?? 0) > 0) && (
          <span className="tabular-nums ml-1">
            {fmtElapsed(frozenElapsed ?? elapsed)}
          </span>
        )}
        <svg
          className={`w-3.5 h-3.5 shrink-0 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </div>

      {/* Body — only when open. Thinking first (arrives first), then reasoning. */}
      {open && (
        <div className="mt-2 pl-5">
          {thinkingLogs.length > 0 && (
            <details className="mb-2">
              <summary className="text-sm cursor-pointer">
                Thinking…
              </summary>
              <pre className="mt-1 font-mono text-xs max-h-40 overflow-y-auto whitespace-pre-wrap">
                {thinkingLogs.join("")}
              </pre>
            </details>
          )}

          {reasoning && (
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
              {reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
