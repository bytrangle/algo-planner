'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import type { SolvedTimestamps } from '../../utils/fetch-leetcode-data'
import { DIFFICULTY_HEX } from '../../utils/difficulty-colors'

// Types
interface Problem {
  id: number;
  slug: string;
  title: string;
  url: string;
  difficulty: "Easy" | "Medium" | "Hard"
}

interface Framework {
  framework: string;
  problems: Problem[];
  slug: string;
}

interface ProblemSeries {
  name: string;
  problems: Problem[]
}

interface Topic {
  topic: string;
  slug: string;
  frameworks?: Framework[];
  problems?: Problem[];
  problem_series?: ProblemSeries[] | ProblemSeries;
}

interface AlgoMapData {
  topics: Topic[];
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  r: number;
  data: {
    type: 'problem' | 'framework' | 'series' | 'topic';
    problem?: Problem;
    framework?: Framework;
    series?: ProblemSeries;
    topic?: Topic;
  }
}

interface HierarchyData {
  name: string;
  value?: number;
  topic?: Topic;
  framework?: Framework;
  series?: ProblemSeries;
  problem?: Problem;
  type?: "problem" | "framework" | "series";
  children?: HierarchyData[];
}

interface PackedNode extends d3.HierarchyNode<HierarchyData> {
  x: number;
  y: number;
  r: number;
}

function asPackedNode(node: d3.HierarchyNode<HierarchyData>): PackedNode {
  return node as PackedNode;
}

const SPACING = {
  PROBLEM_RADIUS: 8,
  FRAMEWORK_INNER_PADDING: 2, // tightest
  FRAMEWORK_OUTER_PADDING: 15, // spacing between frameworks/series
  TOPIC_OUTER_PADDING: 40 // spacing between topics
}

// Layout computation using nested d3.pack()
function computeLayout(data:{ topics: Topic[] }, width: number, height: number): LayoutNode[] {
  const nodes: LayoutNode[]= []

  // Create hiearchy for d3.pack()
  const hierarchyData: HierarchyData = {
  name: "root",
  value: 0,  // Add this
  children: data.topics.map(topic => ({
    name: topic.topic,
    topic: topic,
    value: 0,  // Add this
    children: [
      // Frameworks
      ...(topic.frameworks || []).map(framework => ({
        name: framework.framework,
        framework: framework,
        type: "framework" as const,
        value: 0,  // Add this
        children: framework.problems.map(problem => ({
          name: problem.title,
          value: 1,
          problem: problem,
          type: "problem" as const
        }))
      })),
      // Series
      ...(Array.isArray(topic.problem_series)
        ? topic.problem_series
        : topic.problem_series ? [topic.problem_series] : []
      ).map(series => ({
        name: series.name,
        series: series,
        type: "series" as const,
        value: 0,  // Add this
        children: series.problems.map(problem => ({
          name: problem.title,
          value: 1,
          problem: problem,
          type: "problem" as const
        }))
      })),
      // Standalone problems
      ...(topic.problems || []).map(problem => ({
        name: problem.title,
        value: 1,
        problem: problem,
        type: "problem" as const
      }))
    ]
  }))
  };

  // Level 1: Pack topics
  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.value || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  const topicPack = d3.pack<HierarchyData>()
    .size([width, height])
    .padding(SPACING.TOPIC_OUTER_PADDING);
  topicPack(root);
  // Level 2: Pack frameworks/series within each topic
  root.children?.forEach(topicNode => {
    const topic = topicNode.data.topic;
    if (!topic) return;
    const { x: topicX, y: topicY, r: topicR } = asPackedNode(topicNode);

    // Create hierarchy for this topic's children
    const topicChildren: HierarchyData[] = [
       // Frameworks
      ...(topic.frameworks || []).map(framework => ({
        name: framework.framework,
        framework: framework,
        type: "framework" as const,
        children: framework.problems.map(problem => ({
          name: problem.title,
          value: 1,
          problem: problem,
          type: "problem" as const
        }))
      })),
      // Series
      ...(Array.isArray(topic.problem_series)
        ? topic.problem_series
        : topic.problem_series ? [topic.problem_series] : []
      ).map(series => ({
        name: series.name,
        series,
        type: "series" as const,
        children: series.problems.map(problem => ({
          name: problem.title,
          value: 1,
          problem,
          type: "problem" as const
        }))
      })),
       // Standalone problems
      ...(topic.problems || []).map(problem => ({
        name: problem.title,
        value: 1,
        problem: problem,
        type: "problem" as const
      }))
    ]
    const topicRoot = d3.hierarchy({
      name: topic.topic,
      children: topicChildren
    } as HierarchyData)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    const groupPack = d3.pack<HierarchyData>()
      .size([topicR * 2, topicR * 2])
      .padding(SPACING.FRAMEWORK_OUTER_PADDING);
    groupPack(topicRoot);

    // Level 3: Pack problems within each framework/series
    topicRoot.children?.forEach(groupNode => {
      const groupData = groupNode.data;
      const { x: groupX, y: groupY, r: groupR } = asPackedNode(groupNode);
      // If this is a framework or series, pack its problems
      if (groupData.type === 'framework' || groupData.type === 'series') {
        const problemRoot = d3.hierarchy<HierarchyData>({
          name: groupData.name,
          children: groupData.children || []
        })
          .sum(d => d.value || 0);
        const problemPack = d3.pack<HierarchyData>()
          .size([groupR * 2, groupR * 2])
          .padding(SPACING.FRAMEWORK_INNER_PADDING);
        problemPack(problemRoot);

        // Add problem nodes
        problemRoot.leaves().forEach(problemNode => {
          const packedProblem = asPackedNode(problemNode);
          const problem = packedProblem.data.problem;
          if (!problem) return;
          // Position relative to group center
          const problemX = topicX + groupX - topicR + packedProblem.x - groupR;
          const problemY = topicY + groupY - topicR + packedProblem.y - groupR;
          nodes.push({
            id: `problem-${problem.id}`,
            x: problemX,
            y: problemY,
            r: SPACING.PROBLEM_RADIUS,
            data: {
              type: 'problem',
              problem: problem,
              topic: topic,
              framework: groupData.framework,
              series: groupData.series,
            }
          });
        });
        // Add group node (for border rendering)
        nodes.push({
          id: groupData.type === 'framework'
            ? `framework-${topic.slug}-${groupData.framework?.slug}`
            : `series-${topic.slug}-${groupData.series?.name}`,
          x: topicX + groupX - topicR,
          y: topicY + groupY - topicR,
          r: groupR,
          data: {
            type: groupData.type,
            framework: groupData.framework,
            series: groupData.series,
            topic: topic,
          }
        });
      } else if (groupData.type === 'problem' && groupData.problem) {
        // Standalone problem
        nodes.push({
          id: `problem-${groupData.problem.id}`,
          x: topicX + groupX - topicR,
          y: topicY + groupY - topicR,
          r: SPACING.PROBLEM_RADIUS,
          data: {
            type: 'problem',
            problem: groupData.problem,
            topic: topic,
          }
        });
      }
    })
    // Add topic node (for border rendering)
    nodes.push({
      id: `topic-${topic.slug}`,
      x: topicX,
      y: topicY,
      r: topicR,
      data: {
        type: 'topic',
        topic: topic,
      }
    });
  })
  return nodes
}

interface AlgoMapProps {
  solvedTimestamps?: SolvedTimestamps | null;
}

/** Parse a lastSubmittedAt string to milliseconds.  The API may return
 *  seconds (10-digit), milliseconds (13-digit), or an ISO string. */
function parseTimestampMs(lastSubmittedAt: string): number {
  // Try numeric parse first
  const n = Number(lastSubmittedAt);
  if (!isNaN(n)) {
    // > 1e12 suggests the value is already in milliseconds
    return n > 1e12 ? n : n * 1000;
  }
  // Fall back to Date.parse for ISO strings
  return Date.parse(lastSubmittedAt);
}

/** Format a lastSubmittedAt string to ISO date (YYYY-MM-DD). */
function formatSolvedDate(lastSubmittedAt: string): string {
  const ms = parseTimestampMs(lastSubmittedAt);
  if (isNaN(ms)) return "Unknown";
  return new Date(ms).toISOString().split("T")[0];
}

/** Compute visual radius from a lastSubmittedAt timestamp.
 *
 *  ≤1 month → 5, 1–3 months → 10, 3–6 months → 15, >6 months → 20 (px). */
function solvedRadius(lastSubmittedAt: string): number {
  const elapsed = Date.now() - parseTimestampMs(lastSubmittedAt);
  const msPerMonth = 30 * 24 * 60 * 60 * 1000;
  const months = elapsed / msPerMonth;

  if (months <= 1) return 5;
  if (months <= 3) return 10;
  if (months <= 6) return 15;
  return 20;
}

// Main component
export default function AlgoMap({ solvedTimestamps }: AlgoMapProps) {
  const [data, setData] = useState<AlgoMapData | null>(null)
  const [hoveredProblem, setHoveredProblem] = useState<{
    problem: Problem;
    x: number;
    y: number;
    seriesName?: string;
    lastSolved?: string;
  } | null>(null)
  const width = 1400
  const height = 1400

  // Fetch data
  useEffect(() => {
    d3.json<AlgoMapData>('/data/algo-problems.json')
      .then(result => {
        if (result) setData(result)
      })
  }, [])

  // Compute layout
  const nodes = useMemo(() => {
    if (!data) return []
    return computeLayout(data, width, height)
  }, [data])

  // Group nodes
  const topicNodes = nodes.filter(n => n.data.type === "topic")
  const frameworkNodes = nodes.filter(n => n.data.type === "framework")
  const problemNodes = nodes.filter(n => n.data.type === "problem")

  const handleProblemHover = useCallback((
    problem: Problem,
    x: number,
    y: number,
    seriesName?: string,
    lastSolved?: string,
  ) => {
    if (lastSolved) console.log("lastSolved raw:", lastSolved, "parsed:", formatSolvedDate(lastSolved));
    setHoveredProblem({ problem, x, y, seriesName, lastSolved })
  }, [])

  const handleProblemLeave = useCallback(() => {
    setHoveredProblem(null)
  }, [])

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row gap-6 xl:gap-8 2xl:gap-10">
      <svg width={width} height={height} viewBox="-100 -100 1600 1600" className="w-full xl:w-[1000px] 2xl:w-[1200px] h-auto bg-white rounded-lg shadow-lg shrink-0">
      {/* Topic borders (solid) */}
      {topicNodes.map(node => (
        <circle
          key={node.id}
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill="none"
          stroke="#374151"
          strokeWidth={2}
        />
      ))}
      {/* Topic labels */}
      {topicNodes.map(node => (
        <text
          key={`label-${node.id}`}
          x={node.x}
          y={node.y - node.r + 18}
          textAnchor="middle"
          className="text-sm font-bold fill-gray-900"
        >
          {node.data.topic?.topic}
        </text>
      ))}

      {/* Framework borders (dashed) */}
      {frameworkNodes.map(node => (
        <circle
          key={node.id}
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill="none"
          stroke="#9ca3af"
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      ))}
      {/* Framework labels */}
      {frameworkNodes.map(node => (
        <text
          key={`label-${node.id}`}
          x={node.x}
          y={node.y - node.r - 5}
          textAnchor="middle"
          className="text-xs fill-gray-500"
        >
          {node.data.framework?.framework}
        </text>
      ))}

      {/* Problem dots */}
      {problemNodes.map(node => {
        const problem = node.data.problem
        if (!problem) return null
        const timestamp = solvedTimestamps?.[problem.slug]
        // When no cache exists yet, show all problems as uniform filled circles
        // by difficulty.  When cache exists, size by recency and hollow unsolved.
        const uniform = !solvedTimestamps
        const r = uniform ? SPACING.PROBLEM_RADIUS
          : timestamp ? solvedRadius(timestamp)
          : SPACING.PROBLEM_RADIUS
        return (
          <circle
            key={node.id}
            cx={node.x}
            cy={node.y}
            r={r}
            fill={uniform ? DIFFICULTY_HEX[problem.difficulty]
              : timestamp ? DIFFICULTY_HEX[problem.difficulty]
              : "none"}
            stroke={uniform ? undefined
              : timestamp ? undefined
              : DIFFICULTY_HEX[problem.difficulty]}
            strokeWidth={uniform ? undefined
              : timestamp ? undefined
              : 2}
            className="hover:opacity-80 transition-opacity"
            onMouseEnter={() => handleProblemHover(
              problem,
              node.x,
              node.y,
              node.data.series?.name,
              timestamp,
            )}
            onMouseLeave={handleProblemLeave}
          />
        )
      })}
      {/* Flyout */}
      {hoveredProblem && (
        <foreignObject
          x={hoveredProblem.x + 15}
          y={hoveredProblem.y - (hoveredProblem.seriesName ? 65 : 50)}
          width={240}
          height={120}
        >
          <div className="bg-white border border-gray-300 rounded shadow-md px-3 py-2 inline-block min-w-0 max-w-[220px]">
            {hoveredProblem.seriesName && (
              <div className="text-xs font-mono font-bold text-gray-800 mb-1.5 wrap-break-word leading-tight">
                {hoveredProblem.seriesName}
              </div>
            )}
            <div className="text-sm text-gray-900 wrap-break-word leading-tight">
              {hoveredProblem.problem.title}
            </div>
            {hoveredProblem.lastSolved && (
              <div className="text-xs text-gray-500 mt-1">
                Last solved: {formatSolvedDate(hoveredProblem.lastSolved)}
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </svg>

      {/* Annotation legend */}
      <div className="w-72 xl:w-80 shrink-0 space-y-6 pt-4 sm:pt-8 text-sm">
        {/* Group 1: Status */}
        <div>
          <div className="font-semibold text-gray-900 mb-2 text-center">Status</div>
          <div className="flex justify-around items-center">
            <div className="flex flex-col items-center gap-1">
              <svg width="20" height="20" viewBox="0 0 20 20" className="block">
                <circle cx="10" cy="10" r="7" fill="none" stroke={DIFFICULTY_HEX.Easy} strokeWidth="2" />
              </svg>
              <span className="text-xs text-gray-500">unsolved</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <svg width="20" height="20" viewBox="0 0 20 20" className="block">
                <circle cx="10" cy="10" r="7" fill={DIFFICULTY_HEX.Easy} />
              </svg>
              <span className="text-xs text-gray-500">solved</span>
            </div>
          </div>
        </div>

        {/* Group 2: Difficulty Level */}
        <div>
          <div className="font-semibold text-gray-900 mb-2 text-center">Difficulty Level</div>
          <div className="flex justify-around items-center">
            {(["Easy", "Medium", "Hard"] as const).map((d) => (
              <div key={d} className="flex flex-col items-center gap-1">
                <svg width="20" height="20" viewBox="0 0 20 20" className="block">
                  <circle cx="10" cy="10" r="7" fill={DIFFICULTY_HEX[d]} />
                </svg>
                <span className="text-xs text-gray-500">{d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Group 3: Last Solved */}
        <div>
          <div className="font-semibold text-gray-900 mb-2 text-center">Last Solved</div>
          <div className="flex gap-x-1 justify-center items-start">
            {[
              { r: 5, label: "≤1 mo", desc: "within 1 month" },
              { r: 10, label: "1-3 mo", desc: "1-3 months ago" },
              { r: 15, label: "3-6 mo", desc: "3-6 months ago" },
              { r: 20, label: ">6 mo", desc: "over 6 months ago" },
            ].map((item) => (
              <div key={item.r} className="flex flex-col items-center gap-1">
                <svg width="40" height="40" viewBox="0 0 40 40" className="block">
                  <circle cx="20" cy="20" r={item.r} fill={DIFFICULTY_HEX.Easy} />
                </svg>
                <span className="text-xs text-gray-500 text-center leading-tight">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}