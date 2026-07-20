<img width="1207" height="830" alt="Screenshot from 2026-07-20 17-44-48" src="https://github.com/user-attachments/assets/396efbd1-ecad-42a1-84c1-99354007b454" />

# AlgoMap — Smarter Algorithm Practice with AI

AlgoMap helps you master algorithm problems by visualizing how they relate to each other and generating personalized study plans powered by a multi-agent AI system. It combines an interactive topic map with an intelligent planner that adapts to your schedule and skill level.

## How It Works

### Visualization (AlgoMap)

<img width="1724" height="917" alt="Screenshot from 2026-07-20 17-35-53" src="https://github.com/user-attachments/assets/ffe96905-af6e-4733-b29f-4ca2401ad530" />

The interactive map organizes 150+ algorithm problems from [labuladong.online](https://labuladong.online/en/algo) into a hierarchical circle-packing layout built with D3.js:

- **Topics** (e.g., Linked List, Dynamic Programming, Binary Tree) are outer containers
- **Frameworks and Problem Series** (e.g., Two Pointers, Sliding Window, Island Problems) are nested within topics
- **Individual problems** are dots inside each framework/series

When you sync your LeetCode progress, solved problems are sized by recency:
- Within 1 month: small (4px) — fresh in memory
- 1–3 months ago: medium (8px) — still familiar
- 3–6 months ago: larger (16px) — needs review
- Over 6 months ago / unsolved: largest (32px) — top priority

Hover over any problem to see its title, series, and last solved date.

### Study Plan (Multi-Agent System)

When you describe your study preferences in natural language, a pipeline of three AI agents collaborates to build a personalized plan:

#### Agent 1: Analyst
The Analyst extracts structured study parameters from your message. It parses details like timeframe ("3 months" → 90 days), hours per day ("2h" → 2), and study days ("weekdays" → Mon–Fri). For any missing parameters, it fetches your LeetCode behavioral data (submission calendar, badges) to estimate your capacity and weekly velocity. The output is a structured set of parameters used by the downstream agents.

#### Agent 2: Designer
The Designer takes the study parameters and all available problems, then:
1. **Filters** out recently solved problems (within the last 6 months) to focus on what needs practice
2. **Fetches** your LeetCode submission stats (Easy/Medium/Hard breakdown) to assess your level
3. **Decides** difficulty ratios and priority rules based on your skill level — a beginner gets more Easy problems; an advanced learner gets more Hard
4. **Schedules** problems across study days, grouping essential problems into manageable daily blocks and balancing with extra practice problems
5. **Outputs** a complete calendar with per-day problem assignments

#### Agent 3: Optimizer
The Optimizer refines the plan by identifying your weakest topics. It:
1. **Fetches** your per-topic solved counts from LeetCode and the total problem counts for each topic from LeetCode's tags endpoint
2. **Computes** a coverage ratio (`problemsSolved / totalProblems`) per topic — the lower the ratio, the weaker the topic
3. **Reorders** problems so that weakest topics appear first in the calendar, prioritizing focused practice on areas with the most room for improvement
4. **Respects** your daily time limit — if problems can't fit within `hoursPerDay`, it extends the plan and notes the change in the summary

<img width="1324" height="903" alt="Screenshot from 2026-07-20 17-42-06" src="https://github.com/user-attachments/assets/bf19bb25-7ed2-46da-a50d-6e499160b49d" />

The result is a day-by-day study calendar with problem assignments, difficulty distribution rationale, and skill-based adjustments.

<img width="1673" height="835" alt="Screenshot from 2026-07-20 17-44-29" src="https://github.com/user-attachments/assets/d374d2af-1220-42a4-a4c8-af8f41541262" />

## How to Use

### 1. Sync Your LeetCode Progress (Optional)

Click **Update Your Map** and enter:
- **Username**: Your LeetCode username
- **LEETCODE_SESSION**: (optional for Sync, or use "Use Mock Data") Found in your browser dev tools → Application → Storage → Cookies → leetcode.com

This downloads your solved problem data and persists it locally. Solved problems will be visually sized by recency on the map.

Alternatively, if you don't want to use your Leetcode data, you can click Use Mock Data. The magic is still the same. 

### 2. Generate a Study Plan

Scroll down to the **Study Plan** section and describe your availability in plain English, for example:

> *"I have 2 months to prepare, can study 2 hours a day on weekdays."*

Or if you're not sure:

> *"I don't know, just give me a reasonable plan."*

Behind the scenes, three AI agents collaborate in a pipeline:

1. **Analyst** Parses your message to extract study parameters (timeframe, hours per day, study days). If something is missing, it fetches your LeetCode submission history to estimate your weekly velocity and consistency, then fills in the gaps automatically.

2. **Designer** Takes the parameters and all available problems. It fetches your LeetCode solve stats (Easy/Medium/Hard counts) to assess your level, then decides the optimal difficulty mix and schedules problems across the available study days — balancing essential problems with extra practice.

3. **Optimizer** Fetches your per-topic solved counts and LeetCode's topic-level problem totals, then computes a coverage ratio (`problemsSolved / totalProblems`) for each topic — the lower the ratio, the weaker the area. Problems are reordered so weakest topics come first. It also enforces your daily time limit, extending the plan if needed to keep every day within `hoursPerDay`.

The system streams each agent's thinking to the UI in real time, so you can follow along as the plan is built.

The three-agent system will process your request and display:
- **Plan Summary**: Total problems, essential vs. extra breakdown, total days and hours
- **Difficulty Distribution**: Why certain ratios were chosen
- **Topic Prioritization**: Which topics need the most attention
- **Study Calendar**: A month-by-month calendar with problem assignments for each study day

## License

Distributed under the MIT License. See `LICENSE` for more information.
