"use client";

import { useState, useEffect, useCallback } from "react";

import type { FetchResult } from "../../utils/fetch-leetcode-data";
import { setSolvedTimestamps, setFetchedToday } from "../../utils/solved-cache";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: (username: string) => void;
}

export default function AuthModal({ isOpen, onClose, onDone }: AuthModalProps) {
  const [username, setUsername] = useState("");
  const [leetcodeCookie, setLeetcodeCookie] = useState("");
  const [cookieTooltipOpen, setCookieTooltipOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Escape key ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // ── Submit logic ────────────────────────────────────────────────────
  const submit = async (useMock: boolean) => {
    setError(null);

    const trimmedUser = (username.trim() || "bytrangle").trim();
    if (useMock) {
      setUsername(trimmedUser);
    }

    if (!useMock && !leetcodeCookie.trim()) {
      setError("LEETCODE_SESSION is required for Sync.");
      return;
    }

    setIsLoading(true);
    try {
      const solvedRes = await fetch("/api/fetch-solved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leetcodeSession: useMock ? "" : leetcodeCookie.trim(),
        }),
      });
      if (!solvedRes.ok) {
        const err = await solvedRes.json().catch(() => ({}));
        setError(err.error || `Error ${solvedRes.status}`);
        return;
      }
      const solvedData: FetchResult = await solvedRes.json();

      // Persist timestamps (always needed for AlgoMap + StudyPlan)
      const timestamps: Record<string, string> = {};
      for (const p of solvedData.solvedProblems) {
        timestamps[p.titleSlug] = p.lastSubmittedAt;
      }
      setSolvedTimestamps(trimmedUser, timestamps);

      // Rate-limit only applies to real syncs, not mock data
      if (!useMock) {
        setFetchedToday(trimmedUser);
      }

      onDone(trimmedUser);
      onClose();
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Check the console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* X close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-50 mb-4 pr-8">
          Sync Your Progress
        </h2>

        <div className="space-y-4">
          {/* Username */}
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-zinc-300"
            >
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="username"
              name="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>

          {/* LEETCODE_SESSION */}
          <div>
            <label
              htmlFor="leetcode_cookie"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-zinc-300"
            >
              LEETCODE_SESSION
              <span className="text-red-500">*</span>
              <span className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setCookieTooltipOpen(true)}
                  onMouseLeave={() => setCookieTooltipOpen(false)}
                  onFocus={() => setCookieTooltipOpen(true)}
                  onBlur={() => setCookieTooltipOpen(false)}
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold leading-none cursor-help dark:bg-zinc-700 dark:text-zinc-300"
                  aria-label="How to get LEETCODE_SESSION"
                >
                  ?
                </button>
                {cookieTooltipOpen && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 block w-64 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-zinc-800 dark:text-zinc-50 z-10">
                    Open dev tools → Application → Storage → Cookies → leetcode.com. Copy the LEETCODE_SESSION value.
                    <span className="absolute left-1/2 -translate-x-1/2 top-full block w-2 h-2 rotate-45 bg-gray-900 dark:bg-zinc-800" />
                  </span>
                )}
              </span>
            </label>
            <input
              type="text"
              required
              id="leetcode_cookie"
              name="leetcode_cookie"
              value={leetcodeCookie}
              onChange={(e) => setLeetcodeCookie(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 leading-relaxed">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={isLoading || !leetcodeCookie.trim()}
            className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isLoading && (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            Sync
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={isLoading}
            className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use Mock Data
          </button>
        </div>
      </div>
    </div>
  );
}
