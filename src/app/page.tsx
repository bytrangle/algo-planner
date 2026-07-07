"use client";

import { useState } from "react";
import AlgoMap from "../components/AlgoMap/AlgoMap";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            AlgoMap
          </h1>
          <p>Practice algorithm problems smarter with the power of visualization and AI.</p>
        </div>

        {/* Update Your Map button */}
        <div className="w-full flex justify-center sm:justify-start mt-8 mb-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="cursor-pointer rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            Update Your Map
          </button>
        </div>

        {/* First div escapes the `max-w-3xl` constraint by the main layout */}
        <div className="w-screen relative left-1/2 -translate-x-1/2">
          {/* Second div prevents svg from getting too wide on huge screen */}
          <div className="max-w-7xl mx-auto px-4 pb-16">
            <AlgoMap />
          </div>
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
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
              </div>

              {/* LEETCODE_COOKIE */}
              <div>
                <label
                  htmlFor="leetcode_cookie"
                  className="block text-sm font-medium text-gray-700 dark:text-zinc-300"
                >
                  LEETCODE_COOKIE <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="leetcode_cookie"
                  name="leetcode_cookie"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">
                  Without this cookie, Leetcode API only allows up to the last 20 submissions. Open your browser's developer tools. Click Application tab -&gt; Storage -&gt; Cookies -&gt; https://leetcode.com. Look for cookie named LEETCODE_SESSION and copy/paste its value here.
                </p>
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
                onClick={() => {
                  // Does nothing for now
                }}
                className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
