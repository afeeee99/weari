// =====================================================
// Key-value storage on this device (a thin wrapper around localStorage).
// Every save goes through here so the cloud sync (src/firebase/sync.js)
// can copy changes to the signed-in user's account.
// =====================================================
const listeners = new Set();
let muted = 0;

function emit(key) {
  if (muted) return;
  listeners.forEach((fn) => {
    try {
      fn(key);
    } catch (err) {
      console.warn("kv listener failed:", err);
    }
  });
}

export const kv = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  // Throws like localStorage does when storage is full, so callers can show a message
  setItem(key, value) {
    localStorage.setItem(key, String(value));
    emit(key);
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
    emit(key);
  },
  key(index) {
    try {
      return localStorage.key(index);
    } catch {
      return null;
    }
  },
  get length() {
    try {
      return localStorage.length;
    } catch {
      return 0;
    }
  },
};

// Call fn(key) whenever a value is saved or removed on this device
export function onKvChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Save without telling listeners (used when applying changes that came from the cloud)
export function withoutSync(fn) {
  muted++;
  try {
    return fn();
  } finally {
    muted--;
  }
}
