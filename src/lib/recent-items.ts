/**
 * Recent-item ordering for the new-batch flows (C5). The shop inspects the
 * same few items for weeks — the picker sorts last-used first so a returning
 * inspector picks from the top instead of scrolling a 200-row master list.
 * Storage is localStorage (workstation-scoped, same as Sunlight Mode).
 */
const KEY = "recent-items";
const CAP = 12;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Call when a batch starts — moves the item to the front of the recency list. */
export function recordRecentItem(itemId: string): void {
  if (typeof window === "undefined" || itemId === "") return;
  const next = [itemId, ...read().filter((id) => id !== itemId)].slice(0, CAP);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full / disabled — recency is an optimization, never a blocker.
  }
}

/** Stable sort: recently used items first, the rest keep their server order. */
export function sortItemsRecentFirst<T extends { id: string }>(items: T[]): T[] {
  const rank = new Map(read().map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}
