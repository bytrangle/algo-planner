/** Return today's date formatted as YYYY-MM-DD in Indochina time (UTC+7). */
function todayICT(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format();
}

const SLUGS_PREFIX = "algomap-slugs-";
const FETCH_PREFIX = "algomap-fetch-";
const LAST_USERNAME_KEY = "algomap-last-username";

// ---- Persistent solved slugs (for display) ----

export function getSolvedSlugs(username: string): string[] | null {
  try {
    const raw = localStorage.getItem(SLUGS_PREFIX + username);
    if (!raw) return null;
    return JSON.parse(raw) as string[];
  } catch {
    return null;
  }
}

export function setSolvedSlugs(username: string, solvedSlugs: string[]): void {
  try {
    localStorage.setItem(SLUGS_PREFIX + username, JSON.stringify(solvedSlugs));
    localStorage.setItem(LAST_USERNAME_KEY, username);
  } catch {
    /* storage full or unavailable — no-op */
  }
}

// ---- Rate-limit gate (one fetch per calendar day) ----

/** Returns true if the user has already fetched today (rate-limited). */
export function canFetch(username: string): boolean {
  try {
    const raw = localStorage.getItem(FETCH_PREFIX + username);
    if (!raw) return true; // no fetch recorded → allowed
    const dateICT = JSON.parse(raw) as string;
    return dateICT !== todayICT(); // allowed if last fetch was on a different day
  } catch {
    return true;
  }
}

/** Record that the user fetched today. */
export function setFetchedToday(username: string): void {
  try {
    localStorage.setItem(FETCH_PREFIX + username, JSON.stringify(todayICT()));
  } catch {
    /* no-op */
  }
}

// ---- Last used username ----

export function getLastUsedUsername(): string | null {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY);
  } catch {
    return null;
  }
}
