// ---------------------------------------------------------------------------
// StudyCalendar — Month-view calendar for optimized study plans
// ---------------------------------------------------------------------------

import type { ProblemWithTopic } from "../utils/flatten-problems";
import { DIFFICULTY_BG } from "../utils/difficulty-colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrioritizedProblem extends ProblemWithTopic {
  priority: "essential" | "extra";
  timeHours: number;
}

interface CalendarDay {
  date: string;
  dayOfWeek: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  essential: PrioritizedProblem[];
  extra: PrioritizedProblem[];
}

interface MonthGroup {
  year: number;
  month: number;
  monthName: string;
  days: CalendarDay[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

// ---------------------------------------------------------------------------
// Helper: Group plan days into calendar months
// ---------------------------------------------------------------------------

export function groupDaysByMonth(
  plan: { date: string; dayOfWeek: string; essential: PrioritizedProblem[]; extra: PrioritizedProblem[] }[],
): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  // First pass: create month groups and map dates to plan days
  for (const day of plan) {
    const date = new Date(day.date + "T00:00:00");
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = `${year}-${month}`;

    if (!groups.has(key)) {
      groups.set(key, { year, month, monthName: MONTH_NAMES[month], days: [] });
    }

    groups.get(key)!.days.push({
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      dayOfMonth: date.getDate(),
      isCurrentMonth: true,
      essential: day.essential,
      extra: day.extra,
    });
  }

  // Second pass: fill in ALL days of each month (not just study days)
  for (const group of groups.values()) {
    const year = group.year;
    const month = group.month;
    
    // Get number of days in this month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Create a map of existing plan days
    const planDaysMap = new Map(group.days.map(d => [d.dayOfMonth, d]));
    
    // Build complete list of all days in the month
    const allDays: CalendarDay[] = [];
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const date = new Date(year, month, dayNum);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const dayOfWeek = DAY_NAMES[date.getDay()];
      
      if (planDaysMap.has(dayNum)) {
        // This day has problems from the plan
        allDays.push(planDaysMap.get(dayNum)!);
      } else {
        // Empty day
        allDays.push({
          date: dateStr,
          dayOfWeek,
          dayOfMonth: dayNum,
          isCurrentMonth: true,
          essential: [],
          extra: [],
        });
      }
    }
    
    group.days = allDays;
  }

  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Shared problem row renderer
// ---------------------------------------------------------------------------

function ProblemRow({ problem, muted }: { problem: PrioritizedProblem; muted?: boolean }) {
  const circleColor = DIFFICULTY_BG[problem.difficulty as keyof typeof DIFFICULTY_BG] ?? "bg-zinc-400";

  return (
    <a
      href={problem.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block group ${muted ? "opacity-50 hover:opacity-80 transition-opacity" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <span className={`w-2 h-2 rounded-full ${circleColor} mt-1 shrink-0`} />
        <div className="min-w-0 flex-1">
          <p className="leading-tight truncate group-hover:underline">
            {problem.title}
          </p>
          <div className="mt-0.5 min-w-0">
            {problem.topics.slice(0, 1).map((topic, ti) => (
              <span
                key={ti}
                className="pill max-w-full block"
                title={topic}
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Types (continued)
// ---------------------------------------------------------------------------

interface CalendarMonthProps {
  monthGroup: MonthGroup;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
}

// ---------------------------------------------------------------------------
// Component: Calendar Month View
// ---------------------------------------------------------------------------

export function CalendarMonth({ 
  monthGroup,
  onPrevMonth,
  onNextMonth,
  canGoPrev,
  canGoNext
}: CalendarMonthProps) {
  const firstDayOfMonth = new Date(monthGroup.year, monthGroup.month, 1);
  const paddingDays = firstDayOfMonth.getDay();

  const paddingCells = Array.from({ length: paddingDays }, (_, i) => (
    <div key={`pad-${i}`} className="bg-zinc-50/50 dark:bg-zinc-900/30 min-h-[120px]" />
  ));

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xl/[22px]">
          {monthGroup.monthName} {monthGroup.year}
        </span>
        
        {(onPrevMonth || onNextMonth) && (
          <div className="flex gap-2">
            {onPrevMonth && (
              <button
                onClick={onPrevMonth}
                disabled={canGoPrev === false}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous month"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}
            
            {onNextMonth && (
              <button
                onClick={onNextMonth}
                disabled={canGoNext === false}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next month"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mt-2 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {paddingCells}
        {monthGroup.days.map((day) => {
          const hasProblems = day.essential.length > 0 || day.extra.length > 0;
          return (
            <div
              key={day.date}
              className={`min-h-[120px] p-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 ${
                hasProblems ? "" : "bg-zinc-50/30 dark:bg-zinc-900/20"
              }`}
            >
              <div className="text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                {day.dayOfMonth}
              </div>

              <div className="space-y-1.5">
                {day.essential.map((p, i) => (
                  <ProblemRow key={`e-${i}`} problem={p} />
                ))}
                {day.extra.map((p, i) => (
                  <ProblemRow key={`x-${i}`} problem={p} muted />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom navigation arrows */}
      {(onPrevMonth || onNextMonth) && (
        <div className="flex justify-between mt-4">
          {onPrevMonth && (
            <button
              onClick={onPrevMonth}
              disabled={canGoPrev === false}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              ← Prev
            </button>
          )}
          {onNextMonth && (
            <button
              onClick={onNextMonth}
              disabled={canGoNext === false}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next →
            </button>
          )}
        </div>
      )}
    </div>
  );
}