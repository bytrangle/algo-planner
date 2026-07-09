/** Return today's date formatted as YYYY-MM-DD in Indochina time (UTC+7). */
function todayICT(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format();
}

const CACHE_PREFIX = "algomap-solved-";
const LAST_USERNAME_KEY = "algomap-last-username";

interface SolvedCache {
  dateICT: string;
  solvedSlugs: string[];
}

export function getCachedSolved(username: string): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + username);
    if (!raw) return null;
    const entry: SolvedCache = JSON.parse(raw);
    if (entry.dateICT !== todayICT()) {
      localStorage.removeItem(CACHE_PREFIX + username);
      return null;
    }
    return entry.solvedSlugs;
  } catch {
    return null;
  }
}

export function setCachedSolved(username: string, solvedSlugs: string[]): void {
  const entry: SolvedCache = { dateICT: todayICT(), solvedSlugs };
  try {
    localStorage.setItem(CACHE_PREFIX + username, JSON.stringify(entry));
    localStorage.setItem(LAST_USERNAME_KEY, username);
  } catch {
    /* storage full or unavailable — no-op */
  }
}

export function getLastUsedUsername(): string | null {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY);
  } catch {
    return null;
  }
}
