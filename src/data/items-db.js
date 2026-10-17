import { placeholderImage } from "../core/placeholders.js";
import { kv } from "../core/kv.js";

// =====================================================
// Storage (IndexedDB + localStorage backup & backward compatibility)
// =====================================================
const DB_NAME = "weari";
const STORE = "items";
export const BACKUP_ITEMS_KEY = "weari_items_backup";

export const LEGACY_ITEM_STORAGE_KEYS = [
  "weari-items",
  "weari_items",
  "items",
  "wardrobe",
  "weari_wardrobe",
  "weari-wardrobe",
  "weari_closet",
  "weari-closet",
  "weariItems",
  "wardrobeItems",
  "weari_clothes",
  "weari-clothes",
];

export const LEGACY_WEAR_COUNT_KEYS = [
  "weari_wear_counts",
  "weari-wear-counts",
  "weari_wears",
  "weari-wears",
  "wear_counts",
  "wearCounts",
];

export const LEGACY_OUTFIT_KEYS = [
  "weari-saved-outfits",
  "saved_outfits",
  "saved-outfits",
  "weari_outfits",
  "weari-outfits",
  "outfits",
  "weariSavedOutfits",
];

export const LEGACY_KARMA_KEYS = [
  "weari_karma",
  "karma",
  "weari-karma-points",
  "weari_karma_points",
  "weariKarma",
];

export const LEGACY_REQUEST_KEYS = [
  "weari_swap_requests",
  "swap_requests",
  "swap-requests",
  "requests",
  "weariSwapRequests",
];

export function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const category = String(raw.category || raw.type || "top").toLowerCase();
  const color = String(raw.color || "black").toLowerCase();
  const name = raw.name || raw.title || raw.label || `${color} ${category}`.trim();
  let occasions = [];
  if (Array.isArray(raw.occasions)) {
    occasions = raw.occasions.map(String);
  } else if (typeof raw.occasions === "string") {
    occasions = raw.occasions.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (raw.occasion) {
    occasions = [String(raw.occasion)];
  }
  if (!occasions.length) occasions = ["casual"];

  const photo =
    raw.photo ||
    raw.image ||
    raw.imageUrl ||
    (placeholderImage(category, color));

  const swappable = Boolean(raw.swappable || raw.isSwappable || raw.forSwap || raw.swap);

  const wearCount = Number(
    raw.wearCount ??
    raw.wears ??
    raw.wear_count ??
    raw.timesWorn ??
    raw.times_worn ??
    raw.wornCount ??
    raw.wear_times ??
    0
  ) || 0;

  let lastWorn = raw.lastWorn || raw.last_worn || raw.lastWornDate || raw.wornAt || raw.worn_at || raw.lastWornAt || null;
  if (lastWorn && !isNaN(Number(lastWorn)) && typeof lastWorn !== "string") {
    try {
      lastWorn = new Date(Number(lastWorn)).toISOString();
    } catch {}
  }

  const createdAt = Number(raw.createdAt || raw.created_at) || Date.now();
  const id = String(raw.id || raw._id || "item_" + Math.random().toString(36).slice(2, 9));

  return {
    id,
    name,
    category,
    color,
    occasions,
    photo,
    swappable,
    wearCount,
    lastWorn,
    createdAt,
    updatedAt: Number(raw.updatedAt) || createdAt, // used by cloud sync: the newest copy wins
  };
}

export function normalizeOutfit(raw, allItems = []) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "outfit_" + Math.random().toString(36).slice(2, 9));
  const name = raw.name || raw.title || raw.label || "Custom outfit";
  const occasion = raw.occasion || "casual";
  const createdAt = Number(raw.createdAt || raw.created_at) || Date.now();
  const notes = raw.notes || raw.explanation || "";
  const label = raw.name || raw.title ? String(raw.label || "") : "";

  const rawPieces = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.pieces) ? raw.pieces : [];
  const items = rawPieces.map((p) => {
    if (typeof p === "string") {
      const match = allItems.find((it) => it.id === p);
      return match || { id: p, name: "Piece", category: "top", color: "black", occasions: [occasion] };
    }
    return p;
  });

  return { id, name, occasion, items, createdAt, notes, label };
}

export function normalizeRequest(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: String(raw.id || "req_" + Math.random().toString(36).slice(2, 9)),
    listingId: String(raw.listingId || raw.listing_id || raw.listing?.id || ""),
    offeredItemId: String(raw.offeredItemId || raw.offered_item_id || raw.mineId || ""),
    status: raw.status || "pending",
    createdAt: Number(raw.createdAt || raw.created_at) || Date.now(),
    listing: raw.listing || null,
    // Demo swap fields (simulated acceptance and chat); absent on older requests
    ...(raw.demo && { demo: true }),
    ...(raw.acceptedAt && { acceptedAt: Number(raw.acceptedAt) }),
    ...(raw.offeredName && { offeredName: String(raw.offeredName) }),
    ...(Array.isArray(raw.messages) && { messages: raw.messages }),
  };
}

function openDB() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function dbRun(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

function getAllItemsFromBackup() {
  try {
    const raw = kv.getItem(BACKUP_ITEMS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.map(normalizeItem).filter(Boolean);
    }
  } catch {}
  return [];
}

export async function getAllItems() {
  try {
    const dbItems = await dbRun("readonly", (s) => s.getAll());
    if (Array.isArray(dbItems) && dbItems.length > 0) {
      return dbItems.map(normalizeItem).filter(Boolean);
    }
  } catch (e) {
    console.warn("IndexedDB read warning:", e);
  }

  // Fallback to localStorage backup and legacy keys
  try {
    const backupItems = getAllItemsFromBackup();
    if (backupItems.length > 0) {
      return backupItems;
    }
    for (const k of LEGACY_ITEM_STORAGE_KEYS) {
      const raw = kv.getItem(k);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          const items = list.map(normalizeItem).filter(Boolean);
          if (items.length > 0) {
            kv.setItem(BACKUP_ITEMS_KEY, JSON.stringify(items));
            for (const it of items) {
              dbRun("readwrite", (s) => s.put(it)).catch(() => {});
            }
            return items;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Storage fallback warning:", e);
  }
  return [];
}

// Anything that wants to know when the wardrobe changes (the cloud sync does)
const itemListeners = new Set();
export function onItemsChange(fn) {
  itemListeners.add(fn);
  return () => itemListeners.delete(fn);
}
function emitItemChange(change) {
  itemListeners.forEach((fn) => {
    try {
      fn(change);
    } catch (err) {
      console.warn("Item listener failed:", err);
    }
  });
}

// fromSync: the change came from the cloud, so don't send it back up or bump updatedAt
export async function saveItem(item, { fromSync = false } = {}) {
  const normalized = normalizeItem(item) || item;
  if (!fromSync) normalized.updatedAt = Date.now();
  try {
    await dbRun("readwrite", (s) => s.put(normalized));
  } catch (e) {
    console.warn("IndexedDB put warning:", e);
  }
  try {
    const backup = getAllItemsFromBackup().filter((x) => x.id !== normalized.id);
    backup.push(normalized);
    kv.setItem(BACKUP_ITEMS_KEY, JSON.stringify(backup));
  } catch {}
  if (!fromSync) emitItemChange({ type: "put", item: normalized });
  return normalized;
}

export async function deleteItem(id, { fromSync = false } = {}) {
  try {
    await dbRun("readwrite", (s) => s.delete(id));
  } catch (e) {
    console.warn("IndexedDB delete warning:", e);
  }
  try {
    const backup = getAllItemsFromBackup().filter((x) => x.id !== id);
    kv.setItem(BACKUP_ITEMS_KEY, JSON.stringify(backup));
  } catch {}
  if (!fromSync) emitItemChange({ type: "delete", id });
}

export async function getItem(id) {
  return (await getAllItems()).find((it) => it.id === id) || null;
}

// Remove every item on this device (used by Reset app and Sign out)
export async function clearAllItems() {
  try {
    await dbRun("readwrite", (s) => s.clear());
  } catch (e) {
    console.warn("IndexedDB clear warning:", e);
  }
  kv.removeItem(BACKUP_ITEMS_KEY);
}
