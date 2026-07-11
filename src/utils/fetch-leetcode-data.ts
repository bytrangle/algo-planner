import { LeetCode, Credential } from "leetcode-query";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProblemDef {
  id: number;
  slug: string;
  title: string;
  url: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface AlgoProblemsData {
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

/** A single solved problem that appears in both the user's LeetCode history
 *  and the local algo-problems.json. */
export interface SolvedProblem {
  titleSlug: string;
  title: string;
  /** Unix timestamp (seconds) of the last accepted submission, as a string. */
  lastSubmittedAt: string;
}

/** Result returned by {@link fetchSolvedProblems}. */
export interface FetchResult {
  username: string;
  solvedProblems: SolvedProblem[];
  /** Total number of solved problems across ALL of LeetCode (not just the
   *  local problem list). */
  totalSolved: number;
}

/**
 * A map of problem slug → lastSubmittedAt (Unix seconds as a string).
 * Convenient for passing cached solved data to the AlgoMap for rendering.
 */
export type SolvedTimestamps = Record<string, string>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all problem slugs into an array (useful for rendering). */
export function collectLocalSlugs(data: AlgoProblemsData): string[] {
  const slugs: string[] = [];
  for (const topic of data.topics) {
    if (topic.frameworks) {
      for (const fw of topic.frameworks) {
        for (const p of fw.problems) slugs.push(p.slug);
      }
    }
    if (topic.problems) {
      for (const p of topic.problems) slugs.push(p.slug);
    }
    if (topic.problem_series) {
      const series = Array.isArray(topic.problem_series)
        ? topic.problem_series
        : [topic.problem_series];
      for (const s of series) {
        for (const p of s.problems) slugs.push(p.slug);
      }
    }
  }
  return slugs;
}

/** Collect every problem slug referenced in the local algo-problems.json
 *  structure into a Set for fast membership checks. */
export function collectAllSlugs(data: AlgoProblemsData): Set<string> {
  const slugs = new Set<string>();

  for (const topic of data.topics) {
    // Frameworks
    if (topic.frameworks) {
      for (const fw of topic.frameworks) {
        for (const p of fw.problems) {
          slugs.add(p.slug);
        }
      }
    }

    // Standalone problems
    if (topic.problems) {
      for (const p of topic.problems) {
        slugs.add(p.slug);
      }
    }

    // Problem series (can be a single object or an array)
    if (topic.problem_series) {
      const series = Array.isArray(topic.problem_series)
        ? topic.problem_series
        : [topic.problem_series];
      for (const s of series) {
        for (const p of s.problems) {
          slugs.add(p.slug);
        }
      }
    }
  }

  return slugs;
}

// ---------------------------------------------------------------------------
// Main fetcher
// ---------------------------------------------------------------------------

/**
 * Authenticate against LeetCode with the user's session cookie and fetch
 * every problem they have solved.  Returns only the problems whose slug
 * appears in `localSlugs` (i.e. problems that are part of the AlgoMap
 * curriculum), along with each problem's last-submitted timestamp.
 *
 * @param leetcodeSession - The raw value of the `LEETCODE_SESSION` cookie.
 * @param localSlugs      - Set of all slugs collected from
 *                          `algo-problems.json`.
 * @param pageSize        - Number of records to request per page (default 100).
 */
export async function fetchSolvedProblems(
  leetcodeSession: string,
  localSlugs: Set<string>,
  pageSize = 100,
): Promise<FetchResult> {
  // 1. Authenticate
  const credential = new Credential();
  await credential.init(leetcodeSession);

  const leetcode = new LeetCode(credential);

  // 2. Identify the user
  const whoami = await leetcode.whoami();

  // 3. Paginate through ALL solved problems
  const solved: SolvedProblem[] = [];
  let totalOnServer = 0;

  for (let skip = 0; ; ) {
    const result = await leetcode.user_progress_questions({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questionStatus: "SOLVED" as any,
      skip,
      limit: pageSize,
    });

    const questions = result.questions ?? [];
    totalOnServer = result.totalNum;

    for (const q of questions) {
      // Only keep problems that appear in the local curriculum
      if (q.lastSubmittedAt && localSlugs.has(q.titleSlug)) {
        solved.push({
          titleSlug: q.titleSlug,
          title: q.title,
          lastSubmittedAt: q.lastSubmittedAt,
        });
      }
    }

    // Stop when we've fetched every page
    if (skip + pageSize >= totalOnServer) break;
    skip += pageSize;
  }

  return {
    username: whoami.username,
    solvedProblems: solved,
    totalSolved: totalOnServer,
  };
}
