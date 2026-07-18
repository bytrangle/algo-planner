import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  fetchSolvedProblems,
  collectAllSlugs,
  type AlgoProblemsData,
  type FetchResult,
} from "../../../utils/fetch-leetcode-data";

export async function POST(request: NextRequest) {
  try {
    const { leetcodeSession } = await request.json();

    if (typeof leetcodeSession !== "string") {
      return NextResponse.json(
        { error: "Missing leetcodeSession." },
        { status: 400 },
      );
    }

    // ── Mock data path (no cookie provided) ───────────────────────────
    if (!leetcodeSession) {
      const mockPath = join(
        process.cwd(),
        "public",
        "data",
        "mock-solved.json",
      );
      const raw = await readFile(mockPath, "utf-8");
      const mockData: FetchResult = JSON.parse(raw);
      return NextResponse.json(mockData);
    }

    // ── Real fetch path (cookie provided) ─────────────────────────────
    const filePath = join(
      process.cwd(),
      "public",
      "data",
      "algo-problems.json",
    );
    const raw = await readFile(filePath, "utf-8");
    const data: AlgoProblemsData = JSON.parse(raw);

    const localSlugs = collectAllSlugs(data);
    const result = await fetchSolvedProblems(leetcodeSession, localSlugs);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error occurred";
    console.error("fetch-solved API error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
