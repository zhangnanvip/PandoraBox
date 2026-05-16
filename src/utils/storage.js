const PREFIX = "pandora-box:";

export function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveState(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing; the game still remains playable.
  }
}

export function removeState(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore storage failures.
  }
}
