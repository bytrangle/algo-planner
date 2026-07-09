import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  fetchSolvedProblems,
  collectAllSlugs,
  type AlgoProblemsData,
} from "../../../utils/fetch-leetcode-data";

export async function POST(request: NextRequest) {
  try {
    const { leetcodeSession } = await request.json();

    if (!leetcodeSession || typeof leetcodeSession !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid leetcodeSession." },
        { status: 400 },
      );
    }

    // Read the local problem list
    const filePath = join(
      process.cwd(),
      "public",
      "data",
      "algo-problems.json",
    );
    const raw = await readFile(filePath, "utf-8");
    const data: AlgoProblemsData = JSON.parse(raw);

    const localSlugs = collectAllSlugs(data);

    // Fetch solved problems from LeetCode
    const result = await fetchSolvedProblems(leetcodeSession, localSlugs);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error occurred";
    console.error("fetch-solved API error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
