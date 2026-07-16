"use client";

import { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import AlgoMap from "../components/AlgoMap/AlgoMap";
import AuthModal from "../components/AuthModal/AuthModal";
import StudyPlan from "../components/StudyPlan";

import type { SolvedTimestamps, AlgoProblemsData } from "../utils/fetch-leetcode-data";
import { flattenAlgoData, type ProblemWithTopic } from "../utils/flatten-problems";
import { getSolvedTimestamps, canFetch, getLastUsedUsername } from "../utils/solved-cache";

// Module-level cached snapshots so useSyncExternalStore sees stable
// references on successive calls, avoiding the infinite-loop detection.
let _tsCache: SolvedTimestamps | null = null;
let _tsCached = false;
let _cacheValid = false;

function getTimestampsSnapshot(): SolvedTimestamps | null {
  if (_tsCached) return _tsCache;
  const lastUser = getLastUsedUsername();
  _tsCache = lastUser ? getSolvedTimestamps(lastUser) : null;
  _tsCached = true;
  return _tsCache;
}

function getHasValidCacheSnapshot(): boolean {
  if (_cacheValid) return true;
  const lastUser = getLastUsedUsername();
  _cacheValid = lastUser ? !canFetch(lastUser) : false;
  return _cacheValid;
}

// Trigger manually when AuthModal writes to localStorage,
// causing React to re-render with fresh data
function notifyStorageChange() {
  _tsCached = false;
  _cacheValid = false;
  window.dispatchEvent(new Event("algomap-storage-change"));
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("algomap-storage-change", onStoreChange);
  return () => window.removeEventListener("algomap-storage-change", onStoreChange);
}

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allProblems, setAllProblems] = useState<ProblemWithTopic[]>([]);
  const solvedTimestamps = useSyncExternalStore(
    subscribe,
    getTimestampsSnapshot,
    () => null, // server snapshot — always null/false avoids hydration mismatch
  );

  const hasValidCache = useSyncExternalStore(
    subscribe,
    getHasValidCacheSnapshot,
    () => false,
  );

  // Fetch and flatten problem data once
  useEffect(() => {
    fetch("/data/algo-problems.json")
      .then((r) => r.json())
      .then((data: AlgoProblemsData) => setAllProblems(flattenAlgoData(data)))
      .catch(() => {});
  }, []);

  // Split problems into unsolved and solved (with timestamps)
  const { unsolvedProblems, solvedProblems } = useMemo(() => {
    const unsolved: ProblemWithTopic[] = [];
    const solved: (ProblemWithTopic & { lastSolvedAt: string })[] = [];
    if (solvedTimestamps) {
      for (const p of allProblems) {
        const ts = solvedTimestamps[p.slug];
        if (ts) {
          solved.push({ ...p, lastSolvedAt: ts });
        } else {
          unsolved.push(p);
        }
      }
    } else {
      unsolved.push(...allProblems);
    }
    return { unsolvedProblems: unsolved, solvedProblems: solved };
  }, [allProblems, solvedTimestamps]);

  const handleSolved = () => {
    notifyStorageChange();
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black overflow-x-hidden">
      <main className="flex flex-1 w-full max-w-3xl xl:max-w-[896px] flex-col items-center justify-between py-32 px-8 sm:px-12 lg:px-16 sm:items-start">
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
          <div className="max-w-[1600px] mx-auto px-4">
            <AlgoMap solvedTimestamps={solvedTimestamps} />
            <div className="text-center mt-2"><small>Problems are mentioned on <a className="underline decoration-blue-600" href="https://labuladong.online/en/algo">labuladong.online</a></small></div>
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
        {/* Chat agent component */}
        <div>
          <StudyPlan unsolvedProblems={unsolvedProblems} solvedProblems={solvedProblems} />
        </div>
      </main>

      <AuthModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSolved={handleSolved}
      />
    </div>
  );
}
