// ---------------------------------------------------------------------------
// Difficulty Colors
// ---------------------------------------------------------------------------
// Shared color definitions for problem difficulty levels.
// Provides both Tailwind classes (for React components) and hex colors (for SVG/Canvas).
// ---------------------------------------------------------------------------

export type Difficulty = "Easy" | "Medium" | "Hard";

// Hex colors for SVG/Canvas rendering
export const DIFFICULTY_HEX: Record<Difficulty, string> = {
  Easy: "#10b981", // emerald-500
  Medium: "#f59e0b", // amber-500
  Hard: "#ef4444", // red-500
};

// Tailwind background classes
export const DIFFICULTY_BG: Record<Difficulty, string> = {
  Easy: "bg-emerald-500",
  Medium: "bg-amber-500",
  Hard: "bg-red-500",
};

// Tailwind text classes
export const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  Easy: "text-emerald-700 dark:text-emerald-400",
  Medium: "text-amber-700 dark:text-amber-400",
  Hard: "text-red-700 dark:text-red-400",
};

// Tailwind badge/background classes (lighter variants)
export const DIFFICULTY_BADGE_BG: Record<Difficulty, string> = {
  Easy: "bg-emerald-100 dark:bg-emerald-900",
  Medium: "bg-amber-100 dark:bg-amber-900",
  Hard: "bg-red-100 dark:bg-red-900",
};

// Combined helper for calendar/problem list items
export function getDifficultyStyles(difficulty: string) {
  switch (difficulty as Difficulty) {
    case "Easy":
      return {
        hex: DIFFICULTY_HEX.Easy,
        circle: DIFFICULTY_BG.Easy,
        text: DIFFICULTY_TEXT.Easy,
        badgeBg: DIFFICULTY_BADGE_BG.Easy,
      };
    case "Medium":
      return {
        hex: DIFFICULTY_HEX.Medium,
        circle: DIFFICULTY_BG.Medium,
        text: DIFFICULTY_TEXT.Medium,
        badgeBg: DIFFICULTY_BADGE_BG.Medium,
      };
    case "Hard":
      return {
        hex: DIFFICULTY_HEX.Hard,
        circle: DIFFICULTY_BG.Hard,
        text: DIFFICULTY_TEXT.Hard,
        badgeBg: DIFFICULTY_BADGE_BG.Hard,
      };
    default:
      return {
        hex: "#9ca3af", // gray-400
        circle: "bg-zinc-400",
        text: "text-zinc-600 dark:text-zinc-400",
        badgeBg: "bg-zinc-100 dark:bg-zinc-800",
      };
  }
}
