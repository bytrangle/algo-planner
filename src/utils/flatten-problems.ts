import type { AlgoProblemsData } from "./fetch-leetcode-data";

/** A single problem with its topic ancestry preserved. */
export interface ProblemWithTopic {
  slug: string;
  title: string;
  url: string;
  difficulty: "Easy" | "Medium" | "Hard";
  /** Topic lineage, e.g. ["Linked List", "Two Pointers"]. */
  topics: string[];
}

/**
 * Flatten algo-problems.json into a flat array of problems, preserving the
 * full topic lineage for each problem.
 *
 * Works on both client and server — it only transforms data, no I/O.
 */
export function flattenAlgoData(data: AlgoProblemsData): ProblemWithTopic[] {
  const problems: ProblemWithTopic[] = [];

  for (const topic of data.topics) {
    // Frameworks: topic → framework → problems
    if (topic.frameworks) {
      for (const fw of topic.frameworks) {
        for (const p of fw.problems) {
          problems.push({
            slug: p.slug,
            title: p.title,
            url: p.url,
            difficulty: p.difficulty,
            topics: [topic.topic, fw.framework],
          });
        }
      }
    }

    // Standalone problems (no framework)
    if (topic.problems) {
      for (const p of topic.problems) {
        problems.push({
          slug: p.slug,
          title: p.title,
          url: p.url,
          difficulty: p.difficulty,
          topics: [topic.topic],
        });
      }
    }

    // Problem series
    if (topic.problem_series) {
      const series = Array.isArray(topic.problem_series)
        ? topic.problem_series
        : [topic.problem_series];
      for (const s of series) {
        for (const p of s.problems) {
          problems.push({
            slug: p.slug,
            title: p.title,
            url: p.url,
            difficulty: p.difficulty,
            topics: [topic.topic, s.name],
          });
        }
      }
    }
  }

  return problems;
}
