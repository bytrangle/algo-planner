# AlgoPlanner — Architecture

## System Overview

```mermaid
flowchart TB
    subgraph Browser["🖥 User's Browser"]
        UI["React Frontend<br/>AlgoMap · StudyCalendar · StudyPlan"]
    end

    subgraph Alibaba["☁ Alibaba Cloud SAS"]
        Server["Next.js Server"]
        API["POST /api/plan<br/>SSE Streaming"]
        env["DASHSCOPE_API_KEY<br/>(env variable)"]
        subgraph Agents["🤖 Three-Agent Pipeline"]
            A["1. Analyst<br/><i>Extract params<br/>Fetch LeetCode data</i>"]
            D["2. Designer<br/><i>Difficulty ratios<br/>Schedule problems</i>"]
            O["3. Optimizer<br/><i>Coverage-based<br/>reordering</i>"]
            A --> D --> O
        end
    end

    subgraph Qwen["🧠 Qwen Cloud (DashScope)"]
        LLM["qwen-plus models"]
    end

    subgraph LeetCode["📊 LeetCode"]
        LC_API["leetcode-api-pied.vercel.app"]
        LC_GQL["GraphQL API"]
    end

    UI -->|"POST /api/plan"| API
    API --> Agents
    Agents -->|"chat completions"| LLM
    env -.->|"API key"| Agents
    UI -->|"fetch user / skills / tags"| LC_API
    Agents -->|"fetch skills / tags"| LC_API
    LC_API --> LC_GQL
```

## Data Flow — Study Plan Generation

```mermaid
sequenceDiagram
    actor User
    participant Frontend as React UI
    participant Server as Next.js /api/plan
    participant Analyst as Analyst Agent
    participant Designer as Designer Agent
    participant Optimizer as Optimizer Agent
    participant Qwen as Qwen Cloud
    participant LeetCode as LeetCode API

    User->>Frontend: "I have 2h/day for 14 days"
    Frontend->>Server: POST /api/plan (SSE)

    Note over Server: Analyst Phase
    Server->>Analyst: User message + history
    Analyst->>LeetCode: fetch skills, calendar
    LeetCode-->>Analyst: user skill data
    Analyst->>Qwen: prompt (extract params)
    Qwen-->>Analyst: {timeFrame, hoursPerDay, studyDays, capacity}
    Analyst-->>Server: params + reasoning

    Note over Server: Designer Phase
    Server->>Designer: params + all problems
    Designer->>LeetCode: fetch user profile
    LeetCode-->>Designer: user stats
    Designer->>Qwen: prompt (schedule + difficulty ratios)
    Qwen-->>Designer: {dailyPlan, reasoning}
    Designer-->>Server: initial schedule

    Note over Server: Optimizer Phase
    Server->>Optimizer: schedule + coverage data
    Optimizer->>LeetCode: fetch topic tags
    LeetCode-->>Optimizer: tag counts
    Optimizer->>Qwen: prompt (reasoning only)
    Qwen-->>Optimizer: optimization reasoning
    Note over Optimizer: Code sorts by<br/>coverage ratio (weakest first)
    Optimizer-->>Server: optimized plan

    Server-->>Frontend: SSE stream → final plan
    Frontend-->>User: Calendar + reasoning panels
```

## Deployment Architecture

```mermaid
flowchart LR
    subgraph Cloud["Alibaba Cloud SAS"]
        direction TB
        OS["Ubuntu 24.04"]
        Runtime["Node.js 18 + PM2"]
        App["Next.js Server :3000"]
        OS --> Runtime --> App
    end

    subgraph External["External Services"]
        Qwen["DashScope<br/>(Qwen models)"]
        LC["LeetCode API<br/>(vercel.app)"]
    end

    Browser["Browser"] <-->|"HTTPS"| App
    App -->|"DASHSCOPE_API_KEY"| Qwen
    Browser -->|"CORS: *"| LC
    App -->|"fetch"| LC
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **API key on server only** | `DASHSCOPE_API_KEY` is an env variable on SAS; never sent to browser |
| **SSE streaming** | Users see agent progress in real-time (Analyst → Designer → Optimizer) |
| **LeetCode calls from browser** | Avoids proxying user cookies through server; CORS already open (`*`) |
| **Coverage ratio in code, not LLM** | Ordering is deterministic; LLM writes reasoning text only |
| **PM2 process manager** | Auto-restart on crash, startup on boot |
| **Sequential agent pipeline** | Each agent depends on the previous one's output |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, D3.js, Tailwind CSS |
| Language | TypeScript |
| AI Models | Qwen (DashScope) — qwen-plus variants |
| Hosting | Alibaba Cloud SAS — Ubuntu 24.04, 1 GB RAM, 2 vCPU |
| Process | PM2 |
