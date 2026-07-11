import type { SolvedTimestamps } from "./fetch-leetcode-data";

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

// ---- Persistent solved timestamps (for display) ----

/** Retrieve the cached slug → lastSubmittedAt map for a user (never expires). */
export function getSolvedTimestamps(username: string): SolvedTimestamps | null {
  try {
    const raw = localStorage.getItem(SLUGS_PREFIX + username);
    if (!raw) return null;
    return JSON.parse(raw) as SolvedTimestamps;
  } catch {
    return null;
  }
}

/** Persist the slug → lastSubmittedAt map for a user. */
export function setSolvedTimestamps(
  username: string,
  data: SolvedTimestamps,
): void {
  try {
    localStorage.setItem(SLUGS_PREFIX + username, JSON.stringify(data));
    localStorage.setItem(LAST_USERNAME_KEY, username);
  } catch {
    /* storage full or unavailable — no-op */
  }
}

// ---- Rate-limit gate (one fetch per calendar day) ----

/** Returns true if the user is allowed to fetch (rate limit has reset). */
export function canFetch(username: string): boolean {
  try {
    const raw = localStorage.getItem(FETCH_PREFIX + username);
    if (!raw) return true;
    const dateICT = JSON.parse(raw) as string;
    return dateICT !== todayICT();
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
