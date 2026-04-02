export const FIRST_ENTRY_STORAGE_KEY = "criticable-first-entry-v1";

type FirstEntryMap = Record<string, true>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function readPendingFirstEntries() {
  if (typeof window === "undefined") {
    return {} as FirstEntryMap;
  }

  const raw = window.localStorage.getItem(FIRST_ENTRY_STORAGE_KEY);

  if (!raw) {
    return {} as FirstEntryMap;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.entries(parsed).reduce<FirstEntryMap>((acc, [key, value]) => {
      if (value === true) {
        acc[normalizeEmail(key)] = true;
      }

      return acc;
    }, {});
  } catch {
    return {} as FirstEntryMap;
  }
}

function writePendingFirstEntries(entries: FirstEntryMap) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(FIRST_ENTRY_STORAGE_KEY, JSON.stringify(entries));
}

export function markFirstEntryPending(email: string) {
  const current = readPendingFirstEntries();
  current[normalizeEmail(email)] = true;
  writePendingFirstEntries(current);
}

export function hasPendingFirstEntry(email: string) {
  const current = readPendingFirstEntries();
  return current[normalizeEmail(email)] === true;
}

export function clearFirstEntryPending(email: string) {
  const current = readPendingFirstEntries();
  delete current[normalizeEmail(email)];
  writePendingFirstEntries(current);
}
