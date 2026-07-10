"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import AlgoMap from "../components/AlgoMap/AlgoMap";
import AuthModal from "../components/AuthModal/AuthModal";

import type { AlgoProblemsData } from "../utils/fetch-leetcode-data";
import { collectLocalSlugs } from "../utils/fetch-leetcode-data";
import { getSolvedSlugs, canFetch, getLastUsedUsername } from "../utils/solved-cache";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [unsolvedSlugs, setUnsolvedSlugs] = useState<Set<string>>(new Set());

  // Derived from localStorage — no hydration mismatch because the server
  // snapshot returns false, which matches the client's first paint.
  const hasValidCache = useSyncExternalStore(
    () => () => {}, // subscribe — localStorage won't change mid-session
    () => {
      const lastUser = getLastUsedUsername();
      return lastUser ? !canFetch(lastUser) : false;
    },
    () => false, // server snapshot
  );

  // On mount: load display data from persistent cache
  useEffect(() => {
    const lastUser = getLastUsedUsername();
    if (!lastUser) return;

    const slugs = getSolvedSlugs(lastUser);
    if (!slugs) return;

    fetch("/data/algo-problems.json")
      .then((res) => res.json() as Promise<AlgoProblemsData>)
      .then((localData) => {
        const solvedSet = new Set(slugs);
        setUnsolvedSlugs(
          new Set(collectLocalSlugs(localData).filter((s) => !solvedSet.has(s))),
        );
      })
      .catch(() => {
        /* ignore – user can re-fetch via the Update button */
      });
  }, []);

  const handleSolved = (slugs: Set<string>) => {
    setUnsolvedSlugs(slugs);
  };

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
            <p className="text-xl">Visualizing common algorithm problems and their associated topics, frameworks and patterns.</p>
          </div>
        </div>

        {/* First div escapes the `max-w-3xl` constraint by the main layout */}
        <div className="w-screen relative left-1/2 -translate-x-1/2 mb-4">
          {/* Second div prevents svg from getting too wide on huge screen */}
          <div className="max-w-7xl mx-auto px-4">
            <AlgoMap unsolvedSlugs={unsolvedSlugs} />
            <div className="text-center mt-2"><small>Source: <a className="underline decoration-blue-600" href="https://labuladong.online/en/algo">labuladong.online</a></small></div>
          </div>
        </div>

        {/* Update Your Map CTA — only shown when rate limit has reset */}
        {!hasValidCache && (
          <div className="w-full flex justify-center sm:justify-start items-center gap-3 mb-4">
            <p>Want to see how you are doing?</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="cursor-pointer rounded-md bg-blue-600 px-2.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
            >
              Update Your Map
            </button>
          </div>
        )}
      </main>

      <AuthModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSolved={handleSolved}
      />
    </div>
  );
}
