"use client";

import { useState, useCallback } from "react";
import AlgoMap from "../components/AlgoMap/AlgoMap";

interface SolvedResponse {
  username: string;
  total_solved: number;
  solved_slugs: string[];
  solved: Array<{
    title_slug: string;
    title: string;
    timestamp?: string;
  }>;
}

interface ProblemDef {
  id: number;
  slug: string;
  title: string;
  url: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

interface AlgoProblemsData {
  topics: Array<{
    topic: string;
    slug: string;
    frameworks?: Array<{
      framework: string;
      slug: string;
      problems: ProblemDef[];
    }>;
    problems?: ProblemDef[];
    problem_series?:
      | Array<{ name: string; slug: string; problems: ProblemDef[] }>
      | { name: string; slug: string; problems: ProblemDef[] };
  }>;
}

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [leetcodeCookie, setLeetcodeCookie] = useState("");
  const [cookieTooltipOpen, setCookieTooltipOpen] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [unsolvedSlugs, setUnsolvedSlugs] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = useCallback(async () => {
    setUpdateError(null);

    if (!username.trim() || !leetcodeCookie.trim()) {
      setUpdateError("Both fields are required.");
      return;
    }

    setIsUpdating(true);
    try {
      // 1. Fetch solved problems from LeetCode API
      const solvedRes = await fetch(
        `https://leetcode-api-pied.vercel.app/user/${encodeURIComponent(
          username.trim()
        )}/solved?x_leetcode_session=${encodeURIComponent(
          leetcodeCookie.trim()
        )}`
      );
      if (!solvedRes.ok) {
        const err = await solvedRes.json().catch(() => ({}));
        setUpdateError(err.detail || `Error ${solvedRes.status}: failed to fetch solved problems.`);
        return;
      }
      const solvedData: SolvedResponse = await solvedRes.json();
      const solvedSlugs = new Set(solvedData.solved_slugs);

      // 2. Fetch local algo-problems.json
      const localRes = await fetch("/data/algo-problems.json");
      if (!localRes.ok) {
        setUpdateError("Failed to load local problem list.");
        return;
      }
      const localData: AlgoProblemsData = await localRes.json();

      // 3. Collect all local problem slugs
      const allLocalSlugs: string[] = [];
      for (const topic of localData.topics) {
        if (topic.frameworks) {
          for (const fw of topic.frameworks) {
            for (const p of fw.problems) {
              allLocalSlugs.push(p.slug);
            }
          }
        }
        if (topic.problems) {
          for (const p of topic.problems) {
            allLocalSlugs.push(p.slug);
          }
        }
        if (topic.problem_series) {
          const series = Array.isArray(topic.problem_series)
            ? topic.problem_series
            : [topic.problem_series];
          for (const s of series) {
            for (const p of s.problems) {
              allLocalSlugs.push(p.slug);
            }
          }
        }
      }

      // 4. Compute unsolved problems
      const unsolved = allLocalSlugs.filter((slug) => !solvedSlugs.has(slug));

      // 5. Update state and close modal on success
      setUnsolvedSlugs(new Set(unsolved));
      setIsModalOpen(false);
    } catch (e) {
      console.error(e);
      setUpdateError("Something went wrong. Check the console for details.");
    } finally {
      setIsUpdating(false);
    }
  }, [username, leetcodeCookie]);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <div className='mb-4'>
            <h1 className="max-w-xs text-4xl font-semibold font-mono leading-10 tracking-tight text-black dark:text-zinc-50">
              AlgoMap
            </h1>
            <p>Practice algorithm problems smarter with the power of visualization and AI.</p>
          </div>
          <div className="mb-3">
            <p className="text-xl">Visualizing all the problems mentioned on <a href="https://labuladong.online/en/algo" className="underline decoration-blue-600">labuladong</a> website and the topics, frameworks and patterns they belong to.</p>
          </div>
        </div>

        {/* First div escapes the `max-w-3xl` constraint by the main layout */}
        <div className="w-screen relative left-1/2 -translate-x-1/2 mb-4">
          {/* Second div prevents svg from getting too wide on huge screen */}
          <div className="max-w-7xl mx-auto px-4">
            <AlgoMap unsolvedSlugs={unsolvedSlugs} />
          </div>
        </div>

        {/* Update Your Map button */}
        <div className="w-full flex justify-center sm:justify-start mb-4">
          <button
            onClick={() => {
              setUpdateError(null);
              setIsModalOpen(true);
            }}
            className="cursor-pointer rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            Update Your Map
          </button>
        </div>
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setIsModalOpen(false)}
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
                        Open your browser's developer tools. Click Application tab -&gt; Storage -&gt; Cookies -&gt; https://leetcode.com. Look for cookie named LEETCODE_SESSION and copy/paste its value here.
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
                onClick={() => setIsModalOpen(false)}
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
      )}
    </div>
  );
}
