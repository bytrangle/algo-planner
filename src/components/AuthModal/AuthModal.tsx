"use client";

import { useState } from "react";

import type { FetchResult, AlgoProblemsData } from "../../utils/fetch-leetcode-data";
import { collectLocalSlugs } from "../../utils/fetch-leetcode-data";
import { setSolvedSlugs, setFetchedToday } from "../../utils/solved-cache";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSolved: (unsolvedSlugs: Set<string>) => void;
}

export default function AuthModal({ isOpen, onClose, onSolved }: AuthModalProps) {
  const [username, setUsername] = useState("");
  const [leetcodeCookie, setLeetcodeCookie] = useState("");
  const [cookieTooltipOpen, setCookieTooltipOpen] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    setUpdateError(null);

    if (!username.trim() || !leetcodeCookie.trim()) {
      setUpdateError("Both fields are required.");
      return;
    }

    const trimmedUser = username.trim();

    setIsUpdating(true);
    try {
      // 1. Fetch solved problems from server-side API route
      const solvedRes = await fetch("/api/fetch-solved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leetcodeSession: leetcodeCookie.trim() }),
      });
      if (!solvedRes.ok) {
        const err = await solvedRes.json().catch(() => ({}));
        setUpdateError(
          err.error || `Error ${solvedRes.status}: failed to fetch solved problems.`,
        );
        return;
      }
      const solvedData: FetchResult = await solvedRes.json();

      // 2. Persist solved slugs (for display) and mark today as fetched (rate limit)
      const slugList = solvedData.solvedProblems.map((p) => p.titleSlug);
      setSolvedSlugs(trimmedUser, slugList);
      setFetchedToday(trimmedUser);

      // 3. Fetch local algo-problems.json for the full slug list
      const localRes = await fetch("/data/algo-problems.json");
      if (!localRes.ok) {
        setUpdateError("Failed to load local problem list.");
        return;
      }
      const localData: AlgoProblemsData = await localRes.json();

      // 4. Compute unsolved problems
      const solvedSlugs = new Set(slugList);
      const unsolved = collectLocalSlugs(localData).filter(
        (slug) => !solvedSlugs.has(slug),
      );

      // 5. Notify parent and close on success
      onSolved(new Set(unsolved));
      onClose();
    } catch (e) {
      console.error(e);
      setUpdateError("Something went wrong. Check the console for details.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-50 mb-4">
          Update Your Map
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

          {/* LEETCODE_COOKIE */}
          <div>
            <label
              htmlFor="leetcode_cookie"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-zinc-300"
            >
              LEETCODE_COOKIE <span className="text-red-500">*</span>
              <span className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setCookieTooltipOpen(true)}
                  onMouseLeave={() => setCookieTooltipOpen(false)}
                  onFocus={() => setCookieTooltipOpen(true)}
                  onBlur={() => setCookieTooltipOpen(false)}
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold leading-none cursor-help dark:bg-zinc-700 dark:text-zinc-300"
                  aria-label="How to get LEETCODE_COOKIE"
                >
                  ?
                </button>
                {cookieTooltipOpen && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 block w-64 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-zinc-800 dark:text-zinc-50 z-10">
                    Open your browser&apos;s developer tools. Click Application tab -&gt; Storage -&gt; Cookies -&gt; https://leetcode.com. Look for cookie named LEETCODE_SESSION and copy/paste its value here.
                    <span className="absolute left-1/2 -translate-x-1/2 top-full block w-2 h-2 rotate-45 bg-gray-900 dark:bg-zinc-800" />
                  </span>
                )}
              </span>
            </label>
            <input
              type="text"
              id="leetcode_cookie"
              name="leetcode_cookie"
              required
              value={leetcodeCookie}
              onChange={(e) => setLeetcodeCookie(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">
              Without this cookie, Leetcode API only allows up to the last 20 submissions.
            </p>
            {updateError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 leading-relaxed">
                {updateError}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isUpdating && (
              <svg
                className="animate-spin h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
