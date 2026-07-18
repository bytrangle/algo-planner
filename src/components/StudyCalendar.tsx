// ---------------------------------------------------------------------------
// StudyCalendar — Month-view calendar for optimized study plans
// ---------------------------------------------------------------------------

import type { ProblemWithTopic } from "../utils/flatten-problems";
import { getDifficultyStyles } from "../utils/difficulty-colors";

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

// ---------------------------------------------------------------------------
// Helper: Group plan days into calendar months
// ---------------------------------------------------------------------------

export function groupDaysByMonth(
  plan: { date: string; dayOfWeek: string; essential: PrioritizedProblem[]; extra: PrioritizedProblem[] }[],
): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const day of plan) {
    const date = new Date(day.date);
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

  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Component: Calendar Month View
// ---------------------------------------------------------------------------

export function CalendarMonth({ monthGroup }: { monthGroup: MonthGroup }) {
  const firstDayOfMonth = new Date(monthGroup.year, monthGroup.month, 1);
  const paddingDays = firstDayOfMonth.getDay();

  const paddingCells = Array.from({ length: paddingDays }, (_, i) => (
    <div key={`pad-${i}`} className="bg-zinc-50/50 dark:bg-zinc-900/30 min-h-[120px]" />
  ));

  return (
    <div className="mb-8">
      <h5 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
        {monthGroup.monthName} {monthGroup.year}
      </h5>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
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
                {/* Essential problems */}
                {day.essential.map((p, i) => {
                  const colors = getDifficultyStyles(p.difficulty);
                  return (
                    <a
                      key={`e-${i}`}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <div className="flex items-start gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${colors.circle} mt-1 shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[11px] leading-tight truncate ${colors.text} group-hover:underline`}>
                            {p.title}
                          </p>
                          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 truncate">
                            {p.topics.slice(0, 2).join(", ")}
                          </p>
                        </div>
                      </div>
                    </a>
                  );
                })}

                {/* Extra problems (lighter) */}
                {day.extra.map((p, i) => {
                  const colors = getDifficultyStyles(p.difficulty);
                  return (
                    <a
                      key={`x-${i}`}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group opacity-50 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-start gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${colors.circle} mt-1 shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[11px] leading-tight truncate ${colors.text} group-hover:underline`}>
                            {p.title}
                          </p>
                          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 truncate">
                            {p.topics.slice(0, 2).join(", ")}
                          </p>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
