// ---------------------------------------------------------------------------
// ReasoningPanel — collapsible streaming reasoning display
// ---------------------------------------------------------------------------

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
}

export default function ReasoningPanel({
  label,
  reasoning,
  thinkingLogs,
  streaming,
  className,
}: ReasoningPanelProps) {
  const hasContent = reasoning || thinkingLogs.length > 0;
  if (!streaming && !hasContent) return null;

  return (
    <div className={className ?? "mt-4 space-y-2"}>
      <details open={streaming}>
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center gap-1.5">
          <div
            className={
              streaming
                ? "shimmer-text font-medium"
                : "text-zinc-600 dark:text-zinc-400"
            }
          >
            <svg
              className="w-4 h-4 shrink-0 inline"
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
            {" "}{label}
          </div>
          <svg
            className={`w-3.5 h-3.5 shrink-0 ml-auto transition-transform ${streaming ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </summary>

        {reasoning && (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            {reasoning}
          </p>
        )}

        {thinkingLogs.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer">
              Thinking…
            </summary>
            <div className="mt-1 space-y-0.5 font-mono text-[11px] text-zinc-400 dark:text-zinc-500 max-h-40 overflow-y-auto">
              {thinkingLogs.map((log, i) => (
                <p key={i}>{log}</p>
              ))}
            </div>
          </details>
        )}
      </details>
    </div>
  );
}
