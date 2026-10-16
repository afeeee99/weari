// =====================================================
// Weari — wardrobe app
// Everything is saved in the browser (IndexedDB), so
// no server or database is needed yet.
// =====================================================

// =====================================================
// Wardrobe Karma Configuration & Constants
// Keep all point values, levels, and badges in this constant so they are easy to change.
// =====================================================
const KARMA_CONFIG = {
  POINTS: {
    ADD_ITEM: 10,
    MARK_SWAPPABLE: 15,
    SEND_SWAP_REQUEST: 20,
    WEAR_IDLE_ITEM: 25, // not worn in 30 days or never worn before
    REWEAR_OUTFIT: 10,  // re-wearing an outfit instead of buying new
    SKIP_PURCHASE: 15,  // chose not to buy after a purchase check in Chat
    SELL_ITEM: 20,      // a listed piece was sold (simulated) instead of thrown away
    DONATE_ITEM: 20,    // donated a piece to a donation center
  },
  LEVELS: [
    { name: "Closet Curious", minPoints: 0, icon: "🌱" },
    { name: "Thrift Thinker", minPoints: 50, icon: "🌿" },
    { name: "Swap Starter", minPoints: 120, icon: "🔁" },
    { name: "Wardrobe Hero", minPoints: 220, icon: "⭐" },
    { name: "Planet Stylist", minPoints: 350, icon: "🌍" },
    { name: "Circular Legend", minPoints: 500, icon: "👑" },
  ],
  BADGES: [
    {
      id: "first_item",
      name: "First Item",
      description: "Added your first piece to your digital wardrobe",
      icon: "👗",
    },
    {
      id: "ten_items",
      name: "10 Items Added",
      description: "Curated 10 or more pieces in your closet",
      icon: "✨",
    },
    {
      id: "first_swap_request",
      name: "First Swap Request",
      description: "Sent your first swap request on Rewear",
      icon: "🤝",
    },
    {
      id: "rewear_rookie",
      name: "Rewear Rookie",
      description: "Re-wore an outfit instead of shopping new",
      icon: "🔄",
    },
    {
      id: "seven_day_streak",
      name: "7 Day Streak",
      description: "7 consecutive days of wardrobe engagement",
      icon: "🔥",
    },
    {
      id: "never_worn_rescuer",
      name: "Never-Worn Rescuer",
      description: "Wore or listed an item untouched for 30+ days",
      icon: "🛟",
    },
  ],
};

const KARMA_STORAGE_KEY = "weari-karma";

function extractKarma(rawVal) {
  if (rawVal === null || rawVal === undefined) return null;
  let parsed = rawVal;
  if (typeof rawVal === "string") {
    try {
      parsed = JSON.parse(rawVal);
    } catch {
      const num = Number(rawVal);
      if (!isNaN(num)) return { points: num, unlockedBadges: [], streakDays: 1, lastActiveDate: null };
      return null;
    }
  }
  if (typeof parsed === "number") {
    return { points: parsed, unlockedBadges: [], streakDays: 1, lastActiveDate: null };
  }
  if (parsed && typeof parsed === "object") {
    const points = Number(parsed.points ?? parsed.karma ?? parsed.score ?? parsed.value ?? 0) || 0;
    const unlockedBadges = Array.isArray(parsed.unlockedBadges)
      ? parsed.unlockedBadges
      : Array.isArray(parsed.badges)
      ? parsed.badges
      : [];
    const streakDays = Number(parsed.streakDays ?? parsed.streak ?? 1) || 1;
    const lastActiveDate = parsed.lastActiveDate || parsed.last_active_date || null;
    return { points, unlockedBadges, streakDays, lastActiveDate };
  }
  return null;
}

function getKarma() {
  try {
    const raw = localStorage.getItem(KARMA_STORAGE_KEY);
    if (raw) {
      const parsed = extractKarma(raw);
      if (parsed) return parsed;
    }
    for (const k of ["weari_karma", "karma", "weari-karma-points", "weari_karma_points", "weariKarma"]) {
      const legacyRaw = localStorage.getItem(k);
      if (legacyRaw) {
        const parsed = extractKarma(legacyRaw);
        if (parsed) return parsed;
      }
    }
  } catch {}
  return {
    points: 0,
    unlockedBadges: [],
    lastActiveDate: null,
    streakDays: 1,
  };
}

function saveKarma(data) {
  try {
    localStorage.setItem(KARMA_STORAGE_KEY, JSON.stringify(data));
  } catch {}
  updateKarmaChip();
}

function getLevelInfo(points) {
  const levels = KARMA_CONFIG.LEVELS;
  let currentLevelIdx = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (points >= levels[i].minPoints) {
      currentLevelIdx = i;
      break;
    }
  }
  const current = levels[currentLevelIdx];
  const next = levels[currentLevelIdx + 1] || null;
  let pct = 100;
  let progressText = "Max level reached!";
  if (next) {
    const range = next.minPoints - current.minPoints;
    const progress = Math.max(0, points - current.minPoints);
    pct = range > 0 ? Math.min(100, Math.max(0, Math.round((progress / range) * 100))) : 0;
    progressText = `${points} / ${next.minPoints} pts to ${next.name}`;
  }
  return { current, next, pct, progressText };
}

function updateKarmaChip() {
  const karma = getKarma();
  const chipEl = document.querySelector("#karma-chip-points");
  if (chipEl) {
    chipEl.textContent = karma.points;
  }
}

let karmaPopupTimer = null;
function showKarmaPopup(points, reason = "") {
  const popup = document.querySelector("#karma-popup");
  if (!popup) return;
  popup.textContent = `+${points} Karma! ${reason ? `· ${reason}` : ""}`;
  popup.hidden = false;
  popup.style.animation = "none";
  void popup.offsetWidth;
  popup.style.animation = "";
  clearTimeout(karmaPopupTimer);
  karmaPopupTimer = setTimeout(() => {
    popup.hidden = true;
  }, 2200);
}

function showCelebration(title, desc, icon = "🎉", tag = "Unlocked!") {
  const modal = document.querySelector("#celebration-modal");
  if (!modal) return;
  const titleEl = document.querySelector("#celebration-title");
  const descEl = document.querySelector("#celebration-desc");
  const iconEl = document.querySelector("#celebration-icon");
  const tagEl = document.querySelector("#celebration-tag");
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (iconEl) iconEl.textContent = icon;
  if (tagEl) tagEl.textContent = tag;
  modal.hidden = false;
}

function awardKarma(points, reason = "") {
  if (!points) return;
  const karma = getKarma();
  const prevLevel = getLevelInfo(karma.points).current;

  karma.points += points;
  saveKarma(karma);
  showKarmaPopup(points, reason);

  const newLevel = getLevelInfo(karma.points).current;
  if (newLevel.name !== prevLevel.name) {
    setTimeout(() => {
      showCelebration(
        newLevel.name,
        `Congratulations! You've advanced to ${newLevel.name}. Keep taking conscious wardrobe actions.`,
        newLevel.icon || "🎉",
        "Level Up!"
      );
    }, 450);
  }

  const karmaScreen = document.querySelector("#screen-karma");
  if (karmaScreen && !karmaScreen.hidden) {
    renderKarma();
  }
}

function unlockBadge(badgeId) {
  const karma = getKarma();
  if (karma.unlockedBadges.includes(badgeId)) return;
  const badge = KARMA_CONFIG.BADGES.find((b) => b.id === badgeId);
  if (!badge) return;

  karma.unlockedBadges.push(badgeId);
  saveKarma(karma);

  setTimeout(() => {
    showCelebration(
      badge.name,
      badge.description,
      badge.icon || "🏆",
      "Badge Unlocked!"
    );
  }, 500);

  const karmaScreen = document.querySelector("#screen-karma");
  if (karmaScreen && !karmaScreen.hidden) {
    renderKarma();
  }
}

function updateKarmaStreak() {
  const karma = getKarma();
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!karma.lastActiveDate) {
    karma.lastActiveDate = todayStr;
    karma.streakDays = 1;
    saveKarma(karma);
    return;
  }
  if (karma.lastActiveDate === todayStr) {
    return;
  }
  const lastDate = new Date(karma.lastActiveDate);
  const todayDate = new Date(todayStr);
  const diffDays = Math.round((todayDate - lastDate) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) {
    karma.streakDays = (karma.streakDays || 1) + 1;
  } else if (diffDays > 1) {
    karma.streakDays = 1;
  }
  karma.lastActiveDate = todayStr;
  if (karma.streakDays >= 7) {
    unlockBadge("seven_day_streak");
  }
  saveKarma(karma);
}

// =====================================================
// Circular Impact Calculation Configuration
// Figures for environmental savings per completed swap and avoided purchase.
// NOTE: Official environmental methodology source needs adding.
// =====================================================
const IMPACT_CONFIG = {
  // Estimated environmental savings per completed garment swap
  // (Source needs adding: Lifecycle assessment data for garment lifetime extension vs new garment manufacturing)
  SWAP: {
    CO2_KG: 6.5,        // kg CO2e avoided per completed swap
    WATER_LITERS: 1800,  // liters of clean water preserved per completed swap
  },
  // Estimated environmental savings per purchase avoided by rewearing existing wardrobe pieces
  // (Source needs adding: Average footprint of manufacturing and transporting a new fashion item)
  PURCHASE_AVOIDED: {
    CO2_KG: 8.2,        // kg CO2e avoided per purchase avoided
    WATER_LITERS: 2400,  // liters of clean water preserved per purchase avoided
  },
  // Calculates estimated impact figures based strictly on completed swaps and purchases avoided (not items simply worn)
  calculate(completedSwaps, purchasesAvoided) {
    const swaps = Number(completedSwaps) || 0;
    const avoided = Number(purchasesAvoided) || 0;
    const totalCount = swaps + avoided;
    const co2 = (swaps * this.SWAP.CO2_KG + avoided * this.PURCHASE_AVOIDED.CO2_KG).toFixed(1);
    const water = Math.round(swaps * this.SWAP.WATER_LITERS + avoided * this.PURCHASE_AVOIDED.WATER_LITERS).toLocaleString();
    return {
      completedSwaps: swaps,
      purchasesAvoided: avoided,
      totalCount,
      headline: `Estimated ~${co2} kg CO₂e saved`,
      caption: `Estimated impact: ~${co2} kg CO₂e and ~${water}L water preserved across ${swaps} completed swap${swaps === 1 ? "" : "s"} and ${avoided} purchase${avoided === 1 ? "" : "s"} avoided.`,
      estimateNote: "How we estimate this: Calculations reflect estimated lifecycle carbon and water savings from completed garment swaps and new retail purchases avoided by rewearing.",
    };
  },
};

const COMPLETED_SWAPS_KEY = "weari-completed-swaps";
const PURCHASES_AVOIDED_KEY = "weari-purchases-avoided";

function getCompletedSwapsCount() {
  let count = 0;
  try {
    const requests = getRequests();
    const completedReqs = requests.filter((r) => r && (r.status === "completed" || r.status === "accepted" || r.completed));
    count = Math.max(count, completedReqs.length);
  } catch {}
  try {
    const raw = localStorage.getItem(COMPLETED_SWAPS_KEY);
    if (raw) {
      const num = Number(raw);
      if (!isNaN(num)) count = Math.max(count, num);
    }
    for (const k of ["weari_completed_swaps", "completed_swaps", "completedSwaps"]) {
      const leg = localStorage.getItem(k);
      if (leg) {
        const num = Number(leg);
        if (!isNaN(num)) count = Math.max(count, num);
      }
    }
  } catch {}
  return count;
}

function recordCompletedSwap(qty = 1) {
  try {
    const current = getCompletedSwapsCount();
    const updated = current + qty;
    localStorage.setItem(COMPLETED_SWAPS_KEY, String(updated));
    return updated;
  } catch {
    return 0;
  }
}

function getPurchasesAvoidedCount() {
  let count = 0;
  try {
    const raw = localStorage.getItem(PURCHASES_AVOIDED_KEY);
    if (raw) {
      const num = Number(raw);
      if (!isNaN(num)) count = Math.max(count, num);
    }
    for (const k of ["weari_purchases_avoided", "purchases_avoided", "purchasesAvoided"]) {
      const leg = localStorage.getItem(k);
      if (leg) {
        const num = Number(leg);
        if (!isNaN(num)) count = Math.max(count, num);
      }
    }
  } catch {}
  return count;
}

function recordPurchaseAvoided(qty = 1) {
  try {
    const current = getPurchasesAvoidedCount();
    const updated = current + qty;
    localStorage.setItem(PURCHASES_AVOIDED_KEY, String(updated));
    return updated;
  } catch {
    return 0;
  }
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isWornInLast30Days(item) {
  if (!item || !item.lastWorn) return false;
  const time = new Date(item.lastWorn).getTime();
  if (isNaN(time)) return false;
  return Date.now() - time <= THIRTY_DAYS_MS;
}

function formatLastWorn(dateStr) {
  if (!dateStr) return "Never worn";
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return "Never worn";
  const diffDays = Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Worn today";
  if (diffDays === 1) return "Worn yesterday";
  if (diffDays < 30) return `Worn ${diffDays}d ago`;
  return `Worn on ${new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function describe(it) {
  if (!it) return "";
  if (it.name) return it.name;
  return `${it.color || ""} ${it.category || ""}`.trim();
}

// ---------- The options you can pick from ----------
const CATEGORIES = ["top", "bottom", "dress", "shoes", "outerwear", "accessory"];

const COLORS = [
  { name: "black", hex: "#1c1b1a" },
  { name: "white", hex: "#ffffff" },
  { name: "grey", hex: "#9e9e9e" },
  { name: "beige", hex: "#e4d5b7" },
  { name: "brown", hex: "#7b5236" },
  { name: "red", hex: "#d64545" },
  { name: "pink", hex: "#f2a7c3" },
  { name: "orange", hex: "#f08a3c" },
  { name: "yellow", hex: "#f4d03f" },
  { name: "green", hex: "#4caf6d" },
  { name: "blue", hex: "#4a90e2" },
  { name: "navy", hex: "#22325c" },
  { name: "purple", hex: "#8e5cc4" },
  { name: "multi", hex: "conic-gradient(#d64545, #f4d03f, #4caf6d, #4a90e2, #8e5cc4, #d64545)" },
];

const OCCASIONS = ["casual", "work", "party", "wedding", "date night", "formal", "sport", "travel", "beach"];

// =====================================================
// Storage (IndexedDB + localStorage backup & backward compatibility)
// =====================================================
const DB_NAME = "weari";
const STORE = "items";
const BACKUP_ITEMS_KEY = "weari_items_backup";

const LEGACY_ITEM_STORAGE_KEYS = [
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

const LEGACY_WEAR_COUNT_KEYS = [
  "weari_wear_counts",
  "weari-wear-counts",
  "weari_wears",
  "weari-wears",
  "wear_counts",
  "wearCounts",
];

const LEGACY_OUTFIT_KEYS = [
  "weari-saved-outfits",
  "saved_outfits",
  "saved-outfits",
  "weari_outfits",
  "weari-outfits",
  "outfits",
  "weariSavedOutfits",
];

const LEGACY_KARMA_KEYS = [
  "weari_karma",
  "karma",
  "weari-karma-points",
  "weari_karma_points",
  "weariKarma",
];

const LEGACY_REQUEST_KEYS = [
  "weari_swap_requests",
  "swap_requests",
  "swap-requests",
  "requests",
  "weariSwapRequests",
];

function normalizeItem(raw) {
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
    (typeof placeholderImage === "function" ? placeholderImage(category, color) : "");

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
  };
}

function normalizeOutfit(raw, allItems = []) {
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

function normalizeRequest(raw) {
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

async function dbRun(mode, fn) {
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
    const raw = localStorage.getItem(BACKUP_ITEMS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.map(normalizeItem).filter(Boolean);
    }
  } catch {}
  return [];
}

async function getAllItems() {
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
      const raw = localStorage.getItem(k);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          const items = list.map(normalizeItem).filter(Boolean);
          if (items.length > 0) {
            localStorage.setItem(BACKUP_ITEMS_KEY, JSON.stringify(items));
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

async function saveItem(item) {
  const normalized = normalizeItem(item) || item;
  try {
    await dbRun("readwrite", (s) => s.put(normalized));
  } catch (e) {
    console.warn("IndexedDB put warning:", e);
  }
  try {
    const backup = getAllItemsFromBackup().filter((x) => x.id !== normalized.id);
    backup.push(normalized);
    localStorage.setItem(BACKUP_ITEMS_KEY, JSON.stringify(backup));
  } catch {}
}

async function deleteItem(id) {
  try {
    await dbRun("readwrite", (s) => s.delete(id));
  } catch (e) {
    console.warn("IndexedDB delete warning:", e);
  }
  try {
    const backup = getAllItemsFromBackup().filter((x) => x.id !== id);
    localStorage.setItem(BACKUP_ITEMS_KEY, JSON.stringify(backup));
  } catch {}
}

let isMigrated = false;
async function migrateAllData() {
  if (isMigrated) return;
  isMigrated = true;

  try {
    // 1. Standalone wear counts in localStorage
    const standaloneWears = {};
    for (const k of LEGACY_WEAR_COUNT_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            for (const [id, val] of Object.entries(parsed)) {
              if (typeof val === "number") {
                const prev = typeof standaloneWears[id] === "number" ? standaloneWears[id] : standaloneWears[id]?.count || 0;
                standaloneWears[id] = Math.max(prev, val);
              } else if (val && typeof val === "object") {
                const count = Number(val.count || val.wearCount || val.wears || 0);
                const lastWorn = val.lastWorn || val.last_worn || null;
                const prevCount = typeof standaloneWears[id] === "number" ? standaloneWears[id] : standaloneWears[id]?.count || 0;
                standaloneWears[id] = {
                  count: Math.max(prevCount, count),
                  lastWorn: lastWorn || standaloneWears[id]?.lastWorn,
                };
              }
            }
          }
        }
      } catch {}
    }

    // 2. Discover items from all legacy keys
    const discovered = new Map();
    for (const k of [BACKUP_ITEMS_KEY, ...LEGACY_ITEM_STORAGE_KEYS]) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          const list = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" ? Object.values(parsed) : []);
          for (const rawIt of list) {
            const item = normalizeItem(rawIt);
            if (item) {
              if (!discovered.has(item.id)) {
                discovered.set(item.id, item);
              } else {
                const existing = discovered.get(item.id);
                if ((item.wearCount || 0) > (existing.wearCount || 0)) existing.wearCount = item.wearCount;
                if (item.lastWorn && !existing.lastWorn) existing.lastWorn = item.lastWorn;
              }
            }
          }
        }
      } catch {}
    }

    // Apply standalone wear counts to discovered
    for (const [id, wearInfo] of Object.entries(standaloneWears)) {
      if (discovered.has(id)) {
        const it = discovered.get(id);
        const count = typeof wearInfo === "number" ? wearInfo : wearInfo.count;
        const last = typeof wearInfo === "object" ? wearInfo.lastWorn : null;
        if (count > (it.wearCount || 0)) it.wearCount = count;
        if (last && !it.lastWorn) it.lastWorn = last;
      }
    }

    // 3. Read existing IndexedDB items
    let dbItems = [];
    try {
      dbItems = await dbRun("readonly", (s) => s.getAll()) || [];
    } catch {}

    const dbMap = new Map();
    for (const rawIt of dbItems) {
      const it = normalizeItem(rawIt);
      if (it) dbMap.set(it.id, it);
    }

    // Merge discovered into dbMap & persist
    for (const [id, discItem] of discovered.entries()) {
      if (!dbMap.has(id)) {
        dbMap.set(id, discItem);
        try { await dbRun("readwrite", (s) => s.put(discItem)); } catch {}
      } else {
        const existing = dbMap.get(id);
        let updated = false;
        if ((discItem.wearCount || 0) > (existing.wearCount || 0)) {
          existing.wearCount = discItem.wearCount;
          updated = true;
        }
        if (discItem.lastWorn && !existing.lastWorn) {
          existing.lastWorn = discItem.lastWorn;
          updated = true;
        }
        if (updated) {
          try { await dbRun("readwrite", (s) => s.put(existing)); } catch {}
        }
      }
    }

    // Apply standalone wear counts to dbMap items
    for (const [id, wearInfo] of Object.entries(standaloneWears)) {
      if (dbMap.has(id)) {
        const existing = dbMap.get(id);
        const count = typeof wearInfo === "number" ? wearInfo : wearInfo.count;
        const last = typeof wearInfo === "object" ? wearInfo.lastWorn : null;
        let updated = false;
        if (count > (existing.wearCount || 0)) {
          existing.wearCount = count;
          updated = true;
        }
        if (last && !existing.lastWorn) {
          existing.lastWorn = last;
          updated = true;
        }
        if (updated) {
          try { await dbRun("readwrite", (s) => s.put(existing)); } catch {}
        }
      }
    }

    // Save consolidated backup in localStorage
    try {
      const allMerged = Array.from(dbMap.values());
      if (allMerged.length > 0) {
        localStorage.setItem(BACKUP_ITEMS_KEY, JSON.stringify(allMerged));
      }
    } catch {}

    // 4. Migrate Karma points, badges, streak
    const karma = getKarma();
    for (const k of LEGACY_KARMA_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const leg = extractKarma(raw);
          if (leg) {
            karma.points = Math.max(karma.points, leg.points);
            karma.unlockedBadges = Array.from(new Set([...karma.unlockedBadges, ...leg.unlockedBadges]));
            karma.streakDays = Math.max(karma.streakDays, leg.streakDays);
            if (leg.lastActiveDate && !karma.lastActiveDate) karma.lastActiveDate = leg.lastActiveDate;
          }
        }
      } catch {}
    }
    saveKarma(karma);

    // 5. Migrate Saved Outfits
    const outfits = getSavedOutfits();
    const outfitMap = new Map(outfits.map((o) => [o.id, o]));
    for (const k of LEGACY_OUTFIT_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const o of list) {
              const norm = normalizeOutfit(o);
              if (norm && !outfitMap.has(norm.id)) {
                outfitMap.set(norm.id, norm);
              }
            }
          }
        }
      } catch {}
    }
    saveSavedOutfits(Array.from(outfitMap.values()));

    // 6. Migrate Swap Requests
    const reqs = getRequests();
    const reqMap = new Map(reqs.map((r) => [r.id, r]));
    for (const k of LEGACY_REQUEST_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const r of list) {
              const norm = normalizeRequest(r);
              if (norm && !reqMap.has(norm.id)) {
                reqMap.set(norm.id, norm);
              }
            }
          }
        }
      } catch {}
    }
    saveRequests(Array.from(reqMap.values()));
  } catch (err) {
    console.error("Migration warning:", err);
  }
}

// =====================================================
// Photo: shrink it before saving so storage stays small
// =====================================================
function resizeImage(file, maxSize = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================
// Screens (switching between Wardrobe and Add item)
// =====================================================
const $ = (sel) => document.querySelector(sel);

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== `screen-${name}`));
  // Rewear screens open from the Closet, so the Wardrobe tab stays highlighted
  const tabName = name.startsWith("rewear-") || name === "my-rewear" ? "wardrobe" : name === "friends" ? "swap" : name;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.go === tabName));
  window.scrollTo(0, 0);
  if (name === "wardrobe") {
    renderWardrobe();
    renderSavedForLater();
  }
  if (name === "style") {
    renderStyleOccasions();
    renderManualOutfit();
    renderManualLabelChips();
    renderSavedOutfits();
    if (typeof renderFavorites === "function") renderFavorites();
    if (typeof renderWeeklyPlan === "function") renderWeeklyPlan();
    if (currentStyleMode === "chat") renderChat();
  }
  if (name === "swap") renderSwap();
  if (name === "rewear-sell") renderSellScreen();
  if (name === "rewear-swap") renderRewearSwapScreen();
  if (name === "rewear-donate") renderDonateScreen();
  if (name === "my-rewear") renderMyRewear();
  if (name === "friends") renderFriends();
  if (name === "insights") renderInsights();
  if (name === "karma") renderKarma();
  if (name === "profile" && typeof renderProfileScreen === "function") renderProfileScreen();
}

document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (!go) return;
  closeSheet();
  showScreen(go.dataset.go);
});

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

// =====================================================
// Wardrobe screen
// =====================================================
let activeFilter = "all";

function colorHex(name) {
  return (COLORS.find((c) => c.name === name) || {}).hex || "#ccc";
}

// Simple original flat-color drawings for items without a photo (demo pieces, fallbacks).
// `kind` picks a variant shape: "heel" for dressy shoes, "bag" or "belt" for accessories.
const PLACEHOLDER_SHAPES = {
  top: '<path d="M70 50 L100 40 Q120 56 140 40 L170 50 L196 84 L172 98 L162 86 L162 176 L78 176 L78 86 L68 98 L44 84 Z"/>',
  bottom: '<path d="M80 36 L160 36 L172 184 L132 184 L120 88 L108 184 L68 184 Z"/>',
  dress: '<path d="M96 34 L144 34 L140 70 L176 186 L64 186 L100 70 Z"/>',
  outerwear: '<path d="M66 46 L100 36 L120 96 L140 36 L174 46 L198 168 L172 172 L166 112 L166 186 L74 186 L74 112 L68 172 L42 168 Z"/><path d="M120 96 L120 186" stroke="rgba(0,0,0,.18)" stroke-width="4" fill="none"/>',
  shoes: '<path d="M40 150 L40 118 Q60 104 92 112 L120 128 Q170 132 196 148 L200 168 L40 168 Z"/><rect x="40" y="160" width="160" height="10" rx="4" fill="rgba(0,0,0,.18)"/>',
  skirt: '<rect x="84" y="38" width="72" height="16" rx="4"/><path d="M86 54 L154 54 L188 184 L52 184 Z"/><path d="M106 66 L94 180 M134 66 L146 180 M120 66 L120 182" stroke="rgba(0,0,0,.14)" stroke-width="4" fill="none"/>',
  sandal: '<path d="M36 172 Q36 160 58 158 L118 160 Q160 150 194 120 L204 128 Q172 168 128 176 L60 180 Q36 182 36 172 Z"/><rect x="178" y="130" width="20" height="60" rx="4"/><path d="M60 160 Q76 128 100 160 M144 152 Q154 112 196 120 M166 104 Q186 94 204 112" stroke="currentColor" stroke-width="9" stroke-linecap="round" fill="none"/>',
  heel: '<path d="M50 132 Q90 112 130 136 Q160 150 196 150 L196 162 L132 162 Q100 150 72 162 L64 196 L54 196 L52 160 Z"/><path d="M110 126 L126 112 M140 142 L150 124" stroke="rgba(0,0,0,.25)" stroke-width="5" fill="none"/>',
  bag: '<path d="M88 92 Q88 50 120 50 Q152 50 152 92" stroke="currentColor" stroke-width="10" fill="none"/><path d="M60 92 L180 92 L168 184 L72 184 Z"/>',
  belt: '<rect x="30" y="104" width="180" height="32" rx="6"/><rect x="98" y="96" width="44" height="48" rx="6" fill="none" stroke="#c9a54a" stroke-width="8"/>',
  accessory: '<circle cx="120" cy="120" r="54"/><circle cx="120" cy="120" r="24" fill="#f4f1ec"/>',
};

// Pick the drawing that matches an item's name, e.g. a "midi skirt" gets a skirt, not trousers
const PLACEHOLDER_KEYWORDS = [
  [/\bskirts?\b/, "skirt"],
  [/\bsandals?\b/, "sandal"],
  [/\b(heels?|pumps?|stilettos?)\b/, "heel"],
  [/\b(tote|bag|handbag|clutch|purse|backpack)\b/, "bag"],
  [/\bbelt\b/, "belt"],
];

function placeholderKind(item) {
  const name = String((item && (item.name || item.itemName || item.title)) || "").toLowerCase();
  const match = PLACEHOLDER_KEYWORDS.find(([re]) => re.test(name));
  return match ? match[1] : undefined;
}

// Uploaded photos are kept; generated drawings are redrawn to match the item's name
function itemIllustration(item, fallbackPhoto) {
  const photo = fallbackPhoto || "";
  if (photo && !photo.startsWith("data:image/svg+xml")) return photo;
  return placeholderImage(item.category, item.color, placeholderKind(item));
}

function placeholderImage(category, color, kind) {
  const fill = colorHex(color);
  const outline = ["white", "beige"].includes(color) ? "#cfc6b8" : "none";
  const shape = PLACEHOLDER_SHAPES[kind] || PLACEHOLDER_SHAPES[category] || PLACEHOLDER_SHAPES.accessory;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="#f4f1ec"/><g fill="${fill}" color="${fill}" stroke="${outline}" stroke-width="2" stroke-linejoin="round">${shape}</g></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function renderFilters(items) {
  const options = ["all", ...CATEGORIES, "swap"];
  $("#filters").innerHTML = options
    .map((opt) => {
      const label = opt === "swap" ? "Up for swap" : opt === "all" ? `All (${items.length})` : opt;
      return `<button class="chip ${opt === activeFilter ? "selected" : ""}" data-filter="${opt}">${label}</button>`;
    })
    .join("");
}

$("#filters").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  renderWardrobe();
});

async function renderWardrobe() {
  const items = (await getAllItems()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const countEl = $("#item-count");
  if (countEl) {
    countEl.textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "";
  }

  $("#empty-state").hidden = items.length > 0;
  $("#filters").hidden = items.length === 0;
  renderFilters(items);
  renderProfileCard();

  const shown = items.filter((it) =>
    activeFilter === "all" ? true : activeFilter === "swap" ? it.swappable : it.category === activeFilter
  );

  const grid = $("#grid");
  if (activeFilter === "all") {
    // One collage tile per category, made from the newest pieces in it
    grid.className = "grid collage-grid";
    grid.innerHTML = CATEGORIES.map((cat) => items.filter((it) => it.category === cat))
      .map((group, i) => {
        if (!group.length) return "";
        const cat = group[0].category;
        const name = CLOSET_TILE_NAMES[cat] || cat;
        return `
        <article class="collage-tile-wrap" data-closet-category="${cat}" tabindex="0" role="button" aria-label="${name}, ${group.length} piece${group.length === 1 ? "" : "s"}">
          ${collageTileHtml(group.map((it) => it.photo), i)}
          <h3 class="collage-name">${name}</h3>
          <span class="collage-count">${group.length} piece${group.length === 1 ? "" : "s"}</span>
        </article>`;
      })
      .join("");
  } else {
    grid.className = "grid collage-grid";
    grid.innerHTML = shown
      .map(
        (it, i) => `
        <article class="collage-tile-wrap wardrobe-card" data-card-item-id="${it.id}" tabindex="0" role="button" aria-label="${describe(it)}">
          ${collageTileHtml([it.photo], i)}
          ${it.swappable ? `<span class="swap-dot" title="Up for swap"></span>` : ""}
          <h3 class="collage-name">${describe(it)}</h3>
          <span class="collage-count">${(it.occasions && it.occasions.length ? it.occasions : ["casual"]).join(" · ")}</span>
        </article>`
      )
      .join("");
  }

  if (items.length && !shown.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted)">Nothing here yet.</p>`;
  }
}

// ---------- Collage tiles (Closet, Favorites) ----------
const CLOSET_TILE_NAMES = {
  top: "Tops", bottom: "Bottoms", dress: "Dresses", shoes: "Shoes", outerwear: "Outerwear", accessory: "Accessories",
};
const COLLAGE_COLORS = ["sage", "pink", "cognac", "cream"];
// Where 1 to 4 photos sit on a tile: left %, top %, width %, rotation
const COLLAGE_LAYOUTS = [
  [[14, 12, 72, -4]],
  [[6, 10, 54, -7], [42, 30, 54, 6]],
  [[4, 6, 50, -8], [46, 10, 50, 7], [22, 44, 52, -3]],
  [[4, 4, 48, -8], [48, 6, 46, 7], [6, 48, 46, 5], [50, 50, 46, -6]],
];

function collageTileHtml(photos, colorIndex = 0) {
  const shown = photos.filter(Boolean).slice(0, 4);
  const layout = COLLAGE_LAYOUTS[Math.max(0, shown.length - 1)];
  const color = COLLAGE_COLORS[colorIndex % COLLAGE_COLORS.length];
  return `
    <div class="collage-tile collage-${color}">
      ${shown
        .map((src, i) => {
          const [left, top, width, rot] = layout[i];
          return `<img src="${src}" alt="" loading="lazy" style="left:${left}%;top:${top}%;width:${width}%;transform:rotate(${rot}deg)" />`;
        })
        .join("")}
    </div>`;
}

async function openItemDetailSheet(itemId) {
  const items = await getAllItems();
  const it = items.find((x) => x.id === itemId);
  if (!it) return;

  const html = `
    <div class="item-detail-sheet">
      <div class="item-detail-header">
        <div class="item-detail-title-group">
          <h2 class="item-detail-name">${describe(it)}</h2>
          <div class="item-detail-meta">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="item-detail-cat">${it.category}</span>
            <span class="item-detail-sep">·</span>
            <span class="item-detail-color">${it.color}</span>
          </div>
        </div>
        <button type="button" class="btn-detail-close" aria-label="Close" data-close-sheet>✕</button>
      </div>

      <div class="item-detail-media">
        <img src="${it.photo}" alt="${describe(it)}" />
        ${it.swappable ? `<span class="item-detail-swappable-badge"><span>🔁</span> Available to swap</span>` : ""}
      </div>

      <div class="item-detail-body">
        <div class="item-detail-section">
          <label class="item-detail-label">Occasions</label>
          <div class="tags">
            ${it.occasions && it.occasions.length ? it.occasions.map((o) => `<span class="tag">${o}</span>`).join("") : `<span class="tag">casual</span>`}
          </div>
        </div>

        <div class="item-detail-section item-detail-wear-box">
          <div class="item-detail-wear-status">
            <div class="item-detail-wear-count">
              <strong>${it.wearCount || 0}</strong>
              <span>wear${it.wearCount === 1 ? "" : "s"} logged</span>
            </div>
            <div class="item-detail-last-worn">
              <span class="item-detail-wear-pill">${formatLastWorn(it.lastWorn)}</span>
            </div>
          </div>
          <button type="button" class="btn-primary btn-mark-worn-sheet" data-sheet-mark-worn="${it.id}">
            ✓ Mark as worn ${it.wearCount ? `(${it.wearCount}×)` : ""}
          </button>
        </div>

        ${rewearSheetSection(it)}

        <div class="item-detail-actions">
          <button type="button" class="btn-outline-action" data-sheet-toggle-swap="${it.id}">
            ${it.swappable ? "Remove from swap feed" : "List on Rewear (+15 pts)"}
          </button>
          <button type="button" class="btn-danger-link" data-sheet-delete="${it.id}">
            Remove from wardrobe
          </button>
        </div>
      </div>
    </div>
  `;
  openSheet(html);
}

$("#grid").addEventListener("click", async (e) => {
  const tile = e.target.closest("[data-closet-category]");
  if (tile) {
    activeFilter = tile.dataset.closetCategory;
    renderWardrobe();
    return;
  }
  const card = e.target.closest("[data-card-item-id]");
  if (card) {
    openItemDetailSheet(card.dataset.cardItemId);
    return;
  }
});

$("#grid").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const tile = e.target.closest("[data-closet-category]");
    if (tile) {
      e.preventDefault();
      activeFilter = tile.dataset.closetCategory;
      renderWardrobe();
      return;
    }
    const card = e.target.closest("[data-card-item-id]");
    if (card) {
      e.preventDefault();
      openItemDetailSheet(card.dataset.cardItemId);
    }
  }
});

// =====================================================
// Add item screen
// =====================================================
const form = {
  photo: null,
  name: "",
  category: null,
  color: null,
  occasions: new Set(),
};

function buildAddForm() {
  $("#category-chips").innerHTML = CATEGORIES.map(
    (c) => `<button type="button" class="chip" data-category="${c}">${c}</button>`
  ).join("");

  $("#color-swatches").innerHTML = COLORS.map(
    (c) => `<button type="button" class="swatch" data-color="${c.name}" title="${c.name}" aria-label="${c.name}" style="background:${c.hex}"></button>`
  ).join("");

  $("#occasion-chips").innerHTML = OCCASIONS.map(
    (o) => `<button type="button" class="chip" data-occasion="${o}">${o}</button>`
  ).join("");
}

// Auto-tagging with Gemini Vision (called only when user taps "Auto-tag with Gemini")
let activeTagController = null;
let pendingSmallPhoto = null;

// Talking to the Weari server (Gemini lives there, never in the browser)
const STYLIST_BREAK_MSG = "The stylist needs a short break, so this is a basic suggestion.";

async function callApi(path, body, { timeoutMs = 20000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort());
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const TAG_SOURCE_LABELS = {
  gemini: "Tagged by Gemini",
  mock: "Auto-tagged (test mode, not real Gemini)",
  rules: "Auto-tagged (basic rules)",
};

async function autoTagPhoto(smallPhotoDataUrl) {
  if (activeTagController) {
    activeTagController.abort();
  }
  const controller = new AbortController();
  activeTagController = controller;

  const btnAutotag = $("#btn-autotag");
  const statusEl = $("#autotag-status");
  const badgeEl = $("#gemini-tag-badge");
  const hintEl = $("#autotag-hint");

  if (hintEl) hintEl.hidden = true;
  if (badgeEl) badgeEl.hidden = true;
  if (btnAutotag) {
    btnAutotag.disabled = true;
    btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Gemini is looking...`;
  }
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.innerHTML = `<span class="sparkle-icon">✨</span><span>Gemini is looking...</span>`;
  }

  let data;
  try {
    const res = await callApi("/api/tag", { image: smallPhotoDataUrl }, { timeoutMs: 15000, signal: controller.signal });
    data = { source: res.source, data: res.tags };
  } catch (err) {
    if (activeTagController !== controller) return; // a newer photo replaced this one
    console.warn("Gemini auto-tag unavailable, using basic rules:", err.message);
    // Basic rules: keep what the user already picked, otherwise sensible defaults
    const autoCategory = form.category || "top";
    const autoColor = form.color || "black";
    const autoOccasions = form.occasions.size ? Array.from(form.occasions) : ["casual"];
    data = {
      source: "rules",
      data: {
        name: `${autoColor.charAt(0).toUpperCase() + autoColor.slice(1)} ${autoCategory}`,
        category: autoCategory,
        color: autoColor,
        occasions: autoOccasions,
      },
    };
  }

  try {
    const { name, category, color, occasions } = data.data;

    if (statusEl) statusEl.hidden = true;
    if (btnAutotag) btnAutotag.hidden = true;
    if (badgeEl) {
      const label = TAG_SOURCE_LABELS[data.source] || TAG_SOURCE_LABELS.rules;
      badgeEl.innerHTML = `<span class="sparkle-icon">✨</span><span class="tag-badge-text">${label}</span>`;
      badgeEl.hidden = false;
    }

    // If Gemini couldn't help, say so plainly
    if (hintEl) {
      hintEl.textContent = data.source === "rules" ? STYLIST_BREAK_MSG : "";
      hintEl.hidden = data.source !== "rules";
    }

    // Fill only the fields the user hasn't already filled in
    const nameInput = $("#item-name-input");
    const currentTypedName = (nameInput && nameInput.value.trim()) || form.name;
    if (!currentTypedName && name) {
      form.name = name;
      if (nameInput) nameInput.value = name;
    }

    // Pre-fill category only if user has not chosen one yet
    if (!form.category && category && CATEGORIES.includes(category)) {
      form.category = category;
      document.querySelectorAll("[data-category]").forEach((b) =>
        b.classList.toggle("selected", b.dataset.category === category)
      );
    }

    // Pre-fill color only if user has not chosen one yet
    if (!form.color && color && COLORS.some((c) => c.name === color)) {
      form.color = color;
      document.querySelectorAll("[data-color]").forEach((b) =>
        b.classList.toggle("selected", b.dataset.color === color)
      );
    }

    // Pre-fill occasions only if user has not selected any yet
    if (form.occasions.size === 0 && Array.isArray(occasions) && occasions.length > 0) {
      form.occasions = new Set(occasions.filter((o) => OCCASIONS.includes(o)));
      document.querySelectorAll("[data-occasion]").forEach((b) =>
        b.classList.toggle("selected", form.occasions.has(b.dataset.occasion))
      );
    }
  } catch (err) {
    console.error("Auto-tag failed:", err);
    if (statusEl) statusEl.hidden = true;
    if (btnAutotag) {
      btnAutotag.disabled = false;
      btnAutotag.hidden = false;
      btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Auto-tag with Gemini`;
    }
    const msg = "Couldn't auto-tag this one, please fill it in yourself";
    if (hintEl) {
      hintEl.textContent = msg;
      hintEl.hidden = false;
    }
    toast(msg);
  } finally {
    if (activeTagController === controller) {
      activeTagController = null;
    }
  }
}

// Hook up "✨ Auto-tag with Gemini" button
$("#btn-autotag")?.addEventListener("click", () => {
  if (!pendingSmallPhoto) return;
  autoTagPhoto(pendingSmallPhoto);
});

// Pick one category
$("#category-chips").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-category]");
  if (!btn) return;
  form.category = btn.dataset.category;
  document.querySelectorAll("[data-category]").forEach((b) => b.classList.toggle("selected", b === btn));
});

// Pick one color
$("#color-swatches").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-color]");
  if (!btn) return;
  form.color = btn.dataset.color;
  document.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("selected", b === btn));
});

// Pick any number of occasions
$("#occasion-chips").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-occasion]");
  if (!btn) return;
  const o = btn.dataset.occasion;
  form.occasions.has(o) ? form.occasions.delete(o) : form.occasions.add(o);
  btn.classList.toggle("selected");
});

// Item name manual input
$("#item-name-input")?.addEventListener("input", (e) => {
  form.name = e.target.value.trim();
});

// Photo selection & Camera Scanning
function resizeDataUrl(dataUrl, maxSize = 512, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function handlePhotoSelected(source) {
  try {
    if (activeTagController) {
      activeTagController.abort();
      activeTagController = null;
    }

    if (source instanceof File || source instanceof Blob) {
      form.photo = await resizeImage(source, 900, 0.82);
      pendingSmallPhoto = await resizeImage(source, 512, 0.7);
    } else if (typeof source === "string") {
      form.photo = source;
      pendingSmallPhoto = await resizeDataUrl(source, 512, 0.7);
    }

    $("#photo-preview").src = form.photo;
    $("#photo-preview").hidden = false;
    $("#photo-placeholder").hidden = true;

    const photoRow = $("#photo-row");
    if (photoRow) photoRow.classList.add("has-photo");
    const photoAside = $("#photo-aside");
    if (photoAside) photoAside.hidden = false;

    const btnAutotag = $("#btn-autotag");
    if (btnAutotag) {
      btnAutotag.hidden = false;
      btnAutotag.disabled = false;
      btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Auto-tag with Gemini`;
    }
    const tagBadge = $("#gemini-tag-badge");
    if (tagBadge) tagBadge.hidden = true;
    const tagStatus = $("#autotag-status");
    if (tagStatus) tagStatus.hidden = true;
    const tagHint = $("#autotag-hint");
    if (tagHint) tagHint.hidden = true;
  } catch (err) {
    showError(err.message || "Could not read that photo");
  }
}

// Camera Viewfinder Lifecycle
let cameraStream = null;
let currentFacingMode = "environment";
let capturedPhoto512 = null;

function resetCameraReviewUI() {
  const video = $("#camera-video");
  const frozenImg = $("#camera-frozen-img");
  const guide = $("#camera-guide");
  const captureControls = $("#camera-capture-controls");
  const reviewControls = $("#camera-review-controls");

  if (frozenImg) {
    frozenImg.src = "";
    frozenImg.hidden = true;
  }
  if (video) {
    video.hidden = false;
    if (cameraStream && video.paused) {
      video.play().catch(() => {});
    }
  }
  if (guide) guide.hidden = false;
  if (captureControls) captureControls.hidden = false;
  if (reviewControls) reviewControls.hidden = true;
  capturedPhoto512 = null;
}

function captureAndResizeCameraFrame(video, maxSize = 512, quality = 0.82) {
  const vWidth = video.videoWidth || 640;
  const vHeight = video.videoHeight || 480;
  const scale = Math.min(1, maxSize / Math.max(vWidth, vHeight));
  const targetW = Math.max(1, Math.round(vWidth * scale));
  const targetH = Math.max(1, Math.round(vHeight * scale));

  const canvas = $("#camera-canvas") || document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", quality);
}

// The same full-screen camera serves Add item ("add") and Buying Brain ("buycheck")
let cameraPurpose = "add";
let cameraFlipping = false;

async function startCameraScan(purpose = "add") {
  const modal = $("#camera-modal");
  const video = $("#camera-video");
  const fallbackInput = $("#camera-fallback-file");

  // A fresh scan starts with an empty price (flipping the camera keeps it)
  if (!cameraFlipping && $("#camera-price")) $("#camera-price").value = "";
  cameraFlipping = false;
  cameraPurpose = purpose;
  const isBuyCheck = purpose === "buycheck";
  $("#camera-guide-text").textContent = isBuyCheck ? "Point at an item you’re thinking of buying" : "Place one item in the frame";
  $("#camera-price-wrap").hidden = !isBuyCheck;

  resetCameraReviewUI();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Camera is unavailable on this device. Opening file picker instead.");
    fallbackInput?.click();
    return;
  }

  try {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
    } catch (constrainedErr) {
      console.warn("Retrying camera with general constraints...", constrainedErr);
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }

    if (video) {
      video.srcObject = cameraStream;
      await video.play().catch(() => {});
    }

    if (modal) modal.hidden = false;
    const flipBtn = $("#camera-flip");
    if (flipBtn) flipBtn.hidden = false;
  } catch (err) {
    console.warn("Camera getUserMedia blocked or unavailable:", err);
    stopCameraScan();
    toast("Camera is blocked or unavailable. Please choose a photo from files.");
    fallbackInput?.click();
  }
}

function stopCameraScan() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const video = $("#camera-video");
  if (video) {
    video.srcObject = null;
  }
  const modal = $("#camera-modal");
  if (modal) modal.hidden = true;
  resetCameraReviewUI();
}

$("#camera-close")?.addEventListener("click", stopCameraScan);
$("#camera-backdrop")?.addEventListener("click", stopCameraScan);

// Freeze photo, resize to 512px, show "Use photo" and "Retake"
$("#camera-snap")?.addEventListener("click", () => {
  const video = $("#camera-video");
  if (!video) return;

  try {
    const resized512 = captureAndResizeCameraFrame(video, 512, 0.82);
    capturedPhoto512 = resized512;

    // Freeze video stream visually
    video.pause();
    video.hidden = true;

    // Show frozen preview
    const frozenImg = $("#camera-frozen-img");
    if (frozenImg) {
      frozenImg.src = resized512;
      frozenImg.hidden = false;
    }

    // Hide guide box during review
    const guide = $("#camera-guide");
    if (guide) guide.hidden = true;

    // Switch buttons to review mode
    const captureControls = $("#camera-capture-controls");
    if (captureControls) captureControls.hidden = true;
    const reviewControls = $("#camera-review-controls");
    if (reviewControls) reviewControls.hidden = false;
  } catch (err) {
    console.error("Failed to capture frame:", err);
    toast("Could not capture photo. Please try again.");
  }
});

// Retake photo: resume live camera preview
$("#camera-retake")?.addEventListener("click", () => {
  resetCameraReviewUI();
});

// Use photo: stop camera stream and fill Add item form with the 512px photo
$("#camera-use-photo")?.addEventListener("click", () => {
  if (!capturedPhoto512) return;
  const photoToUse = capturedPhoto512;
  const price = $("#camera-price")?.value;
  stopCameraScan();
  if (cameraPurpose === "buycheck") runBuyCheck(photoToUse, price);
  else handlePhotoSelected(photoToUse);
});

$("#camera-flip")?.addEventListener("click", () => {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  cameraFlipping = true;
  startCameraScan(cameraPurpose);
});

$("#camera-fallback-file")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const price = $("#camera-price")?.value;
  stopCameraScan();
  if (cameraPurpose === "buycheck") runBuyCheck(await resizeImage(file, 512, 0.82), price);
  else handlePhotoSelected(file);
});

$("#btn-camera-scan")?.addEventListener("click", () => {
  startCameraScan();
});

$("#btn-rescan")?.addEventListener("click", () => {
  startCameraScan();
});

// File upload
$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  handlePhotoSelected(file);
});

function showError(msg) {
  const el = $("#form-error");
  el.textContent = msg;
  el.hidden = !msg;
}

function resetForm() {
  if (activeTagController) {
    activeTagController.abort();
    activeTagController = null;
  }
  pendingSmallPhoto = null;
  form.photo = null;
  form.name = "";
  form.category = null;
  form.color = null;
  form.occasions.clear();
  $("#add-form").reset();
  const nameInput = $("#item-name-input");
  if (nameInput) nameInput.value = "";
  const photoRow = $("#photo-row");
  if (photoRow) photoRow.classList.remove("has-photo");
  const photoAside = $("#photo-aside");
  if (photoAside) photoAside.hidden = true;
  const btnAutotag = $("#btn-autotag");
  if (btnAutotag) {
    btnAutotag.hidden = false;
    btnAutotag.disabled = false;
    btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Auto-tag with Gemini`;
  }
  const tagBadge = $("#gemini-tag-badge");
  if (tagBadge) tagBadge.hidden = true;
  const tagStatus = $("#autotag-status");
  if (tagStatus) tagStatus.hidden = true;
  const tagHint = $("#autotag-hint");
  if (tagHint) tagHint.hidden = true;
  $("#photo-preview").hidden = true;
  $("#photo-placeholder").hidden = false;
  document.querySelectorAll("#screen-add .selected").forEach((el) => el.classList.remove("selected"));
  showError("");
}

// Save
$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.photo) return showError("Please add a photo.");
  if (!form.category) return showError("Please pick a category.");
  if (!form.color) return showError("Please pick a color.");

  const isSwappable = $("#swap-input").checked;
  const nameInput = $("#item-name-input");
  const itemName = (nameInput && nameInput.value.trim()) || form.name || "";

  await saveItem({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: itemName,
    photo: form.photo,
    category: form.category,
    color: form.color,
    occasions: [...form.occasions],
    swappable: isSwappable,
    createdAt: Date.now(),
  });

  awardKarma(KARMA_CONFIG.POINTS.ADD_ITEM, "Added new piece");
  unlockBadge("first_item");
  const allItems = await getAllItems();
  if (allItems.length >= 10) unlockBadge("ten_items");

  if (isSwappable) {
    awardKarma(KARMA_CONFIG.POINTS.MARK_SWAPPABLE, "Available to swap");
  }

  resetForm();
  activeFilter = "all";
  showScreen("wardrobe");

  // Show "Scan another" banner so user can add many items rapidly
  const quickBanner = $("#quick-add-banner");
  if (quickBanner) quickBanner.hidden = false;

  document.dispatchEvent(new CustomEvent("item-saved"));

  toast("Added to your wardrobe ✨");
});

// "Scan another" button click handler
$("#btn-scan-another")?.addEventListener("click", () => {
  const quickBanner = $("#quick-add-banner");
  if (quickBanner) quickBanner.hidden = true;
  resetForm();
  showScreen("add");
  startCameraScan();
});

// =====================================================
// Style me screen — Dual Modes: AI Stylist & Create your own
// =====================================================
let currentStyleMode = "chat";
let styleOccasion = null;
let lastOutfitIds = [];

// Saved Custom Outfits Storage
const SAVED_OUTFITS_KEY = "weari_saved_outfits";

// Outfit labels: built-in ones plus my own, saved under their own key
const CUSTOM_LABELS_KEY = "weari_custom_labels";
const BUILTIN_LABELS = ["Work", "Gym", "Weekend"];
let manualLabel = "";
let stylistLabel = ""; // label for the current Stylist suggestion
let activeSavedFilter = "all";

function getSavedOutfits() {
  try {
    const raw = localStorage.getItem(SAVED_OUTFITS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list.map((o) => normalizeOutfit(o)).filter(Boolean);
    }
    for (const key of LEGACY_OUTFIT_KEYS) {
      const legacyRaw = localStorage.getItem(key);
      if (legacyRaw) {
        const list = JSON.parse(legacyRaw);
        if (Array.isArray(list) && list.length > 0) return list.map((o) => normalizeOutfit(o)).filter(Boolean);
      }
    }
  } catch {
    return [];
  }
  return [];
}

function saveSavedOutfits(list) {
  try {
    localStorage.setItem(SAVED_OUTFITS_KEY, JSON.stringify(list));
  } catch {}
}

// Manual Outfit Slot State
const manualSlots = {
  top: null,
  "bottom-or-dress": null,
  shoes: null,
  outerwear: null,
  accessory: null,
};

let activePickerSlot = null;

// Style Mode Tabs Switcher
document.querySelectorAll("#style-mode-tabs [data-style-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentStyleMode = btn.dataset.styleMode;
    document.querySelectorAll("#style-mode-tabs [data-style-mode]").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    const chatView = $("#style-mode-chat");
    if (chatView) {
      chatView.hidden = currentStyleMode !== "chat";
      if (currentStyleMode === "chat") renderChat();
    }
    const aiView = $("#style-mode-ai");
    const manualView = $("#style-mode-manual");
    const favView = $("#style-mode-favorites");
    const planView = $("#style-mode-plan");
    if (aiView) aiView.hidden = currentStyleMode !== "ai";
    if (manualView) {
      manualView.hidden = currentStyleMode !== "manual";
      if (currentStyleMode === "manual") {
        renderManualOutfit();
        renderSavedOutfits();
      }
    }
    if (favView) {
      favView.hidden = currentStyleMode !== "favorites";
      if (currentStyleMode === "favorites") {
        renderFavorites();
      }
    }
    if (planView) {
      planView.hidden = currentStyleMode !== "plan";
      if (currentStyleMode === "plan") {
        renderWeeklyPlan();
      }
    }
  });
});

function renderManualOutfit() {
  const slotKeys = ["top", "bottom-or-dress", "shoes", "outerwear", "accessory"];
  const slotLabels = {
    top: "Pick top",
    "bottom-or-dress": "Pick bottom or dress",
    shoes: "Pick shoes",
    outerwear: "Pick outerwear",
    accessory: "Pick accessory",
  };

  slotKeys.forEach((key) => {
    const bodyEl = $(`#slot-body-${key}`);
    if (!bodyEl) return;
    const item = manualSlots[key];

    if (!item) {
      bodyEl.innerHTML = `
        <button type="button" class="slot-pick-btn" data-slot-target="${key}">
          <span class="slot-plus">+</span>
          <span class="slot-text">${slotLabels[key]}</span>
        </button>`;
    } else {
      bodyEl.innerHTML = `
        <div class="slot-filled-card">
          <img src="${item.photo}" alt="${describe(item)}" />
          <button type="button" class="slot-remove-btn" data-remove-slot="${key}" title="Remove piece" aria-label="Remove piece">✕</button>
          <div class="slot-filled-overlay">
            <span class="slot-filled-name">${describe(item)}</span>
          </div>
        </div>`;
    }
  });
}

// Slot picker bottom sheet
async function openSlotPicker(slotKey) {
  activePickerSlot = slotKey;
  const sheet = $("#slot-picker-sheet");
  const backdrop = $("#slot-picker-backdrop");
  const title = $("#slot-picker-title");
  const sub = $("#slot-picker-sub");
  const grid = $("#slot-picker-grid");

  const slotFriendly = {
    top: "Top",
    "bottom-or-dress": "Bottom or Dress",
    shoes: "Shoes",
    outerwear: "Outerwear",
    accessory: "Accessory",
  };

  if (title) title.textContent = `Pick ${slotFriendly[slotKey] || "piece"}`;
  if (sub) sub.textContent = "Choose an item from your wardrobe";

  const allItems = await getAllItems();
  let matching = [];

  if (slotKey === "top") {
    matching = allItems.filter((it) => it.category === "top");
  } else if (slotKey === "bottom-or-dress") {
    matching = allItems.filter((it) => it.category === "bottom" || it.category === "dress");
  } else if (slotKey === "shoes") {
    matching = allItems.filter((it) => it.category === "shoes");
  } else if (slotKey === "outerwear") {
    matching = allItems.filter((it) => it.category === "outerwear");
  } else if (slotKey === "accessory") {
    matching = allItems.filter((it) => it.category === "accessory");
  }

  if (matching.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 24px 10px; color: var(--muted);">
        <p style="margin: 0 0 14px; font-size: 14px;">No ${slotFriendly[slotKey].toLowerCase()} in your wardrobe yet.</p>
        <button type="button" class="btn-primary" data-go="add" onclick="closeSlotPicker()">+ Add item</button>
      </div>`;
  } else {
    grid.innerHTML = matching
      .map(
        (it) => `
      <div class="slot-picker-card" data-pick-item-id="${it.id}">
        <img src="${it.photo}" alt="${describe(it)}" loading="lazy" />
        <span class="slot-picker-name">${describe(it)}</span>
        <span class="slot-picker-sub">${formatLastWorn(it.lastWorn)}</span>
      </div>`
      )
      .join("");
  }

  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function closeSlotPicker() {
  const sheet = $("#slot-picker-sheet");
  const backdrop = $("#slot-picker-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  activePickerSlot = null;
}

$("#slot-picker-close")?.addEventListener("click", closeSlotPicker);
$("#slot-picker-cancel")?.addEventListener("click", closeSlotPicker);
$("#slot-picker-backdrop")?.addEventListener("click", closeSlotPicker);

$("#slot-picker-grid")?.addEventListener("click", async (e) => {
  const card = e.target.closest("[data-pick-item-id]");
  if (!card || !activePickerSlot) return;
  const id = card.dataset.pickItemId;
  const allItems = await getAllItems();
  const chosen = allItems.find((it) => it.id === id);
  if (chosen) {
    manualSlots[activePickerSlot] = chosen;
    renderManualOutfit();
    closeSlotPicker();
  }
});

// Slot interactions in Create your own
$("#style-mode-manual")?.addEventListener("click", (e) => {
  const pickBtn = e.target.closest("[data-slot-target]");
  if (pickBtn) {
    openSlotPicker(pickBtn.dataset.slotTarget);
    return;
  }

  const removeBtn = e.target.closest("[data-remove-slot]");
  if (removeBtn) {
    const key = removeBtn.dataset.removeSlot;
    manualSlots[key] = null;
    renderManualOutfit();
    return;
  }
});

$("#btn-clear-slots")?.addEventListener("click", () => {
  manualSlots.top = null;
  manualSlots["bottom-or-dress"] = null;
  manualSlots.shoes = null;
  manualSlots.outerwear = null;
  manualSlots.accessory = null;
  const reviewBox = $("#manual-review-box");
  if (reviewBox) reviewBox.hidden = true;
  renderManualOutfit();
  toast("Cleared slots");
});

// "✓ I wore this" button in Create your own
$("#btn-manual-wore")?.addEventListener("click", async () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your slots first!");
    return;
  }

  const nowIso = new Date().toISOString();
  for (const piece of activePieces) {
    piece.wearCount = (piece.wearCount || 0) + 1;
    piece.lastWorn = nowIso;
    await saveItem(piece);
  }

  updateKarmaStreak();
  recordPurchaseAvoided(1);
  awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Wore custom outfit");
  unlockBadge("rewear_rookie");

  toast(`Logged wear for all ${activePieces.length} pieces ✨`);
});

// "💾 Save" button in Create your own
$("#btn-manual-save")?.addEventListener("click", () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your slots before saving!");
    return;
  }

  const nameInput = $("#manual-outfit-name");
  const outfitName = (nameInput && nameInput.value.trim()) || "My Custom Look";

  const saved = getSavedOutfits();
  saved.unshift({
    id: String(Date.now()),
    name: outfitName,
    items: activePieces.map((it) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      color: it.color,
      photo: it.photo,
    })),
    createdAt: Date.now(),
    label: manualLabel,
  });
  saveSavedOutfits(saved);
  awardKarma(10, "Saved custom look");
  renderSavedOutfits();
  toast(`Saved outfit "${outfitName}"! ✨`);
});

// "✨ Ask Gemini to review my look" button
$("#btn-manual-review")?.addEventListener("click", async () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your outfit slots first!");
    return;
  }

  const btn = $("#btn-manual-review");
  const reviewBox = $("#manual-review-box");
  const nameInput = $("#manual-outfit-name");
  const outfitName = (nameInput && nameInput.value.trim()) || "My Outfit";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="sparkle-icon">✨</span> Gemini is reviewing...`;
  }

  if (reviewBox) {
    reviewBox.hidden = false;
    reviewBox.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13.5px;">
        <span class="sparkle-icon">✨</span><span>Gemini is reviewing your look...</span>
      </div>`;
  }

  try {
    // Only category, color and name of each piece are sent (no photos)
    const items = activePieces.map((it) => ({
      role: it.category.charAt(0).toUpperCase() + it.category.slice(1),
      category: it.category,
      color: it.color,
      name: plainText(it.name).slice(0, 40),
    }));
    const res = await callApi("/api/review", { outfitName, items }, { timeoutMs: 20000 });
    const label = res.source === "mock" ? "✨ Stylist Review (test mode, not real Gemini)" : "✨ Stylist Review by Gemini";
    if (reviewBox) {
      reviewBox.innerHTML = `
        <div class="review-header">${label}</div>
        <p class="review-text">"${escapeHtml(res.review)}"</p>`;
    }
  } catch (err) {
    console.warn("Gemini review unavailable:", err.message);
    const msg = "Our stylist is taking a short break, but your outfit looks great! Tap to ask again in a moment.";
    if (reviewBox) {
      reviewBox.innerHTML = `
        <div class="review-header">✨ Stylist Review</div>
        <p class="review-text">${escapeHtml(msg)}</p>`;
    }
    toast("Stylist is busy right now");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="sparkle-icon">✨</span> Ask Gemini to review my look`;
    }
  }
});

// Render Saved Outfits List
function renderSavedOutfits() {
  const container = $("#saved-outfits-list");
  if (!container) return;
  const all = getSavedOutfits();

  const chipsBox = $("#saved-label-filters");
  if (chipsBox) {
    chipsBox.hidden = all.length === 0;
    chipsBox.innerHTML = labelChipsHtml({
      selected: activeSavedFilter,
      attr: "data-saved-filter",
      withAll: true,
      extra: all.map((o) => o.label),
    });
  }

  if (all.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:var(--muted); margin:0;">No saved outfits yet. Assemble pieces above and tap Save.</p>`;
    return;
  }

  const list = activeSavedFilter === "all"
    ? all
    : all.filter((o) => (o.label || "").toLowerCase() === activeSavedFilter.toLowerCase());

  if (list.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:var(--muted); margin:0;">No saved outfits under "${escapeHtml(labelDisplay(activeSavedFilter))}" yet.</p>`;
    return;
  }

  container.innerHTML = list
    .map(
      (outfit) => `
    <article class="saved-outfit-card" data-outfit-id="${outfit.id}">
      <div class="saved-outfit-header">
        <div class="fav-card-title-group">
          <h4 class="saved-outfit-title">${escapeHtml(outfit.name)}</h4>
          ${outfit.label ? `<span class="fav-card-label-tag">${escapeHtml(labelDisplay(outfit.label))}</span>` : ""}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button type="button" class="fav-heart-btn ${isOutfitFavorite(outfit.id) ? "active" : ""}" data-toggle-fav="${outfit.id}" title="Toggle favorite">♥</button>
          <button type="button" class="btn-link-action" data-delete-outfit="${outfit.id}" title="Delete look">Delete</button>
        </div>
      </div>
      <div class="saved-outfit-strip">
        ${outfit.items.map((it) => `<img class="saved-strip-img" src="${it.photo}" alt="${describe(it)}" title="${describe(it)}" />`).join("")}
      </div>
      <div class="saved-outfit-actions">
        <button type="button" class="btn-card-small primary" data-wear-saved="${outfit.id}">✓ I wore this</button>
        <button type="button" class="btn-card-small" data-load-saved="${outfit.id}">Load into slots</button>
        <button type="button" class="btn-card-small" data-label-saved="${outfit.id}">Label</button>
      </div>
    </article>`
    )
    .join("");
}

$("#saved-label-filters")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-label-manager]")) {
    openLabelManager();
    return;
  }
  const chip = e.target.closest("[data-saved-filter]");
  if (!chip) return;
  activeSavedFilter = chip.dataset.savedFilter;
  renderSavedOutfits();
});

$("#saved-outfits-list")?.addEventListener("click", async (e) => {
  const labelBtn = e.target.closest("[data-label-saved]");
  if (labelBtn) {
    const outfit = getSavedOutfits().find((o) => o.id === labelBtn.dataset.labelSaved);
    if (outfit) openOutfitLabelSheet(outfit, "saved");
    return;
  }

  const favBtn = e.target.closest("[data-toggle-fav]");
  if (favBtn) {
    const id = favBtn.dataset.toggleFav;
    const outfit = getSavedOutfits().find((o) => o.id === id);
    if (outfit) toggleFavoriteOutfit(outfit);
    return;
  }

  const deleteBtn = e.target.closest("[data-delete-outfit]");
  if (deleteBtn) {
    const id = deleteBtn.dataset.deleteOutfit;
    const list = getSavedOutfits().filter((o) => o.id !== id);
    saveSavedOutfits(list);
    renderSavedOutfits();
    toast("Deleted saved look");
    return;
  }

  const wearBtn = e.target.closest("[data-wear-saved]");
  if (wearBtn) {
    const id = wearBtn.dataset.wearSaved;
    const outfit = getSavedOutfits().find((o) => o.id === id);
    if (!outfit) return;
    const nowIso = new Date().toISOString();
    const allItems = await getAllItems();
    for (const piece of outfit.items) {
      const it = allItems.find((x) => x.id === piece.id);
      if (it) {
        it.wearCount = (it.wearCount || 0) + 1;
        it.lastWorn = nowIso;
        await saveItem(it);
      }
    }
    updateKarmaStreak();
    recordPurchaseAvoided(1);
    awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore saved outfit");
    toast(`Logged wear for "${outfit.name}" ✨`);
    return;
  }

  const loadBtn = e.target.closest("[data-load-saved]");
  if (loadBtn) {
    const id = loadBtn.dataset.loadSaved;
    const outfit = getSavedOutfits().find((o) => o.id === id);
    if (!outfit) return;
    const allItems = await getAllItems();

    manualSlots.top = null;
    manualSlots["bottom-or-dress"] = null;
    manualSlots.shoes = null;
    manualSlots.outerwear = null;
    manualSlots.accessory = null;

    for (const piece of outfit.items) {
      const full = allItems.find((x) => x.id === piece.id);
      if (!full) continue;
      if (full.category === "top" && !manualSlots.top) manualSlots.top = full;
      else if ((full.category === "bottom" || full.category === "dress") && !manualSlots["bottom-or-dress"]) manualSlots["bottom-or-dress"] = full;
      else if (full.category === "shoes" && !manualSlots.shoes) manualSlots.shoes = full;
      else if (full.category === "outerwear" && !manualSlots.outerwear) manualSlots.outerwear = full;
      else if (full.category === "accessory" && !manualSlots.accessory) manualSlots.accessory = full;
    }

    const nameInput = $("#manual-outfit-name");
    if (nameInput) nameInput.value = outfit.name;
    renderManualOutfit();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast(`Loaded "${outfit.name}" into slots ✨`);
    return;
  }
});

async function renderStyleOccasions() {
  const items = await getAllItems();
  const countFor = (o) => items.filter((it) => it.occasions.includes(o)).length;

  $("#style-occasions").innerHTML = OCCASIONS.map((o) => {
    const n = countFor(o);
    return `<button type="button" class="chip ${o === styleOccasion ? "selected" : ""}" data-style-occasion="${o}">
      ${o}${n ? ` <span class="chip-count">${n}</span>` : ""}</button>`;
  }).join("");
}

$("#style-occasions").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-style-occasion]");
  if (!btn) return;
  styleOccasion = btn.dataset.styleOccasion;
  lastOutfitIds = [];
  document.querySelectorAll("[data-style-occasion]").forEach((b) => b.classList.toggle("selected", b === btn));
  $("#suggest-btn").disabled = false;
  $("#style-result").innerHTML = "";
});

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The wardrobe as compact text for the server: "id | name | category | color | occasions" (no photos)
const plainText = (v) => String(v ?? "").replace(/[|\r\n]/g, " ").replace(/\s+/g, " ").trim();
function wardrobeAsText(items) {
  return items
    .map((it) =>
      [it.id, plainText(it.name).slice(0, 40), it.category, it.color, (it.occasions || []).join(", ")]
        .map(plainText)
        .join(" | ")
    )
    .join("\n");
}

// Ask Gemini (via the server) for an outfit. On any problem, use the basic rules in stylist.js.
async function getOutfitSuggestion(items) {
  if (!items.length) return suggestOutfit(items, styleOccasion, lastOutfitIds, priorityStyleItemId);
  try {
    // getOnboardingPreferences() returns only goal, styles and occasions — no other personal answers
    const res = await callApi(
      "/api/style",
      {
        occasion: styleOccasion,
        wardrobe: wardrobeAsText(items),
        preferences: getOnboardingPreferences() || {},
        previousOutfitIds: lastOutfitIds,
        mustIncludeItemId: priorityStyleItemId,
      },
      { timeoutMs: 25000 }
    );
    if (!res.canFormOutfit) return { missing: res.missing, source: res.source };
    const byId = new Map(items.map((it) => [String(it.id), it]));
    const outfit = res.outfit.map((p) => ({ role: p.role, item: byId.get(String(p.itemId)) })).filter((p) => p.item);
    if (!outfit.length) throw new Error("Suggested items are not in the wardrobe");
    return { outfit, explanation: res.explanation, source: res.source };
  } catch (err) {
    console.warn("Gemini stylist unavailable, using basic rules:", err.message);
    const basic = await suggestOutfit(items, styleOccasion, lastOutfitIds, priorityStyleItemId);
    return { ...basic, source: "rules", notice: STYLIST_BREAK_MSG };
  }
}

const STYLE_SOURCE_LABELS = {
  gemini: "✨ Styled by Gemini",
  mock: "✨ Test mode (not real Gemini)",
  rules: "Basic suggestion",
};

// "I wore this": +1 wear for each piece, then karma (shared by AI Stylist and Chat)
async function logOutfitWorn(itemIds) {
  const nowIso = new Date().toISOString();
  const allItems = await getAllItems();
  const map = new Map(allItems.map((it) => [String(it.id), it]));
  let hadIdleItem = false;
  let logged = 0;
  for (const id of itemIds) {
    const it = map.get(String(id));
    if (it) {
      if (!it.lastWorn || (Date.now() - new Date(it.lastWorn).getTime() > THIRTY_DAYS_MS)) {
        hadIdleItem = true;
      }
      it.wearCount = (it.wearCount || 0) + 1;
      it.lastWorn = nowIso;
      await saveItem(it);
      logged++;
    }
  }
  toast(`Logged wear for all ${logged} pieces ✨`);
  updateKarmaStreak();
  recordPurchaseAvoided(1);
  awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore outfit (+10)");
  unlockBadge("rewear_rookie");
  if (hadIdleItem) {
    awardKarma(KARMA_CONFIG.POINTS.WEAR_IDLE_ITEM, "Rescued idle piece (+25)");
    unlockBadge("never_worn_rescuer");
  }
}

let currentSuggestedOutfit = [];
let priorityStyleItemId = null;

async function showSuggestion(forcedItemId = null) {
  if (forcedItemId) {
    priorityStyleItemId = forcedItemId;
  }
  if (!styleOccasion) return;

  const suggestBtn = $("#suggest-btn");
  const origBtnText = suggestBtn ? suggestBtn.textContent : "Suggest outfit";
  if (suggestBtn) {
    suggestBtn.disabled = true;
    suggestBtn.textContent = "Styling with Gemini...";
  }

  const box = $("#style-result");
  const tryAnotherBtn = $("#try-another");
  if (tryAnotherBtn) {
    tryAnotherBtn.disabled = true;
    tryAnotherBtn.textContent = "Styling with Gemini...";
  }

  if (!box.children.length) {
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">✨</div>
        <p>Gemini is styling a look for <strong>${styleOccasion}</strong>...</p>
      </div>`;
  }

  try {
    const items = await getAllItems();
    const result = await getOutfitSuggestion(items);

    if (result.missing) {
      box.innerHTML = `
        <div class="notice">
          <div class="notice-icon">🧺</div>
          ${result.notice ? `<p class="stylist-notice">${escapeHtml(result.notice)}</p>` : ""}
          <p>${escapeHtml(result.missing)}</p>
          <button class="btn-secondary" data-go="add">Add item</button>
        </div>`;
      return;
    }

    currentSuggestedOutfit = result.outfit;
    lastOutfitIds = result.outfit.map((p) => p.item.id);
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 class="outfit-title" style="margin:0;">Your ${styleOccasion} look</h3>
        <button id="btn-fav-suggested-header" type="button" class="fav-heart-btn" title="Favorite this look">♥</button>
      </div>
      ${result.notice ? `<p class="stylist-notice">${escapeHtml(result.notice)}</p>` : ""}
      <div class="style-source">${STYLE_SOURCE_LABELS[result.source] || STYLE_SOURCE_LABELS.rules}</div>
      <div class="grid outfit-grid">
        ${result.outfit
          .map(
            ({ role, item }) => `
          <article class="card">
            <img src="${item.photo}" alt="${item.color} ${item.category}" />
            <div class="card-body">
              <div class="role">${role}</div>
              <div class="card-top">
                <span class="dot" style="background:${colorHex(item.color)}"></span>
                <span class="card-cat">${item.color} ${item.category}</span>
              </div>
              <span class="card-last-worn">${formatLastWorn(item.lastWorn)}</span>
            </div>
          </article>`
          )
          .join("")}
      </div>
      ${
        result.explanation
          ? `<div class="outfit-explanation"><p>${escapeHtml(result.explanation)}</p></div>`
          : ""
      }
      <div class="field-group stylist-label-group">
        <span class="field-label">Label <span class="hint">(optional)</span></span>
        <div class="label-chip-row" id="stylist-label-chips"></div>
      </div>
      <button id="wore-outfit" class="btn-primary btn-block" style="margin-bottom: 8px;">✓ I wore this outfit</button>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <button id="btn-fav-suggested" type="button" class="btn-secondary" style="flex:1;">♥ Favorite look</button>
        <button id="btn-save-suggested" type="button" class="btn-secondary" style="flex:1;">💾 Save look</button>
      </div>
      <button id="try-another" class="btn-secondary btn-block">↻ Try another</button>`;
    stylistLabel = "";
    renderStylistLabelChips();
    box.classList.remove("fade-in");
    void box.offsetWidth; // restart the fade animation
    box.classList.add("fade-in");
  } catch (err) {
    let msg = err.message || "Our stylist is busy, tap Try again";
    if (
      msg.includes("high demand") ||
      msg.includes("busy") ||
      msg.includes("503") ||
      msg.includes("Failed") ||
      msg.includes("unavailable") ||
      msg.includes("overloaded") ||
      msg.includes("API key") ||
      msg.includes("Internal")
    ) {
      msg = "Our stylist is busy, tap Try again";
    }
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">🧺</div>
        <p>${escapeHtml(msg)}</p>
        <button id="try-another" class="btn-secondary">Try again</button>
      </div>`;
  } finally {
    if (suggestBtn) {
      suggestBtn.disabled = false;
      suggestBtn.textContent = origBtnText;
    }
  }
}

$("#suggest-btn").addEventListener("click", () => showSuggestion());
$("#style-result").addEventListener("click", async (e) => {
  if (e.target.closest("#try-another")) {
    showSuggestion();
    return;
  }

  if (e.target.closest("#stylist-label-chips [data-open-label-manager]")) {
    openLabelManager();
    return;
  }
  const labelChip = e.target.closest("[data-stylist-label]");
  if (labelChip) {
    const value = labelChip.dataset.stylistLabel;
    stylistLabel = stylistLabel.toLowerCase() === value.toLowerCase() ? "" : value;
    renderStylistLabelChips();
    return;
  }

  const favBtn = e.target.closest("#btn-fav-suggested") || e.target.closest("#btn-fav-suggested-header");
  if (favBtn && currentSuggestedOutfit && currentSuggestedOutfit.length) {
    const outfit = {
      id: "outfit_sug_" + Date.now(),
      name: `${(styleOccasion || "Styled").charAt(0).toUpperCase() + (styleOccasion || "Styled").slice(1)} look`,
      occasion: styleOccasion || "casual",
      createdAt: Date.now(),
      items: currentSuggestedOutfit.map((p) => p.item),
      label: stylistLabel,
    };
    promptFavoriteOutfit(outfit);
    return;
  }

  const saveBtn = e.target.closest("#btn-save-suggested");
  if (saveBtn && currentSuggestedOutfit && currentSuggestedOutfit.length) {
    const outfit = {
      id: "outfit_" + Date.now(),
      name: `${(styleOccasion || "Styled").charAt(0).toUpperCase() + (styleOccasion || "Styled").slice(1)} look`,
      occasion: styleOccasion || "casual",
      createdAt: Date.now(),
      items: currentSuggestedOutfit.map((p) => p.item),
      label: stylistLabel,
    };
    const list = getSavedOutfits();
    list.unshift(outfit);
    saveSavedOutfits(list);
    saveBtn.disabled = true;
    saveBtn.textContent = "✓ Saved!";
    renderSavedOutfits();
    toast("Outfit saved to your collection ✨");
    return;
  }

  const woreBtn = e.target.closest("#wore-outfit");
  if (woreBtn && currentSuggestedOutfit && currentSuggestedOutfit.length) {
    woreBtn.disabled = true;
    woreBtn.textContent = "✓ Outfit logged!";
    await logOutfitWorn(currentSuggestedOutfit.map((p) => p.item.id));
  }
});

// =====================================================
// Style me — Chat with the stylist (talks to POST /api/chat)
// =====================================================
const CHAT_BREAK_MSG = "The stylist needs a short break, please try again soon.";
const CHAT_CHIP_TEXT = {
  vibe: "What’s the vibe today?",
  screenshot: "Style me from this screenshot",
  buy: "Should I buy this?",
};
const chatMessages = []; // { role: "user" | "stylist", text, image?, result?, error? } — kept in memory only
let chatPendingImage = null; // 512px photo waiting to be sent
let chatChipAwaitingPhoto = null; // chip text to send once a photo is picked
let chatBusy = false;
let chatItemsById = new Map(); // wardrobe lookup for outfit cards in replies

// Wardrobe as compact text for the chat: "id | category | color | occasions | wears | days since worn"
function wardrobeAsChatText(items) {
  const now = Date.now();
  return items
    .map((it) => {
      const days = it.lastWorn ? Math.max(0, Math.floor((now - new Date(it.lastWorn).getTime()) / 86400000)) : "-";
      return [it.id, it.category, it.color, (it.occasions || []).join(", "), it.wearCount || 0, Number.isFinite(days) ? days : "-"]
        .map(plainText)
        .join(" | ");
    })
    .join("\n");
}

function chatBubbleHtml(msg, index) {
  if (msg.role === "user") {
    return `
      <div class="chat-row user">
        <div class="chat-bubble user">
          ${msg.image ? `<img class="chat-bubble-img" src="${msg.image}" alt="Attached photo" />` : ""}
          ${msg.text ? `<p>${escapeHtml(msg.text)}</p>` : ""}
        </div>
      </div>`;
  }
  return `
    <div class="chat-row stylist">
      <div class="chat-avatar">✨</div>
      <div class="chat-bubble stylist ${msg.error ? "error" : ""}">
        <p>${escapeHtml(msg.text)}</p>
        ${msg.result ? chatResultHtml(msg, index) : ""}
      </div>
    </div>`;
}

// Extra content under a stylist reply (outfit cards, swap offer, verdict) — filled in by renderChatResult
function chatResultHtml(msg, index) {
  return typeof renderChatResult === "function" ? renderChatResult(msg, index) : "";
}

async function renderChat() {
  const log = $("#chat-log");
  if (!log) return;
  if (!chatMessages.length) {
    log.innerHTML = `
      <div class="chat-row stylist">
        <div class="chat-avatar">✨</div>
        <div class="chat-bubble stylist">
          <p>Hi! I’m your Weari stylist. Ask me what to wear, send a screenshot of a look you love, or check something before you buy it.</p>
        </div>
      </div>`;
  } else {
    chatItemsById = new Map((await getAllItems()).map((it) => [String(it.id), it]));
    log.innerHTML = chatMessages.map(chatBubbleHtml).join("");
    log.lastElementChild?.classList.add("is-new"); // only the newest bubble animates in
  }
  if (chatBusy) {
    log.insertAdjacentHTML(
      "beforeend",
      `<div class="chat-row stylist"><div class="chat-avatar">✨</div><div class="chat-bubble stylist typing"><span></span><span></span><span></span></div></div>`
    );
  }
  const last = log.lastElementChild;
  if (last && currentStyleMode === "chat") last.scrollIntoView({ block: "nearest" });
}

function setChatAttachment(dataUrl) {
  chatPendingImage = dataUrl;
  $("#chat-attachment").hidden = !dataUrl;
  $("#chat-attachment-img").src = dataUrl || "";
}

async function sendChat(text) {
  text = String(text || "").trim();
  if (chatBusy || (!text && !chatPendingImage)) return;

  const history = chatMessages.slice(-4).map((m) => ({ role: m.role, text: m.text }));
  const image = chatPendingImage;
  chatMessages.push({ role: "user", text, image });
  setChatAttachment(null);
  $("#chat-input").value = "";
  chatBusy = true;
  $("#chat-send").disabled = true;
  renderChat();

  try {
    const items = await getAllItems();
    const res = await callApi(
      "/api/chat",
      {
        message: text,
        history,
        image: image || undefined,
        wardrobe: wardrobeAsChatText(items),
        // getOnboardingPreferences() returns only goal, styles and occasions — never age, budget or other answers
        preferences: getOnboardingPreferences() || {},
      },
      { timeoutMs: 30000 }
    );
    chatMessages.push({ role: "stylist", text: res.reply, result: res });
  } catch (err) {
    console.warn("Chat stylist unavailable:", err.message);
    chatMessages.push({ role: "stylist", text: CHAT_BREAK_MSG, error: true });
  } finally {
    chatBusy = false;
    $("#chat-send").disabled = false;
    renderChat();
  }
}

$("#chat-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  chatChipAwaitingPhoto = null;
  sendChat($("#chat-input").value);
});

// Attach: camera or upload (photos are shrunk to 512px before sending)
function toggleChatAttachMenu(open) {
  const menu = $("#chat-attach-menu");
  menu.hidden = open === undefined ? !menu.hidden : !open;
  $("#chat-attach-btn").setAttribute("aria-expanded", String(!menu.hidden));
}
$("#chat-attach-btn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleChatAttachMenu();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".chat-attach-wrap")) $("#chat-attach-menu") && toggleChatAttachMenu(false);
});
$("#chat-attach-menu")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-chat-attach]");
  if (!btn) return;
  toggleChatAttachMenu(false);
  $(btn.dataset.chatAttach === "camera" ? "#chat-file-camera" : "#chat-file-upload").click();
});
["#chat-file-camera", "#chat-file-upload"].forEach((sel) => {
  $(sel)?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      setChatAttachment(await resizeImage(file, 512, 0.7));
      if (chatChipAwaitingPhoto) {
        const text = $("#chat-input").value || chatChipAwaitingPhoto;
        chatChipAwaitingPhoto = null;
        sendChat(text);
      }
    } catch {
      toast("Couldn't read that photo");
    }
  });
});
$("#chat-attachment-remove")?.addEventListener("click", () => setChatAttachment(null));

// Chips: the vibe question sends right away; the other two ask for a photo first
$("#chat-chips")?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-chat-chip]");
  if (!chip) return;
  const text = CHAT_CHIP_TEXT[chip.dataset.chatChip];
  if (chip.dataset.chatChip === "vibe" || chatPendingImage) {
    sendChat(text);
    return;
  }
  // Ask for a photo; if they cancel, the text stays in the box so they can describe it instead
  chatChipAwaitingPhoto = text;
  $("#chat-input").value = text;
  $("#chat-file-upload").click();
});

// "I'll skip it" after a purchase check (Chat and Buying Brain): karma + a purchase avoided
function skipPurchase() {
  recordPurchaseAvoided(1);
  awardKarma(KARMA_CONFIG.POINTS.SKIP_PURCHASE, `Skipped a purchase (+${KARMA_CONFIG.POINTS.SKIP_PURCHASE})`);
  toast("Nice! That's one purchase avoided 🌱");
}

// ---------- What appears under a stylist reply ----------
const VERDICT_LABELS = {
  skip: { icon: "🙅", text: "Skip it — you already have this covered" },
  swap_first: { icon: "🔁", text: "Swap first — try the Swap feed before buying" },
  buy: { icon: "🛍️", text: "Worth buying — it fills a real gap" },
};

function renderChatResult(msg, index) {
  const r = msg.result;
  const pieces = (r.outfit_item_ids || []).map((id) => chatItemsById.get(String(id))).filter(Boolean);
  const isOutfit = (r.kind === "outfit" || r.kind === "reference_match") && pieces.length;
  let html = "";

  if (pieces.length) {
    html += `<div class="chat-cards">${pieces
      .map(
        (it) => `
        <div class="chat-card">
          <img src="${it.photo}" alt="${escapeHtml(describe(it))}" />
          <span>${escapeHtml(it.name || describe(it))}</span>
        </div>`
      )
      .join("")}</div>`;
  }

  if (isOutfit) {
    html += `<div class="chat-actions">
      <button type="button" class="chat-action" data-chat-fav="${index}">♥ Favorite</button>
      <button type="button" class="chat-action" data-chat-wore="${index}" ${msg.wore ? "disabled" : ""}>${msg.wore ? "✓ Logged" : "✓ I wore this"}</button>
    </div>`;
  }

  if (r.kind === "purchase_check" && VERDICT_LABELS[r.verdict]) {
    const v = VERDICT_LABELS[r.verdict];
    html += `<div class="chat-verdict ${r.verdict}"><span>${v.icon}</span><strong>${v.text}</strong></div>`;
    if (r.verdict === "skip") {
      html += `<div class="chat-actions">
        <button type="button" class="chat-action primary" data-chat-skip="${index}" ${msg.skipped ? "disabled" : ""}>
          ${msg.skipped ? `✓ Skipped (+${KARMA_CONFIG.POINTS.SKIP_PURCHASE} karma)` : "I’ll skip it"}
        </button>
      </div>`;
    }
  }

  const offerSwap = (r.missing_pieces || []).length || (r.kind === "purchase_check" && r.verdict === "swap_first");
  if ((r.missing_pieces || []).length) {
    html += `<div class="chat-missing"><span>Missing:</span>${r.missing_pieces
      .map((m) => `<span class="tag">${escapeHtml(m)}</span>`)
      .join("")}</div>`;
  }
  if (offerSwap) {
    html += `<div class="chat-actions"><button type="button" class="chat-action" data-go="swap">🔁 Find it on the Swap feed</button></div>`;
  }
  return html ? `<div class="chat-result">${html}</div>` : "";
}

$("#chat-log")?.addEventListener("click", async (e) => {
  const fav = e.target.closest("[data-chat-fav]");
  const wore = e.target.closest("[data-chat-wore]");
  const skip = e.target.closest("[data-chat-skip]");
  const btn = fav || wore || skip;
  if (!btn) return;
  const msg = chatMessages[Number(btn.dataset.chatFav ?? btn.dataset.chatWore ?? btn.dataset.chatSkip)];
  if (!msg || !msg.result) return;
  const ids = (msg.result.outfit_item_ids || []).filter((id) => chatItemsById.has(String(id)));

  if (fav) {
    const occasion = OCCASIONS.find((o) => (chatMessages[chatMessages.indexOf(msg) - 1]?.text || "").toLowerCase().includes(o)) || "casual";
    promptFavoriteOutfit({
      id: "outfit_chat_" + Date.now(),
      name: "Chat look",
      occasion,
      createdAt: Date.now(),
      items: ids.map((id) => chatItemsById.get(String(id))),
    });
  }

  if (wore && !msg.wore) {
    msg.wore = true;
    await logOutfitWorn(ids);
    renderChat();
  }

  if (skip && !msg.skipped) {
    msg.skipped = true;
    skipPurchase();
    renderChat();
  }
});

// =====================================================
// Buying Brain — shop scan (talks to POST /api/buycheck)
// =====================================================
const SAVED_FOR_LATER_KEY = "weari_saved_for_later";
const CONSIDERED_NOT_BOUGHT_KEY = "weari_considered_not_bought";
const BUYCHECK_BREAK_MSG = "The stylist needs a short break, please try again soon.";
const BUYCHECK_VERDICTS = {
  skip: { icon: "🙅", label: "Skip it", css: "skip" },
  "real gap": { icon: "🛍️", label: "Real gap", css: "buy" },
  "try rewear first": { icon: "🔁", label: "Try rewear first", css: "swap_first" },
};
let currentBuyCheck = null; // { photo, price, result, skipped, saved, counted }

function getSavedForLater() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_FOR_LATER_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function saveSavedForLater(list) {
  try {
    localStorage.setItem(SAVED_FOR_LATER_KEY, JSON.stringify(list.slice(0, 20)));
    return true;
  } catch {
    toast("Couldn't save — browser storage is full");
    return false;
  }
}
function getConsideredNotBoughtCount() {
  try {
    return Number(localStorage.getItem(CONSIDERED_NOT_BOUGHT_KEY)) || 0;
  } catch {
    return 0;
  }
}
// Counted once per scan, when it ends in "I'll skip it" or "Save for later"
function recordConsideredNotBought() {
  if (!currentBuyCheck || currentBuyCheck.counted) return;
  currentBuyCheck.counted = true;
  try {
    localStorage.setItem(CONSIDERED_NOT_BOUGHT_KEY, String(getConsideredNotBoughtCount() + 1));
  } catch {}
}

// Wardrobe as compact text for the shop scan: "id | name | category | color | occasions | wears"
function wardrobeAsBuycheckText(items) {
  return items
    .map((it) =>
      [it.id, plainText(it.name || describe(it)).slice(0, 40), it.category, it.color, (it.occasions || []).join(", "), it.wearCount || 0]
        .map(plainText)
        .join(" | ")
    )
    .join("\n");
}

const formatMoney = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function openBuyCheckView(html) {
  $("#buycheck-content").innerHTML = html;
  $("#buycheck-view").hidden = false;
  $("#buycheck-view").scrollTop = 0;
  document.body.classList.add("no-scroll");
}
function closeBuyCheckView() {
  $("#buycheck-view").hidden = true;
  document.body.classList.remove("no-scroll");
}
$("#buycheck-close")?.addEventListener("click", closeBuyCheckView);

async function runBuyCheck(photo, price) {
  photo = await resizeDataUrl(photo, 512, 0.82); // always send at most 512px
  const priceNum = Number(price);
  currentBuyCheck = { photo, price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null, result: null };
  openBuyCheckView(`
    <img class="buycheck-photo" src="${photo}" alt="Item you're thinking of buying" />
    <div class="buycheck-thinking"><span class="sparkle-icon">✨</span> Buying Brain is checking your wardrobe…</div>`);
  try {
    const items = await getAllItems();
    const res = await callApi(
      "/api/buycheck",
      { image: photo, price: currentBuyCheck.price || undefined, wardrobe: wardrobeAsBuycheckText(items) },
      { timeoutMs: 30000 }
    );
    currentBuyCheck.result = res;
    chatItemsById = new Map(items.map((it) => [String(it.id), it]));
    renderBuyCheckResult();
  } catch (err) {
    console.warn("Buying Brain unavailable:", err.message);
    openBuyCheckView(`
      <img class="buycheck-photo" src="${photo}" alt="Item you're thinking of buying" />
      <div class="notice"><div class="notice-icon">☕</div><p>${BUYCHECK_BREAK_MSG}</p>
        <button type="button" class="btn-secondary" data-buycheck="retry">Try again</button></div>`);
  }
}

function buyCheckRow(title, ids) {
  const pieces = ids.map((id) => chatItemsById.get(String(id))).filter(Boolean);
  if (!pieces.length) return "";
  return `
    <h3 class="buycheck-row-title">${title}</h3>
    <div class="buycheck-row">${pieces
      .map(
        (it) => `
        <div class="chat-card">
          <img src="${it.photo}" alt="${escapeHtml(describe(it))}" />
          <span>${escapeHtml(it.name || describe(it))}</span>
          <small>Worn ${it.wearCount || 0}×</small>
        </div>`
      )
      .join("")}</div>`;
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// "Top · ● White · Edit" under the item name
function buyCheckDetectedLine(r) {
  return `
    <div class="buycheck-detected">
      <span>${escapeHtml(capitalize(r.category))}</span>
      <span class="buycheck-sep">·</span>
      <span class="dot" style="background:${colorHex(r.color)}"></span>
      <span>${escapeHtml(capitalize(r.color))}</span>
      <button type="button" class="link-btn buycheck-edit-link" data-buycheck="edit">Edit</button>
    </div>`;
}

function buyCheckEditForm(r) {
  const options = (list, current) =>
    list.map((v) => `<option value="${v}" ${v === current ? "selected" : ""}>${capitalize(v)}</option>`).join("");
  return `
    <form class="buycheck-edit" id="buycheck-edit-form">
      <label>Name<input name="name" maxlength="40" value="${escapeHtml(r.item_name || "")}" /></label>
      <div class="buycheck-edit-row">
        <label>Category<select name="category">${options(CATEGORIES, r.category)}</select></label>
        <label>Color<select name="color">${options(COLORS.map((c) => c.name), r.color)}</select></label>
      </div>
      <div class="buycheck-edit-actions">
        <button type="submit" class="btn-primary">Update verdict</button>
        <button type="button" class="btn-secondary" data-buycheck="cancel-edit">Cancel</button>
      </div>
    </form>`;
}

// Re-run the verdict on this device with buying-brain.js (the same rules the server uses) — no AI call
async function recheckBuyCheckLocally({ name, category, color }) {
  if (!window.BuyingBrain) throw new Error("Buying Brain rules not loaded");
  const items = await getAllItems();
  chatItemsById = new Map(items.map((it) => [String(it.id), it]));
  const wardrobe = items.map((it) => ({
    id: String(it.id),
    name: it.name || describe(it),
    category: it.category,
    color: it.color,
    occasions: it.occasions || [],
    wears: it.wearCount || 0,
  }));
  const r = currentBuyCheck.result;
  const local = window.BuyingBrain.shopCheck({ category, color, occasions: r.occasions || [] }, wardrobe);
  currentBuyCheck.result = { ...r, item_name: name || `${capitalize(color)} ${category}`, category, color, confidence: "high", ...local, edited: true };
}

$("#buycheck-view")?.addEventListener("submit", async (e) => {
  if (e.target.id !== "buycheck-edit-form") return;
  e.preventDefault();
  const data = new FormData(e.target);
  try {
    await recheckBuyCheckLocally({
      name: String(data.get("name") || "").trim().slice(0, 40),
      category: String(data.get("category")),
      color: String(data.get("color")),
    });
    currentBuyCheck.editing = false;
    renderBuyCheckResult();
    toast("Verdict updated ✨");
  } catch (err) {
    console.warn("Local re-check failed:", err.message);
    toast("Couldn't update the verdict, please try again");
  }
});

const BUYCHECK_UNSURE_MSG = "I can’t tell what this is. Try again with just the item, filling the frame, on a plain background.";

function renderBuyCheckResult() {
  const { photo, price, result: r, skipped, saved } = currentBuyCheck;
  // Not sure what the item is: no verdict, ask for a better photo
  if (r.category === "unknown" || r.confidence === "low" || !r.verdict) {
    openBuyCheckView(`
      <img class="buycheck-photo" src="${photo}" alt="Photo the Buying Brain couldn't read" />
      <div class="notice buycheck-unsure">
        <div class="notice-icon">🔍</div>
        <p>${BUYCHECK_UNSURE_MSG}</p>
        <button type="button" class="btn-primary btn-block" data-buycheck="rescan">📷 Try again</button>
        ${r.source === "mock" ? `<span class="buycheck-test">Test mode, not real Gemini</span>` : ""}
      </div>`);
    return;
  }
  const v = BUYCHECK_VERDICTS[r.verdict] || BUYCHECK_VERDICTS["try rewear first"];
  openBuyCheckView(`
    <img class="buycheck-photo" src="${photo}" alt="${escapeHtml(r.item_name || "Item you're thinking of buying")}" />
    <div class="buycheck-head">
      <span class="buycheck-badge ${v.css}">${v.icon} ${v.label}</span>
      ${r.source === "mock" ? `<span class="buycheck-test">Test mode, not real Gemini</span>` : ""}
    </div>
    ${r.item_name ? `<h2 class="buycheck-item-name">${escapeHtml(r.item_name)}</h2>` : ""}
    ${currentBuyCheck.editing ? buyCheckEditForm(r) : buyCheckDetectedLine(r)}
    ${r.edited ? `<p class="buycheck-edited">Updated with your edits, using the same Buying Brain rules (no new AI call).</p>` : ""}
    <p class="buycheck-reason">${escapeHtml(r.reason)}</p>
    ${
      price
        ? `<div class="buycheck-cpw"><strong>${formatMoney(price / 10)}</strong> per wear if worn 10 times <span>(price ${formatMoney(price)})</span></div>`
        : ""
    }
    ${buyCheckRow("You already own", r.similar_item_ids || [])}
    ${buyCheckRow("Would pair with", r.pairs_with_ids || [])}
    <div class="buycheck-actions">
      <button type="button" class="btn-primary btn-block buycheck-skip" data-buycheck="skip" ${skipped ? "disabled" : ""}>
        ${skipped ? `✓ Skipped (+${KARMA_CONFIG.POINTS.SKIP_PURCHASE} karma)` : "I’ll skip it"}
      </button>
      <button type="button" class="btn-secondary btn-block" data-buycheck="save" ${saved ? "disabled" : ""}>
        ${saved ? "✓ Saved for later" : "🔖 Save for later"}
      </button>
      ${r.verdict === "try rewear first" ? `<button type="button" class="btn-secondary btn-block" data-buycheck="swap">🔁 See Swap feed</button>` : ""}
    </div>`);
}

$("#buycheck-view")?.addEventListener("click", (e) => {
  const action = e.target.closest("[data-buycheck]")?.dataset.buycheck;
  if (!action || !currentBuyCheck) return;

  if (action === "retry") runBuyCheck(currentBuyCheck.photo, currentBuyCheck.price);

  if (action === "rescan") {
    closeBuyCheckView();
    startCameraScan("buycheck");
  }

  if (action === "edit" || action === "cancel-edit") {
    currentBuyCheck.editing = action === "edit";
    renderBuyCheckResult();
  }

  if (action === "skip" && !currentBuyCheck.skipped) {
    currentBuyCheck.skipped = true;
    recordConsideredNotBought();
    skipPurchase();
    renderBuyCheckResult();
  }

  if (action === "save" && !currentBuyCheck.saved) {
    const { photo, price, result: r } = currentBuyCheck;
    const ok = saveSavedForLater([
      {
        id: "later_" + Date.now(),
        photo,
        price,
        verdict: r.verdict,
        reason: r.reason,
        item: { name: r.item_name, category: r.category, color: r.color },
        createdAt: Date.now(),
      },
      ...getSavedForLater(),
    ]);
    if (ok) {
      currentBuyCheck.saved = true;
      recordConsideredNotBought();
      toast("Saved for later 🔖");
      renderBuyCheckResult();
      if (typeof renderSavedForLater === "function") renderSavedForLater();
    }
  }

  if (action === "swap") {
    closeBuyCheckView();
    showScreen("swap");
  }
});

$("#btn-buying-brain")?.addEventListener("click", () => startCameraScan("buycheck"));

function renderSavedForLater() {
  const box = $("#saved-for-later");
  if (!box) return;
  const list = getSavedForLater();
  box.hidden = !list.length;
  if (!list.length) return;
  box.innerHTML = `
    <div class="saved-later-head"><h3>Saved for later</h3><span>${list.length}</span></div>
    <div class="saved-later-row">${list
      .map((x) => {
        const v = BUYCHECK_VERDICTS[x.verdict] || BUYCHECK_VERDICTS["try rewear first"];
        return `
        <div class="saved-later-card">
          <button type="button" class="saved-later-remove" data-later-remove="${x.id}" aria-label="Remove">×</button>
          <img src="${x.photo}" alt="${escapeHtml(x.item?.name || "Saved item")}" />
          <div class="saved-later-body">
            <span class="saved-later-name">${escapeHtml(x.item?.name || "Saved item")}</span>
            <span class="saved-later-meta"><span class="buycheck-badge ${v.css} mini">${v.icon} ${v.label}</span>${x.price ? ` · ${formatMoney(x.price)}` : ""}</span>
          </div>
        </div>`;
      })
      .join("")}</div>`;
}

$("#saved-for-later")?.addEventListener("click", (e) => {
  const id = e.target.closest("[data-later-remove]")?.dataset.laterRemove;
  if (!id) return;
  saveSavedForLater(getSavedForLater().filter((x) => x.id !== id));
  renderSavedForLater();
});

// =====================================================
// Swap screen (Rewear)
// (sample listings live in swap-data.js)
// =====================================================
const REQUESTS_KEY = "weari-swap-requests";
let swapTab = "feed";
// Swipe deck: listings skipped this visit (kept in memory only, no storage key)
const swapSkipped = new Set();
const SWAP_DEMO_ACCEPT_MS = 2000;

// Swap requests are small, so they're kept in localStorage
function getRequests() {
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list.map(normalizeRequest).filter(Boolean);
    }
    for (const key of LEGACY_REQUEST_KEYS) {
      const legacyRaw = localStorage.getItem(key);
      if (legacyRaw) {
        const list = JSON.parse(legacyRaw);
        if (Array.isArray(list) && list.length > 0) return list.map(normalizeRequest).filter(Boolean);
      }
    }
  } catch {
    return [];
  }
  return [];
}
function saveRequests(list) {
  try {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(list));
  } catch {
    toast("Couldn't save — browser storage is full or blocked");
  }
}

const tagsHtml = (occasions) => `<div class="tags">${(occasions || []).map((o) => `<span class="tag">${o}</span>`).join("")}</div>`;
const myItemCard = (it) => `
  <article class="card">
    <img src="${it.photo}" alt="${describe(it)}" loading="lazy" />
    <div class="card-body">
      <div class="card-top">
        <span class="dot" style="background:${colorHex(it.color)}"></span>
        <span class="card-cat">${describe(it)}</span>
      </div>
      ${tagsHtml(it.occasions)}
    </div>
  </article>`;

document.querySelector("#swap-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-swap-tab]");
  if (!btn) return;
  swapTab = btn.dataset.swapTab;
  renderSwap();
});

async function renderSwap() {
  const [listings, items] = await Promise.all([getSwapListings(), getAllItems()]);
  acceptDueDemoRequests();
  const requests = getRequests();
  const mine = items.filter((it) => it.swappable);

  // Tabs (with counts)
  const counts = { listings: mine.length, requests: requests.length };
  document.querySelectorAll("[data-swap-tab]").forEach((b) => {
    const tab = b.dataset.swapTab;
    b.classList.toggle("active", tab === swapTab);
    const label = { feed: "Feed", listings: "My listings", requests: "My requests" }[tab];
    b.innerHTML = counts[tab] ? `${label} <span class="seg-count">${counts[tab]}</span>` : label;
  });
  $("#swap-feed").hidden = swapTab !== "feed";
  $("#swap-listings").hidden = swapTab !== "listings";
  $("#swap-requests").hidden = swapTab !== "requests";

  // --- Feed: one big card at a time ---
  const requested = new Set(requests.map((r) => r.listingId));
  const deck = listings.filter((l) => !requested.has(l.id) && !swapSkipped.has(l.id));
  const top = deck[0];
  $("#swap-feed").innerHTML = top
    ? `
      <p class="swap-demo-note">Demo: sample community pieces. Requests and replies are simulated.</p>
      <div class="swap-deck collage-${COLLAGE_COLORS[(listings.length - deck.length) % COLLAGE_COLORS.length]}">
        <article class="swap-card" id="swap-card" data-swap-card="${top.id}">
          <div class="swap-card-media">
            <img src="${top.photo}" alt="${escapeHtml(top.title)}" draggable="false" />
            <span class="member-badge"><span class="avatar">${top.member[0]}</span>${top.member}</span>
            <span class="swap-stamp swap-stamp-like">LIKE</span>
            <span class="swap-stamp swap-stamp-skip">SKIP</span>
          </div>
          <div class="card-body">
            <div class="listing-title">${escapeHtml(top.title)}</div>
            <div class="card-top">
              <span class="dot" style="background:${colorHex(top.color)}"></span>
              <span class="card-meta">${describe(top)}</span>
            </div>
            ${tagsHtml(top.occasions)}
          </div>
        </article>
      </div>
      <div class="swap-deck-actions">
        <button type="button" class="swap-deck-btn skip" data-swap-skip="${top.id}" aria-label="Skip">✕ <span>Skip</span></button>
        <span class="swap-deck-count">${listings.length - deck.length + 1} of ${listings.length}</span>
        <button type="button" class="swap-deck-btn like" data-swap-like="${top.id}" aria-label="Like and request a swap">♥ <span>Like</span></button>
      </div>`
    : `<div class="notice">
        <div class="notice-icon">✨</div>
        <p>You’ve seen every piece for now.</p>
        ${swapSkipped.size ? `<button class="btn-secondary" data-swap-reset>See skipped pieces again</button>` : `<button class="btn-secondary" data-swap-goto="requests">View my requests</button>`}
      </div>`;
  bindSwapCardDrag();

  // --- My listings ---
  $("#swap-listings").innerHTML = mine.length
    ? `<div class="grid">${mine.map(myItemCard).join("")}</div>`
    : `<div class="notice">
        <div class="notice-icon">🔁</div>
        <p>You haven’t listed anything yet.<br />When adding an item, switch on <strong>Available to swap</strong>.</p>
        <button class="btn-secondary" data-go="add">Add item</button>
      </div>`;

  // --- My requests ---
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const listingById = Object.fromEntries(listings.map((l) => [l.id, l]));
  $("#swap-requests").innerHTML = requests.length
    ? requests
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => {
          const theirs = listingById[r.listingId] || r.listing || {
            id: r.listingId,
            member: "Community member",
            title: "Swap item",
            photo: "",
          };
          const offered = byId[r.offeredItemId];
          return `
          <div class="request">
            <div class="request-pics">
              ${offered ? `<img src="${offered.photo}" alt="" />` : `<div class="pic-gone"></div>`}
              <span class="swap-arrow">⇄</span>
              ${theirs.photo ? `<img src="${theirs.photo}" alt="" />` : `<div class="pic-gone"></div>`}
            </div>
            <div class="request-info">
              <div class="request-text">Your <strong>${offered ? describe(offered) : "removed item"}</strong>
                for ${(theirs.member || "member")}’s <strong>${(theirs.title || "item")}</strong></div>
              <div class="request-meta">
                <span class="status ${r.status === 'completed' || r.status === 'accepted' ? 'status-completed' : ''}">${r.status === 'completed' ? '✓ Completed' : r.status === 'accepted' ? '✓ Accepted (demo)' : 'Pending'}</span>
                <span>${new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                ${r.status === 'accepted' ? `<button class="link-btn" data-open-swap-chat="${r.id}">Open chat</button>` : ''}
                ${r.status !== 'completed' ? `<button class="link-btn" data-complete-request="${r.id}">Mark completed</button>` : ''}
                <button class="link-btn" data-cancel-request="${r.id}">Cancel</button>
              </div>
            </div>
          </div>`;
        })
        .join("")
    : `<div class="notice">
        <div class="notice-icon">💌</div>
        <p>No swap requests yet.<br />Tap <strong>I’m interested</strong> on something in the feed.</p>
        <button class="btn-secondary" data-swap-goto="feed">Browse the feed</button>
      </div>`;
}

document.querySelector("#screen-swap").addEventListener("click", (e) => {
  const goto = e.target.closest("[data-swap-goto]");
  if (goto) {
    swapTab = goto.dataset.swapGoto;
    renderSwap();
  }
  const interested = e.target.closest("[data-interested]");
  if (interested) openOfferSheet(interested.dataset.interested);

  const like = e.target.closest("[data-swap-like]");
  if (like) return swipeSwapCard("right");
  const skip = e.target.closest("[data-swap-skip]");
  if (skip) return swipeSwapCard("left");
  if (e.target.closest("[data-swap-reset]")) {
    swapSkipped.clear();
    renderSwap();
    return;
  }
  const chatBtn = e.target.closest("[data-open-swap-chat]");
  if (chatBtn) return openSwapChat(chatBtn.dataset.openSwapChat);

  const complete = e.target.closest("[data-complete-request]");
  if (complete) {
    const list = getRequests();
    const targetReq = list.find((r) => r.id === complete.dataset.completeRequest);
    if (targetReq) {
      targetReq.status = "completed";
      saveRequests(list);
      recordCompletedSwap(1);
      awardKarma(25, "Completed swap");
      renderSwap();
      toast("Swap completed! Circular impact updated 🌱");
    }
    return;
  }

  const cancel = e.target.closest("[data-cancel-request]");
  if (cancel) {
    saveRequests(getRequests().filter((r) => r.id !== cancel.dataset.cancelRequest));
    renderSwap();
    toast("Request cancelled");
  }
});

// ---------- The "offer an item" pop-up ----------
function openSheet(html) {
  $("#sheet-content").innerHTML = html;
  $("#sheet").hidden = false;
  $("#sheet-backdrop").hidden = false;
  document.body.classList.add("no-scroll");
}
function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheet-backdrop").hidden = true;
  document.body.classList.remove("no-scroll");
}
$("#sheet-backdrop").addEventListener("click", closeSheet);

let offerFor = null; // the listing being requested
let offerChoice = null; // id of my item being offered

async function openOfferSheet(listingId) {
  const [listings, items] = await Promise.all([getSwapListings(), getAllItems()]);
  offerFor = listings.find((l) => l.id === listingId);
  offerChoice = null;
  const mine = items.filter((it) => it.swappable);

  const header = `
    <div class="sheet-header">
      <img src="${offerFor.photo}" alt="" />
      <div>
        <h3>Offer a swap</h3>
        <p>for ${offerFor.member}’s ${offerFor.title}</p>
      </div>
    </div>`;

  if (!mine.length) {
    openSheet(`${header}
      <div class="notice flat">
        <p>You don’t have any items available to swap yet.<br />Add one and switch on <strong>Available to swap</strong>.</p>
        <button class="btn-primary" data-go="add">Add item</button>
      </div>`);
    return;
  }

  openSheet(`${header}
    <p class="sheet-label">Pick one of your items to offer</p>
    <div class="offer-grid">
      ${mine
        .map(
          (it) => `
        <button class="offer-option" data-offer="${it.id}">
          <img src="${it.photo}" alt="${describe(it)}" />
          <span>${describe(it)}</span>
        </button>`
        )
        .join("")}
    </div>
    <button id="send-request" class="btn-primary btn-block" disabled>Send swap request</button>
    <button class="link-btn sheet-cancel" data-close-sheet>Cancel</button>`);
}

$("#sheet").addEventListener("click", async (e) => {
  if (e.target.closest("[data-close-sheet]")) return closeSheet();

  const rewearBtn = e.target.closest("[data-rewear-action]");
  if (rewearBtn) return openRewearFlow(rewearBtn.dataset.rewearAction, rewearBtn.dataset.rewearItem);

  const markWornBtn = e.target.closest("[data-sheet-mark-worn]");
  if (markWornBtn) {
    const id = markWornBtn.dataset.sheetMarkWorn;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      const wasIdle = !it.lastWorn || Date.now() - new Date(it.lastWorn).getTime() > THIRTY_DAYS_MS;
      it.wearCount = (it.wearCount || 0) + 1;
      it.lastWorn = new Date().toISOString();
      await saveItem(it);
      renderWardrobe();
      toast(`Marked as worn (${it.wearCount} total) ✨`);
      updateKarmaStreak();
      if (wasIdle) {
        awardKarma(KARMA_CONFIG.POINTS.WEAR_IDLE_ITEM, "Rescued idle piece");
        unlockBadge("never_worn_rescuer");
      } else {
        awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore favorite piece");
      }
      unlockBadge("rewear_rookie");
      openItemDetailSheet(it.id);
    }
    return;
  }

  const toggleSwapBtn = e.target.closest("[data-sheet-toggle-swap]");
  if (toggleSwapBtn) {
    const id = toggleSwapBtn.dataset.sheetToggleSwap;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      it.swappable = !it.swappable;
      await saveItem(it);
      renderWardrobe();
      if (it.swappable) {
        toast("Listed on Rewear ✨");
        awardKarma(KARMA_CONFIG.POINTS.MARK_SWAPPABLE, "Listed on Rewear");
      } else {
        toast("Removed from Rewear feed");
      }
      openItemDetailSheet(it.id);
    }
    return;
  }

  const deleteBtn = e.target.closest("[data-sheet-delete]");
  if (deleteBtn) {
    const id = deleteBtn.dataset.sheetDelete;
    if (!confirm("Remove this item?")) return;
    await deleteItem(id);
    closeSheet();
    renderWardrobe();
    toast("Item removed");
    return;
  }

  const option = e.target.closest("[data-offer]");
  if (option) {
    offerChoice = option.dataset.offer;
    document.querySelectorAll("[data-offer]").forEach((b) => b.classList.toggle("selected", b === option));
    $("#send-request").disabled = false;
  }

  if (e.target.closest("#send-request") && offerChoice) {
    const { photo, ...listing } = offerFor || {};
    const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    saveRequests([
      ...getRequests(),
      {
        id: requestId,
        listingId: offerFor ? offerFor.id : "",
        listing,
        offeredItemId: offerChoice,
        status: "pending",
        demo: true, // simulated: accepted automatically after 2 seconds
        createdAt: Date.now(),
      },
    ]);
    setTimeout(() => acceptDemoRequest(requestId), SWAP_DEMO_ACCEPT_MS);
    awardKarma(KARMA_CONFIG.POINTS.SEND_SWAP_REQUEST, "Sent swap request");
    unlockBadge("first_swap_request");
    openSheet(`
      <div class="success">
        <div class="success-icon">🎉</div>
        <h3>Swap request sent!</h3>
        <p>Your offer for ${offerFor ? offerFor.member : "community member"}’s ${offerFor ? offerFor.title : "item"} is saved in <strong>My requests</strong>.</p>
        <p class="swap-waiting" data-waiting-request="${requestId}">⏳ Waiting for a reply… <small>(demo)</small></p>
        <button class="btn-primary btn-block" data-close-sheet>Done</button>
      </div>`);
    renderSwap();
  }
});

// ---------- Swipe deck: drag right to like, left to skip ----------
const SWIPE_THRESHOLD = 90;

function bindSwapCardDrag() {
  const card = $("#swap-card");
  if (!card) return;
  let startX = 0;
  let dx = 0;
  let dragging = false;

  card.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    dx = 0;
    card.setPointerCapture(e.pointerId);
    card.classList.add("dragging");
  });
  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    card.style.setProperty("--like", Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD)));
    card.style.setProperty("--skip", Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD)));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove("dragging");
    if (dx > SWIPE_THRESHOLD) return swipeSwapCard("right");
    if (dx < -SWIPE_THRESHOLD) return swipeSwapCard("left");
    resetSwapCard(card);
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

function resetSwapCard(card) {
  card.style.transform = "";
  card.style.setProperty("--like", 0);
  card.style.setProperty("--skip", 0);
}

function swipeSwapCard(direction) {
  const card = $("#swap-card");
  if (!card || card.classList.contains("flying")) return;
  const id = card.dataset.swapCard;
  card.classList.add("flying");
  card.style.setProperty(direction === "right" ? "--like" : "--skip", 1);
  card.style.transform = `translateX(${direction === "right" ? 140 : -140}%) rotate(${direction === "right" ? 18 : -18}deg)`;
  setTimeout(() => {
    if (direction === "left") {
      swapSkipped.add(id);
      renderSwap();
      return;
    }
    // Liked: the card comes back until a request is actually sent
    card.classList.remove("flying");
    resetSwapCard(card);
    openOfferSheet(id);
  }, 260);
}

// ---------- Simulated reply: accepted after 2 seconds, then a demo chat ----------
function swapChatOpener(r) {
  const offered = r.offeredName || "your piece";
  const title = (r.listing && r.listing.title) || "my piece";
  return `Hi! I’d love to swap my ${title} for ${offered}. Could we meet up this weekend? 😊`;
}

function markDemoAccepted(r, offeredName) {
  r.status = "accepted";
  r.acceptedAt = Date.now();
  r.offeredName = r.offeredName || offeredName || "";
  if (!Array.isArray(r.messages) || !r.messages.length) {
    r.messages = [{ from: "them", text: swapChatOpener(r), at: Date.now() }];
  }
}

async function acceptDemoRequest(requestId) {
  const items = await getAllItems();
  const list = getRequests();
  const r = list.find((x) => x.id === requestId);
  if (!r || !r.demo || r.status !== "pending") return;
  const offered = items.find((it) => it.id === r.offeredItemId);
  markDemoAccepted(r, offered ? `your ${describe(offered)}` : "");
  saveRequests(list);

  const member = (r.listing && r.listing.member) || "They";
  const waiting = document.querySelector(`#sheet:not([hidden]) [data-waiting-request="${requestId}"]`);
  if (waiting) openSwapChat(requestId);
  else toast(`${member} accepted your swap (demo) 💬`);
  if (!$("#screen-swap").hidden) renderSwap();
}

// Demo requests whose timer was lost (e.g. the page reloaded) are accepted on the next visit
function acceptDueDemoRequests() {
  const list = getRequests();
  let changed = false;
  for (const r of list) {
    if (r.demo && r.status === "pending" && Date.now() - r.createdAt >= SWAP_DEMO_ACCEPT_MS) {
      markDemoAccepted(r);
      changed = true;
    }
  }
  if (changed) saveRequests(list);
}

let swapChatId = null;

async function openSwapChat(requestId) {
  const r = getRequests().find((x) => x.id === requestId);
  if (!r) return;
  swapChatId = requestId;
  const listings = await getSwapListings();
  const theirs = listings.find((l) => l.id === r.listingId) || r.listing || {};
  const member = theirs.member || "Community member";
  const messages = Array.isArray(r.messages) ? r.messages : [];

  openSheet(`
    <div class="sheet-header">
      ${theirs.photo ? `<img src="${theirs.photo}" alt="" />` : ""}
      <div>
        <h3>Chat with ${escapeHtml(member)}</h3>
        <p>About the ${escapeHtml(theirs.title || "swap")}</p>
      </div>
    </div>
    <p class="swap-demo-note">Demo chat: ${escapeHtml(member)} is a sample member and messages are not sent to anyone.</p>
    <div class="swap-chat-log" id="swap-chat-log">
      ${messages
        .map((m) => `<div class="chat-row ${m.from === "me" ? "user" : "stylist"}"><div class="chat-bubble ${m.from === "me" ? "user" : "stylist"}">${escapeHtml(m.text)}</div></div>`)
        .join("")}
    </div>
    <form class="swap-chat-form" id="swap-chat-form" autocomplete="off">
      <input type="text" id="swap-chat-input" class="text-input" placeholder="Write a message" maxlength="300" />
      <button type="submit" class="chat-send-btn" aria-label="Send">↑</button>
    </form>
    <button class="link-btn sheet-cancel" data-close-sheet>Close</button>`);
  const log = $("#swap-chat-log");
  if (log) log.scrollTop = log.scrollHeight;
}

$("#sheet").addEventListener("submit", (e) => {
  if (e.target.id !== "swap-chat-form") return;
  e.preventDefault();
  const input = $("#swap-chat-input");
  const text = input.value.trim();
  if (!text || !swapChatId) return;
  const list = getRequests();
  const r = list.find((x) => x.id === swapChatId);
  if (!r) return;
  r.messages = [...(Array.isArray(r.messages) ? r.messages : []), { from: "me", text, at: Date.now() }];
  saveRequests(list);
  openSwapChat(swapChatId).then(() => $("#swap-chat-input")?.focus());
});

// =====================================================
// Rewear: Sell, Swap and Donate (demo — no payments, no pickup yet)
//   weari_listings: [{ id, itemId, type: "sell" | "donate", status, title, description,
//                      price, currency, center, itemName, category, color, createdAt, soldAt, donatedAt }]
//   weari_earnings: { currency: "LKR", total, entries: [{ listingId, itemName, amount, soldAt }] }
//   Swaps reuse the existing swap feed: an item marked swappable is "Listed", and a swap
//   request offering it is "Pending" (or "Swapped" once completed).
// =====================================================
const LISTINGS_KEY = "weari_listings";
const EARNINGS_KEY = "weari_earnings";
const REWEAR_CURRENCY = "LKR";
const REWEAR_STATUSES = ["Listed", "Pending", "Swapped", "Sold", "Donated"];
const DONATION_CENTERS = [
  { id: "example-1", name: "Example center 1", area: "Colombo 05" },
  { id: "example-2", name: "Example center 2", area: "Kandy" },
  { id: "example-3", name: "Example center 3", area: "Galle" },
];

let rewearItemId = null;
let sellDraftToken = 0;
let donateCenterId = null;

function getListings() {
  try {
    const list = JSON.parse(localStorage.getItem(LISTINGS_KEY) || "[]");
    if (Array.isArray(list)) return list.filter((l) => l && l.id && l.itemId);
  } catch {}
  return [];
}

function saveListings(list) {
  try {
    localStorage.setItem(LISTINGS_KEY, JSON.stringify(list));
  } catch {
    toast("Couldn't save — browser storage is full or blocked");
  }
}

function getEarnings() {
  try {
    const raw = JSON.parse(localStorage.getItem(EARNINGS_KEY) || "null");
    if (raw && typeof raw === "object") {
      return {
        currency: REWEAR_CURRENCY,
        total: Number(raw.total) || 0,
        entries: Array.isArray(raw.entries) ? raw.entries : [],
      };
    }
  } catch {}
  return { currency: REWEAR_CURRENCY, total: 0, entries: [] };
}

function saveEarnings(earnings) {
  try {
    localStorage.setItem(EARNINGS_KEY, JSON.stringify(earnings));
  } catch {}
}

function formatLkr(amount) {
  return `${REWEAR_CURRENCY} ${Math.round(Number(amount) || 0).toLocaleString("en-LK")}`;
}

// Where one item is in its Rewear journey, or null if it's just in the closet
function getRewearStatus(item, listings = getListings(), requests = getRequests()) {
  const own = listings.filter((l) => l.itemId === item.id);
  const done = own.find((l) => l.status === "Sold" || l.status === "Donated");
  if (done) return { type: done.type, status: done.status, listing: done };
  const offers = requests.filter((r) => r.offeredItemId === item.id);
  if (offers.some((r) => r.status === "completed")) return { type: "swap", status: "Swapped" };
  const selling = own.find((l) => l.type === "sell" && l.status === "Listed");
  if (selling) return { type: "sell", status: "Listed", listing: selling };
  if (offers.length) return { type: "swap", status: "Pending" };
  if (item.swappable) return { type: "swap", status: "Listed" };
  return null;
}

function rewearStatusLabel(st) {
  if (!st) return "";
  if (st.type === "sell" && st.status === "Listed") return `Listed for sale · ${formatLkr(st.listing.price)}`;
  if (st.type === "swap" && st.status === "Listed") return "Listed for swap";
  if (st.status === "Pending") return "Swap pending";
  if (st.status === "Donated" && st.listing?.center) return `Donated · ${st.listing.center}`;
  return st.status;
}

// Rewear block inside the item detail sheet
function rewearSheetSection(item) {
  const st = getRewearStatus(item);
  if (st) {
    return `
      <div class="item-detail-section rewear-sheet-section">
        <label class="item-detail-label">Rewear</label>
        <p class="rewear-sheet-status"><span class="rewear-pill rewear-pill-${st.status.toLowerCase()}">${st.status}</span> ${escapeHtml(rewearStatusLabel(st))}</p>
        <button type="button" class="btn-outline-action" data-go="my-rewear">Open My Rewear</button>
      </div>`;
  }
  return `
    <div class="item-detail-section rewear-sheet-section">
      <label class="item-detail-label">Rewear</label>
      <div class="rewear-actions">
        <button type="button" class="rewear-action" data-rewear-action="sell" data-rewear-item="${item.id}"><span>🏷️</span>Sell</button>
        <button type="button" class="rewear-action" data-rewear-action="swap" data-rewear-item="${item.id}"><span>🔁</span>Swap</button>
        <button type="button" class="rewear-action" data-rewear-action="donate" data-rewear-item="${item.id}"><span>💚</span>Donate</button>
      </div>
    </div>`;
}

function rewearItemHtml(item) {
  return `
    <img src="${item.photo}" alt="${escapeHtml(describe(item))}" />
    <div>
      <strong>${escapeHtml(describe(item))}</strong>
      <small>${escapeHtml(item.category || "")}${item.color ? ` · ${escapeHtml(item.color)}` : ""}</small>
    </div>`;
}

async function getRewearItem() {
  if (!rewearItemId) return null;
  return (await getAllItems()).find((x) => x.id === rewearItemId) || null;
}

function openRewearFlow(action, itemId) {
  rewearItemId = itemId;
  closeSheet();
  showScreen(`rewear-${action}`);
}

// ---------- Sell ----------
async function renderSellScreen() {
  const item = await getRewearItem();
  if (!item) return showScreen("wardrobe");
  $("#sell-item").innerHTML = rewearItemHtml(item);
  $("#sell-title").value = "";
  $("#sell-description").value = "";
  $("#sell-price").value = "";
  $("#sell-error").hidden = true;
  $("#sell-submit").disabled = false;

  // One /api/listing call per visit to this screen; the person can edit or type over it
  const token = ++sellDraftToken;
  const status = $("#sell-ai-status");
  status.textContent = "✨ Writing a title and description…";
  const fallback = () => {
    if (!$("#sell-title").value) $("#sell-title").value = describe(item).slice(0, 60);
    if (!$("#sell-description").value) {
      $("#sell-description").value = `Pre-loved ${item.color || ""} ${item.category || "piece"} from my wardrobe, ready for its next home.`.replace(/\s+/g, " ");
    }
  };
  try {
    const res = await callApi(
      "/api/listing",
      { item: { name: item.name || "", category: item.category, color: item.color, occasions: item.occasions || [], wears: item.wearCount || 0 } },
      { timeoutMs: 20000 }
    );
    if (token !== sellDraftToken) return;
    if (!$("#sell-title").value) $("#sell-title").value = res.title;
    if (!$("#sell-description").value) $("#sell-description").value = res.description;
    status.textContent = res.source === "mock" ? "✨ Drafted in test mode (not real Gemini). Edit anything." : "✨ Drafted by Gemini. Edit anything.";
  } catch (err) {
    if (token !== sellDraftToken) return;
    console.warn("Listing draft unavailable:", err.message);
    fallback();
    status.textContent = "The stylist needs a short break, so this is a basic draft. Edit anything.";
  }
}

$("#sell-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const item = await getRewearItem();
  if (!item) return;
  const title = $("#sell-title").value.trim();
  const description = $("#sell-description").value.trim();
  const price = Math.round(Number($("#sell-price").value));
  const err = $("#sell-error");
  const fail = (msg) => {
    err.textContent = msg;
    err.hidden = false;
  };
  if (!title) return fail("Add a title.");
  if (!description) return fail("Add a short description.");
  if (!Number.isFinite(price) || price <= 0) return fail(`Add a price in ${REWEAR_CURRENCY}.`);
  if (getRewearStatus(item)) return fail("This piece is already in My Rewear.");

  sellDraftToken++; // ignore a draft that arrives after listing
  saveListings([
    ...getListings(),
    {
      id: crypto.randomUUID ? crypto.randomUUID() : "listing_" + Date.now(),
      itemId: item.id,
      type: "sell",
      status: "Listed",
      title,
      description,
      price,
      currency: REWEAR_CURRENCY,
      itemName: describe(item),
      category: item.category,
      color: item.color,
      createdAt: Date.now(),
    },
  ]);
  toast(`Listed for ${formatLkr(price)} 🏷️`);
  showScreen("my-rewear");
});

// ---------- Swap ----------
async function renderRewearSwapScreen() {
  const item = await getRewearItem();
  if (!item) return showScreen("wardrobe");
  $("#swap-item").innerHTML = rewearItemHtml(item);
}

$("#swap-item-submit")?.addEventListener("click", async () => {
  const item = await getRewearItem();
  if (!item) return;
  if (getRewearStatus(item)) {
    toast("This piece is already in My Rewear");
    return showScreen("my-rewear");
  }
  item.swappable = true;
  await saveItem(item);
  awardKarma(KARMA_CONFIG.POINTS.MARK_SWAPPABLE, "Listed on Rewear");
  toast("Listed on the swap feed 🔁");
  showScreen("my-rewear");
});

// ---------- Donate ----------
async function renderDonateScreen() {
  const item = await getRewearItem();
  if (!item) return showScreen("wardrobe");
  $("#donate-item").innerHTML = rewearItemHtml(item);
  donateCenterId = null;
  $("#donate-submit").disabled = true;
  $("#donate-centers").innerHTML = DONATION_CENTERS.map(
    (c) => `
      <button type="button" class="donate-center" data-donate-center="${c.id}">
        <strong>${escapeHtml(c.name)}</strong>
        <small>${escapeHtml(c.area)} · Example only</small>
      </button>`
  ).join("");
}

$("#donate-centers")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-donate-center]");
  if (!btn) return;
  donateCenterId = btn.dataset.donateCenter;
  document.querySelectorAll("[data-donate-center]").forEach((b) => b.classList.toggle("selected", b === btn));
  $("#donate-submit").disabled = false;
});

$("#donate-submit")?.addEventListener("click", async () => {
  const item = await getRewearItem();
  const center = DONATION_CENTERS.find((c) => c.id === donateCenterId);
  if (!item || !center) return;
  if (getRewearStatus(item)) {
    toast("This piece is already in My Rewear");
    return showScreen("my-rewear");
  }
  if (item.swappable) {
    item.swappable = false; // donated pieces leave the swap feed
    await saveItem(item);
  }
  saveListings([
    ...getListings(),
    {
      id: crypto.randomUUID ? crypto.randomUUID() : "listing_" + Date.now(),
      itemId: item.id,
      type: "donate",
      status: "Donated",
      center: `${center.name} (${center.area})`,
      itemName: describe(item),
      category: item.category,
      color: item.color,
      createdAt: Date.now(),
      donatedAt: Date.now(),
    },
  ]);
  awardKarma(KARMA_CONFIG.POINTS.DONATE_ITEM, "Donated a piece");
  toast("Marked as donated 💚");
  showScreen("my-rewear");
});

// ---------- My Rewear ----------
async function renderMyRewear() {
  const [items, listings, requests] = [await getAllItems(), getListings(), getRequests()];
  const byId = new Map(items.map((it) => [it.id, it]));
  const earnings = getEarnings();

  $("#rewear-earnings").innerHTML = `
    <strong>${formatLkr(earnings.total)}</strong>
    <span>earned from ${earnings.entries.length} simulated sale${earnings.entries.length === 1 ? "" : "s"}</span>`;

  // One row per item: stored sell/donate listings, plus swaps from the swap feed
  const rows = [];
  const seen = new Set();
  for (const l of listings) {
    const it = byId.get(l.itemId);
    rows.push({
      key: l.id,
      status: l.status,
      type: l.type,
      listing: l,
      name: l.title || l.itemName || (it ? describe(it) : "Removed item"),
      itemId: l.itemId,
      shareKey: `sell_${l.id}`,
      photo: it ? itemIllustration(it, it.photo) : itemIllustration(l),
      meta: l.type === "sell" ? formatLkr(l.price) : l.center || "",
    });
    seen.add(l.itemId);
  }
  for (const it of items) {
    if (seen.has(it.id)) continue;
    const st = getRewearStatus(it, listings, requests);
    if (!st || st.type !== "swap") continue;
    rows.push({ key: it.id, itemId: it.id, shareKey: `swap_${it.id}`, status: st.status, type: "swap", name: describe(it), photo: itemIllustration(it, it.photo), meta: "Open to swaps" });
  }

  const list = $("#my-rewear-list");
  if (!rows.length) {
    list.innerHTML = `
      <div class="notice">
        <div class="notice-icon">♻️</div>
        <p>Nothing here yet.<br />Open a piece in your Closet and tap <strong>Sell</strong>, <strong>Swap</strong> or <strong>Donate</strong>.</p>
        <button class="btn-secondary" data-go="wardrobe">Go to Closet</button>
      </div>`;
    return;
  }

  const typeLabel = { sell: "Sell", swap: "Swap", donate: "Donate" };
  const shares = getFriendShares();
  list.innerHTML = REWEAR_STATUSES.map((status) => {
    const group = rows.filter((r) => r.status === status);
    if (!group.length) return "";
    return `
      <section class="rewear-group">
        <h3 class="rewear-group-title">${status} <span class="seg-count">${group.length}</span></h3>
        ${group
          .map(
            (r) => `
          <article class="rewear-row">
            <img src="${r.photo}" alt="" />
            <div class="rewear-row-info">
              <strong>${escapeHtml(r.name)}</strong>
              <small>${typeLabel[r.type] || ""}${r.meta ? ` · ${escapeHtml(r.meta)}` : ""}</small>
            </div>
            ${
              r.type === "sell" && r.status === "Listed"
                ? `<button type="button" class="btn-card-small primary" data-mark-sold="${r.listing.id}">Mark as sold</button>`
                : ""
            }
            ${
              (r.type === "sell" || r.type === "swap") && r.status === "Listed"
                ? `<label class="toggle-row share-toggle">
                     <span>Share with friends</span>
                     <input type="checkbox" data-share-key="${r.shareKey}" data-share-item="${r.itemId}" data-share-listing="${r.listing ? r.listing.id : ""}" data-share-type="${r.type}" ${shares[r.shareKey] ? "checked" : ""} />
                     <span class="switch"></span>
                   </label>`
                : ""
            }
          </article>`
          )
          .join("")}
      </section>`;
  }).join("");
}

// Simulated sale: no money moves, it only records the amount in weari_earnings
$("#my-rewear-list")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mark-sold]");
  if (!btn) return;
  const list = getListings();
  const l = list.find((x) => x.id === btn.dataset.markSold);
  if (!l || l.status !== "Listed") return;
  l.status = "Sold";
  l.soldAt = Date.now();
  saveListings(list);

  const earnings = getEarnings();
  earnings.total += Number(l.price) || 0;
  earnings.entries.push({ listingId: l.id, itemName: l.title || l.itemName, amount: Number(l.price) || 0, soldAt: l.soldAt });
  saveEarnings(earnings);

  awardKarma(KARMA_CONFIG.POINTS.SELL_ITEM, "Sold a piece");
  syncSharedListingStatus(`sell_${l.id}`, "Sold");
  toast(`Sold for ${formatLkr(l.price)} (simulated) 🎉`);
  renderMyRewear();
});

// Counts for Insights
function getRewearCounts() {
  const listings = getListings();
  return {
    sold: listings.filter((l) => l.status === "Sold").length,
    donated: listings.filter((l) => l.status === "Donated").length,
    swapped: getCompletedSwapsCount(),
    earned: getEarnings().total,
  };
}

// =====================================================
// Insights screen
// =====================================================
async function renderInsights() {
  const items = await getAllItems();

  // 1. Swap nudge (simple rules, not AI)
  const neverWorn = items.filter((it) => !isWornInLast30Days(it));
  const nudgeEl = $("#insights-nudge");
  if (items.length === 0) {
    nudgeEl.innerHTML = `<p>Your wardrobe is empty. Add pieces to begin tracking wears and swaps.</p>`;
  } else if (neverWorn.length === 0) {
    nudgeEl.innerHTML = `<p>Every piece in your wardrobe was worn in the last 30 days! Outstanding rotation.</p>`;
  } else if (neverWorn.length === 1) {
    nudgeEl.innerHTML = `<p>You have 1 piece you haven’t worn in 30 days. Could someone else love it?</p>`;
  } else {
    nudgeEl.innerHTML = `<p>You have ${neverWorn.length} pieces you haven’t worn in 30 days. Could someone else love them?</p>`;
  }

  // 2. Circular impact (only completed swaps and purchases avoided, not items simply worn)
  const completedSwaps = getCompletedSwapsCount();
  const purchasesAvoided = getPurchasesAvoidedCount();
  const impact = IMPACT_CONFIG.calculate(completedSwaps, purchasesAvoided);

  const avoidedEl = $("#stat-purchases-avoided");
  if (avoidedEl) avoidedEl.textContent = purchasesAvoided;
  const consideredEl = $("#stat-considered");
  if (consideredEl) consideredEl.textContent = getConsideredNotBoughtCount();

  // Rewear: sold, donated and swapped pieces
  const rewear = getRewearCounts();
  const setStat = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };
  setStat("#stat-rewear-sold", rewear.sold);
  setStat("#stat-rewear-donated", rewear.donated);
  setStat("#stat-rewear-swapped", rewear.swapped);
  setStat("#stat-rewear-earned", formatLkr(rewear.earned));

  const countsEl = $("#impact-counts");
  if (countsEl) countsEl.textContent = `Estimated · ${completedSwaps} completed swap${completedSwaps === 1 ? "" : "s"} · ${purchasesAvoided} purchase${purchasesAvoided === 1 ? "" : "s"} avoided`;
  const headlineEl = $("#impact-headline");
  if (headlineEl) headlineEl.textContent = impact.headline;
  const detailEl = $("#impact-detail");
  if (detailEl) detailEl.textContent = impact.caption;
  const noteEl = $("#impact-estimate-note");
  if (noteEl) noteEl.innerHTML = `<small><strong>How we estimate this:</strong> Based on estimated lifecycle savings from completed swaps and retail purchases avoided by rewearing.</small>`;

  // 3. Wardrobe usage (worn in last 30 days)
  const worn30Days = items.filter(isWornInLast30Days);
  const percent = items.length ? Math.round((worn30Days.length / items.length) * 100) : 0;

  $("#usage-percent").textContent = `${percent}%`;
  $("#usage-fraction").textContent = `${worn30Days.length} of ${items.length} pieces`;
  $("#usage-bar-fill").style.width = `${percent}%`;

  const circ = 2 * Math.PI * 42; // ~263.89
  const ringProgress = $("#usage-ring-progress");
  ringProgress.style.strokeDasharray = `${circ}`;
  ringProgress.style.strokeDashoffset = `${circ - (circ * percent) / 100}`;

  if (items.length === 0) {
    $("#usage-desc").textContent = "Add clothes to your wardrobe to see your rotation analytics.";
  } else if (percent >= 70) {
    $("#usage-desc").textContent = "High rotation! You regularly wear most of your collection.";
  } else if (percent >= 35) {
    $("#usage-desc").textContent = "Steady rotation. Try styling idle pieces for upcoming occasions.";
  } else {
    $("#usage-desc").textContent = "Great opportunity to rotate more pieces or list idle favorites on Rewear.";
  }

  // 4. Most worn items (top 3)
  const mostWorn = items
    .filter((it) => (it.wearCount || 0) > 0)
    .sort((a, b) => (b.wearCount || 0) - (a.wearCount || 0))
    .slice(0, 3);

  const mostWornList = $("#most-worn-list");
  if (!mostWorn.length) {
    mostWornList.innerHTML = `<p class="empty-hint">No wears logged yet. Tap "Mark as worn" on any item or log an outfit in Style me.</p>`;
  } else {
    mostWornList.innerHTML = mostWorn
      .map(
        (it) => `
      <article class="card">
        <img src="${it.photo}" alt="${describe(it)}" loading="lazy" />
        <div class="card-body">
          <div class="card-top">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="card-cat">${describe(it)}</span>
          </div>
          ${tagsHtml(it.occasions)}
          <div class="card-wear-row">
            <span class="wear-stat-pill"><strong>${it.wearCount}</strong> wear${it.wearCount === 1 ? "" : "s"}</span>
            <span class="card-last-worn">${formatLastWorn(it.lastWorn)}</span>
          </div>
        </div>
      </article>`
      )
      .join("");
  }

  // 5. Never worn / Inactive items (not worn in 30 days or ever)
  const neverWornList = $("#never-worn-list");
  if (!neverWorn.length) {
    neverWornList.innerHTML = `<p class="empty-hint">None! Every single item in your wardrobe has been worn within the last 30 days.</p>`;
  } else {
    neverWornList.innerHTML = neverWorn
      .map(
        (it) => `
      <article class="card">
        <img src="${it.photo}" alt="${describe(it)}" loading="lazy" />
        ${it.swappable ? `<span class="swap-badge">Swap</span>` : ""}
        <div class="card-body">
          <div class="card-top">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="card-cat">${describe(it)}</span>
          </div>
          ${tagsHtml(it.occasions)}
          <span class="card-last-worn">${formatLastWorn(it.lastWorn)}</span>
          <div class="insights-card-actions">
            <button type="button" class="btn-small ${it.swappable ? "done" : ""}" data-list-swap="${it.id}">
              ${it.swappable ? "✓ Listed on Rewear" : "List on Rewear"}
            </button>
            <button type="button" class="btn-small btn-secondary" data-style-item="${it.id}">
              Style it
            </button>
          </div>
        </div>
      </article>`
      )
      .join("");
  }
}

$("#screen-insights").addEventListener("click", async (e) => {
  const swapBtn = e.target.closest("[data-list-swap]");
  if (swapBtn) {
    const id = swapBtn.dataset.listSwap;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      const wasSwappable = it.swappable;
      it.swappable = true;
      await saveItem(it);
      renderInsights();
      toast("Listed on Rewear ✨");
      if (!wasSwappable) {
        awardKarma(KARMA_CONFIG.POINTS.MARK_SWAPPABLE, "Listed on Rewear");
      }
    }
    return;
  }

  const styleBtn = e.target.closest("[data-style-item]");
  if (styleBtn) {
    const id = styleBtn.dataset.styleItem;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      styleOccasion = (it.occasions && it.occasions[0]) || "casual";
      showScreen("style");
      renderStyleOccasions();
      showSuggestion(it.id);
      toast(`Styling an outfit with your ${it.color} ${it.category}`);
    }
  }
});

// =====================================================
// Karma screen
// =====================================================
async function renderKarma() {
  const karma = getKarma();
  const items = await getAllItems();
  updateKarmaStreak();

  // Evaluate automatic milestones based on current closet state
  if (items.length >= 1) unlockBadge("first_item");
  if (items.length >= 10) unlockBadge("ten_items");

  // Hero points
  const totalPointsEl = $("#karma-total-points");
  if (totalPointsEl) totalPointsEl.textContent = karma.points;

  // Level & Progress bar
  const levelInfo = getLevelInfo(karma.points);
  const levelNameEl = $("#level-name");
  const levelIconEl = $("#level-icon");
  const levelFillEl = $("#level-bar-fill");
  const levelTextEl = $("#level-progress-text");
  const levelPctEl = $("#level-progress-pct");

  if (levelNameEl) levelNameEl.textContent = levelInfo.current.name;
  if (levelIconEl) levelIconEl.textContent = levelInfo.current.icon || "🌱";
  if (levelFillEl) levelFillEl.style.width = `${levelInfo.pct}%`;
  if (levelTextEl) levelTextEl.textContent = levelInfo.progressText;
  if (levelPctEl) levelPctEl.textContent = `${levelInfo.pct}%`;

  // Streak counter
  const streakDaysEl = $("#streak-days");
  if (streakDaysEl) streakDaysEl.textContent = karma.streakDays || 1;

  // Badges grid
  const unlockedSet = new Set(karma.unlockedBadges);
  const badgesGridEl = $("#badges-grid");
  if (badgesGridEl) {
    badgesGridEl.innerHTML = KARMA_CONFIG.BADGES.map((b) => {
      const isUnlocked = unlockedSet.has(b.id);
      return `
        <div class="badge-card ${isUnlocked ? "unlocked" : "locked"}">
          <div class="badge-icon-wrap">${b.icon}</div>
          <h4 class="badge-name">${b.name}</h4>
          <p class="badge-desc">${b.description}</p>
          <span class="badge-status">${isUnlocked ? "✓ Unlocked" : "🔒 Locked"}</span>
        </div>`;
    }).join("");
  }
}

// Celebration modal close handlers
const celebrationModal = $("#celebration-modal");
if (celebrationModal) {
  celebrationModal.addEventListener("click", (e) => {
    if (e.target.id === "celebration-close" || e.target.id === "celebration-backdrop") {
      celebrationModal.hidden = true;
    }
  });
}

// =====================================================
// Onboarding Flow, Profile Completion, and Settings
// =====================================================
const ONBOARDING_COMPLETED_KEY = "weari_onboarding_completed";
const ONBOARDING_ANSWERS_KEY = "weari_onboarding_answers";
const PROFILE_KEY = "weari_user_profile";
const PROFILE_DISMISSED_KEY = "weari_profile_dismissed";

let currentObStep = 0;
let returningToOnboarding = false;
const obAnswers = {
  goal: null,
  styles: [],
  occasions: [],
  shopping: null,
};

function loadStoredObAnswers() {
  try {
    const raw = localStorage.getItem(ONBOARDING_ANSWERS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.goal) obAnswers.goal = data.goal;
      if (Array.isArray(data.styles)) obAnswers.styles = data.styles;
      if (Array.isArray(data.occasions)) obAnswers.occasions = data.occasions;
      if (data.shopping) obAnswers.shopping = data.shopping;
    }
  } catch {}
}

function saveObAnswers() {
  try {
    localStorage.setItem(ONBOARDING_ANSWERS_KEY, JSON.stringify(obAnswers));
  } catch {}
}

async function updateStarterChecklist() {
  const items = await getAllItems();
  const hasTop = items.some((i) => i.category === "top");
  const hasBottom = items.some((i) => i.category === "bottom");
  const hasLayer = items.some((i) => i.category === "dress" || i.category === "outerwear");
  const hasShoes = items.some((i) => i.category === "shoes");
  const hasFavorite = items.length >= 5 || items.some((i) => i.category === "accessory");

  $("#ob-check-top")?.classList.toggle("checked", hasTop);
  $("#ob-check-bottom")?.classList.toggle("checked", hasBottom);
  $("#ob-check-layer")?.classList.toggle("checked", hasLayer);
  $("#ob-check-shoes")?.classList.toggle("checked", hasShoes);
  $("#ob-check-favorite")?.classList.toggle("checked", hasFavorite);

  const isReady = items.length >= 5 || (hasTop && hasBottom && hasLayer && hasShoes);
  const readyPanel = $("#ob-ready-panel");
  if (readyPanel) readyPanel.hidden = !isReady;
}

function openOnboarding(step = 0) {
  loadStoredObAnswers();
  currentObStep = step;
  const overlay = $("#onboarding-overlay");
  if (overlay) {
    overlay.hidden = false;
    overlay.scrollTop = 0;
  }
  renderOnboardingStep();
}

function closeOnboarding() {
  const overlay = $("#onboarding-overlay");
  if (overlay) overlay.hidden = true;
}

function completeOnboarding() {
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
  closeOnboarding();
}

function renderOnboardingStep() {
  const steps = [
    $("#ob-step-welcome"),
    $("#ob-step-1"),
    $("#ob-step-2"),
    $("#ob-step-3"),
    $("#ob-step-4"),
    $("#ob-step-5"),
  ];

  steps.forEach((el, idx) => {
    if (el) el.hidden = idx !== currentObStep;
  });

  const backBtn = $("#ob-btn-back");
  const progressWrap = $("#ob-progress-wrap");
  const progressFill = $("#ob-progress-fill");
  const stepLabel = $("#ob-step-label");
  const skipBtn = $("#ob-btn-skip-top");

  if (currentObStep === 0) {
    if (backBtn) backBtn.hidden = true;
    if (progressWrap) progressWrap.hidden = true;
    if (skipBtn) skipBtn.hidden = true;
  } else if (currentObStep >= 1 && currentObStep <= 4) {
    if (backBtn) backBtn.hidden = false;
    if (progressWrap) progressWrap.hidden = false;
    if (skipBtn) skipBtn.hidden = false;

    const pct = Math.round((currentObStep / 4) * 100);
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (stepLabel) stepLabel.textContent = `Question ${currentObStep} of 4`;
  } else if (currentObStep === 5) {
    if (backBtn) backBtn.hidden = false;
    if (progressWrap) progressWrap.hidden = true;
    if (skipBtn) skipBtn.hidden = false;
    updateStarterChecklist();
  }

  // Restore options selection state
  if (currentObStep === 1) {
    document.querySelectorAll("#ob-options-goal .ob-option-card").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.val === obAnswers.goal);
    });
    const nextBtn = $("#ob-btn-next-1");
    if (nextBtn) nextBtn.disabled = !obAnswers.goal;
  } else if (currentObStep === 2) {
    document.querySelectorAll("#ob-options-styles .ob-option-card").forEach((btn) => {
      btn.classList.toggle("selected", obAnswers.styles.includes(btn.dataset.val));
    });
    const nextBtn = $("#ob-btn-next-2");
    if (nextBtn) nextBtn.disabled = obAnswers.styles.length === 0;
  } else if (currentObStep === 3) {
    document.querySelectorAll("#ob-options-occasions .ob-option-card").forEach((btn) => {
      btn.classList.toggle("selected", obAnswers.occasions.includes(btn.dataset.val));
    });
    const nextBtn = $("#ob-btn-next-3");
    if (nextBtn) nextBtn.disabled = obAnswers.occasions.length === 0;
  } else if (currentObStep === 4) {
    document.querySelectorAll("#ob-options-shopping .ob-option-card").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.val === obAnswers.shopping);
    });
    const nextBtn = $("#ob-btn-next-4");
    if (nextBtn) nextBtn.disabled = !obAnswers.shopping;
  }
}

// Onboarding Event Listeners
$("#ob-btn-get-started")?.addEventListener("click", () => {
  currentObStep = 1;
  renderOnboardingStep();
});

$("#ob-btn-welcome-skip")?.addEventListener("click", () => {
  completeOnboarding();
  showScreen("wardrobe");
});

$("#ob-btn-skip-top")?.addEventListener("click", () => {
  completeOnboarding();
  showScreen("wardrobe");
});

$("#ob-btn-back")?.addEventListener("click", () => {
  if (currentObStep > 0) {
    currentObStep--;
    renderOnboardingStep();
  }
});

// Quiz 1: What brings you to Weari
$("#ob-options-goal")?.addEventListener("click", (e) => {
  const card = e.target.closest(".ob-option-card");
  if (!card) return;
  obAnswers.goal = card.dataset.val;
  saveObAnswers();
  document.querySelectorAll("#ob-options-goal .ob-option-card").forEach((b) => {
    b.classList.toggle("selected", b === card);
  });
  const nextBtn = $("#ob-btn-next-1");
  if (nextBtn) nextBtn.disabled = false;
});

$("#ob-btn-next-1")?.addEventListener("click", () => {
  currentObStep = 2;
  renderOnboardingStep();
});

// Quiz 2: What is your style (up to 3)
$("#ob-options-styles")?.addEventListener("click", (e) => {
  const card = e.target.closest(".ob-option-card");
  if (!card) return;
  const val = card.dataset.val;
  if (obAnswers.styles.includes(val)) {
    obAnswers.styles = obAnswers.styles.filter((s) => s !== val);
    card.classList.remove("selected");
  } else {
    if (obAnswers.styles.length >= 3) {
      toast("Please choose up to 3 styles");
      return;
    }
    obAnswers.styles.push(val);
    card.classList.add("selected");
  }
  saveObAnswers();
  const nextBtn = $("#ob-btn-next-2");
  if (nextBtn) nextBtn.disabled = obAnswers.styles.length === 0;
});

$("#ob-btn-next-2")?.addEventListener("click", () => {
  currentObStep = 3;
  renderOnboardingStep();
});

// Quiz 3: What do you dress for (choose any)
$("#ob-options-occasions")?.addEventListener("click", (e) => {
  const card = e.target.closest(".ob-option-card");
  if (!card) return;
  const val = card.dataset.val;
  if (obAnswers.occasions.includes(val)) {
    obAnswers.occasions = obAnswers.occasions.filter((o) => o !== val);
    card.classList.remove("selected");
  } else {
    obAnswers.occasions.push(val);
    card.classList.add("selected");
  }
  saveObAnswers();
  const nextBtn = $("#ob-btn-next-3");
  if (nextBtn) nextBtn.disabled = obAnswers.occasions.length === 0;
});

$("#ob-btn-next-3")?.addEventListener("click", () => {
  currentObStep = 4;
  renderOnboardingStep();
});

// Quiz 4: How do you shop
$("#ob-options-shopping")?.addEventListener("click", (e) => {
  const card = e.target.closest(".ob-option-card");
  if (!card) return;
  obAnswers.shopping = card.dataset.val;
  saveObAnswers();
  document.querySelectorAll("#ob-options-shopping .ob-option-card").forEach((b) => {
    b.classList.toggle("selected", b === card);
  });
  const nextBtn = $("#ob-btn-next-4");
  if (nextBtn) nextBtn.disabled = false;
});

$("#ob-btn-next-4")?.addEventListener("click", () => {
  currentObStep = 5;
  renderOnboardingStep();
});

// Starter Closet Actions
$("#ob-btn-starter-camera")?.addEventListener("click", () => {
  returningToOnboarding = true;
  closeOnboarding();
  showScreen("add");
  startCameraScan();
});

$("#ob-btn-starter-upload")?.addEventListener("click", () => {
  returningToOnboarding = true;
  closeOnboarding();
  showScreen("add");
  $("#photo-input")?.click();
});

$("#ob-btn-load-demo")?.addEventListener("click", async () => {
  await loadDemoWardrobe();
});

$("#ob-btn-first-look")?.addEventListener("click", () => {
  completeOnboarding();
  showScreen("style");
});

// =====================================================
// Profile Completion Card
// =====================================================
function renderProfileCard() {
  const card = $("#profile-card");
  if (!card) return;

  const stored = readStoredProfile();
  const storedProfile =
    stored.completedAt || ["age", "closet", "sustainability", "pieces", "budget"].some((k) => k in stored);
  const isDismissed = localStorage.getItem(PROFILE_DISMISSED_KEY);

  if (storedProfile) {
    card.hidden = false;
    $("#profile-card-body").hidden = true;
    $("#profile-card-completed").hidden = false;
    return;
  }

  if (isDismissed) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  $("#profile-card-body").hidden = false;
  $("#profile-card-completed").hidden = true;
}

// Profile pills selection handler
document.querySelectorAll(".profile-pill-group")?.forEach((group) => {
  group.addEventListener("click", (e) => {
    const pill = e.target.closest(".profile-pill");
    if (!pill) return;
    const isAlreadySelected = pill.classList.contains("selected");
    group.querySelectorAll(".profile-pill").forEach((p) => p.classList.remove("selected"));
    if (!isAlreadySelected) {
      pill.classList.add("selected");
    }
  });
});

$("#btn-save-profile")?.addEventListener("click", () => {
  const age = $("#profile-pills-age .profile-pill.selected")?.dataset.val || null;
  const closet = $("#profile-pills-closet .profile-pill.selected")?.dataset.val || null;
  const sustainability = $("#profile-pills-sustainability .profile-pill.selected")?.dataset.val || null;
  const pieces = $("#profile-pills-pieces .profile-pill.selected")?.dataset.val || null;
  const budget = $("#profile-pills-budget .profile-pill.selected")?.dataset.val || null;

  mergeStoredProfile({ age, closet, sustainability, pieces, budget, completedAt: Date.now() });
  awardKarma(25, "Completed style profile");

  $("#profile-card-body").hidden = true;
  $("#profile-card-completed").hidden = false;
  toast("Profile saved (+25 Karma) ✨");
});

$("#btn-edit-profile")?.addEventListener("click", () => {
  $("#profile-card-body").hidden = false;
  $("#profile-card-completed").hidden = true;
});

$("#btn-skip-profile")?.addEventListener("click", () => {
  localStorage.setItem(PROFILE_DISMISSED_KEY, "true");
  const card = $("#profile-card");
  if (card) card.hidden = true;
});

$("#btn-profile-dismiss")?.addEventListener("click", () => {
  localStorage.setItem(PROFILE_DISMISSED_KEY, "true");
  const card = $("#profile-card");
  if (card) card.hidden = true;
});

// =====================================================
// Settings Modal
// =====================================================
function openSettings() {
  const answers = JSON.parse(localStorage.getItem(ONBOARDING_ANSWERS_KEY) || "{}");
  const summaryEl = $("#settings-profile-summary");
  if (summaryEl) {
    const hasAny = answers.goal || (answers.styles && answers.styles.length) || (answers.occasions && answers.occasions.length) || answers.shopping;
    if (hasAny) {
      summaryEl.innerHTML = `
        <div class="settings-profile-row">
          <span class="settings-profile-label">Goal</span>
          <span class="settings-profile-value">${answers.goal || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Style</span>
          <span class="settings-profile-value">${(answers.styles && answers.styles.join(", ")) || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Dressing for</span>
          <span class="settings-profile-value">${(answers.occasions && answers.occasions.join(", ")) || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Shopping habit</span>
          <span class="settings-profile-value">${answers.shopping || "Not set"}</span>
        </div>
      `;
    } else {
      summaryEl.innerHTML = `<p class="settings-empty-profile">No style answers saved yet.</p>`;
    }
  }

  $("#settings-modal").hidden = false;
  $("#settings-backdrop").hidden = false;
}

function closeSettings() {
  $("#settings-modal").hidden = true;
  $("#settings-backdrop").hidden = true;
}

$("#btn-settings")?.addEventListener("click", openSettings);
$("#btn-profile-settings")?.addEventListener("click", openSettings);
$("#settings-close")?.addEventListener("click", closeSettings);
$("#settings-backdrop")?.addEventListener("click", closeSettings);

$("#btn-replay-onboarding")?.addEventListener("click", () => {
  closeSettings();
  openOnboarding(0);
});

// Re-check onboarding starter closet if returning
document.addEventListener("item-saved", async () => {
  if (returningToOnboarding) {
    returningToOnboarding = false;
    openOnboarding(5);
  }
});

// =====================================================
// PART 1: Demo Wardrobe & Reset App
// =====================================================
function getDemoWardrobeItems() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return [
    {
      id: "demo_top_1",
      name: "Classic linen button-down",
      category: "top",
      color: "white",
      occasions: ["casual", "work"],
      photo: typeof placeholderImage === "function" ? placeholderImage("top", "white") : "",
      swappable: false,
      wearCount: 8,
      lastWorn: new Date(now).toISOString(),
      createdAt: now - 30 * dayMs,
    },
    {
      id: "demo_top_2",
      name: "Ribbed stretch tank",
      category: "top",
      color: "black",
      occasions: ["casual", "party"],
      photo: typeof placeholderImage === "function" ? placeholderImage("top", "black") : "",
      swappable: false,
      wearCount: 14,
      lastWorn: new Date(now - 1 * dayMs).toISOString(),
      createdAt: now - 35 * dayMs,
    },
    {
      id: "demo_top_3",
      name: "Breton striped crewneck",
      category: "top",
      color: "navy",
      occasions: ["casual", "travel"],
      photo: typeof placeholderImage === "function" ? placeholderImage("top", "navy") : "",
      swappable: false,
      wearCount: 6,
      lastWorn: new Date(now - 5 * dayMs).toISOString(),
      createdAt: now - 28 * dayMs,
    },
    {
      id: "demo_top_4",
      name: "Relaxed cotton boyfriend tee",
      category: "top",
      color: "grey",
      occasions: ["casual"],
      photo: typeof placeholderImage === "function" ? placeholderImage("top", "grey") : "",
      swappable: false,
      wearCount: 11,
      lastWorn: new Date(now - 3 * dayMs).toISOString(),
      createdAt: now - 32 * dayMs,
    },
    {
      id: "demo_bottom_1",
      name: "High-waist wide trousers",
      category: "bottom",
      color: "beige",
      occasions: ["work", "formal"],
      photo: typeof placeholderImage === "function" ? placeholderImage("bottom", "beige") : "",
      swappable: false,
      wearCount: 9,
      lastWorn: new Date(now - 2 * dayMs).toISOString(),
      createdAt: now - 40 * dayMs,
    },
    {
      id: "demo_bottom_2",
      name: "Straight-leg vintage jeans",
      category: "bottom",
      color: "blue",
      occasions: ["casual", "travel"],
      photo: typeof placeholderImage === "function" ? placeholderImage("bottom", "blue") : "",
      swappable: false,
      wearCount: 15,
      lastWorn: new Date(now - 4 * dayMs).toISOString(),
      createdAt: now - 45 * dayMs,
    },
    {
      id: "demo_bottom_3",
      name: "Pleated satin midi skirt",
      category: "bottom",
      color: "brown",
      occasions: ["work", "date night"],
      photo: typeof placeholderImage === "function" ? placeholderImage("bottom", "brown") : "",
      swappable: true,
      wearCount: 2,
      lastWorn: new Date(now - 35 * dayMs).toISOString(),
      createdAt: now - 50 * dayMs,
    },
    {
      id: "demo_dress_1",
      name: "Emerald silk slip dress",
      category: "dress",
      color: "green",
      occasions: ["party", "wedding", "date night"],
      photo: typeof placeholderImage === "function" ? placeholderImage("dress", "green") : "",
      swappable: true,
      wearCount: 1,
      lastWorn: new Date(now - 45 * dayMs).toISOString(),
      createdAt: now - 55 * dayMs,
    },
    {
      id: "demo_dress_2",
      name: "Tiered linen sundress",
      category: "dress",
      color: "yellow",
      occasions: ["casual", "travel"],
      photo: typeof placeholderImage === "function" ? placeholderImage("dress", "yellow") : "",
      swappable: false,
      wearCount: 4,
      lastWorn: new Date(now - 18 * dayMs).toISOString(),
      createdAt: now - 25 * dayMs,
    },
    {
      id: "demo_shoes_1",
      name: "Low-profile court sneakers",
      category: "shoes",
      color: "white",
      occasions: ["casual", "travel"],
      photo: typeof placeholderImage === "function" ? placeholderImage("shoes", "white") : "",
      swappable: false,
      wearCount: 22,
      lastWorn: new Date(now - 1 * dayMs).toISOString(),
      createdAt: now - 60 * dayMs,
    },
    {
      id: "demo_shoes_2",
      name: "Strappy block heel sandals",
      category: "shoes",
      color: "black",
      occasions: ["party", "wedding", "formal"],
      photo: typeof placeholderImage === "function" ? placeholderImage("shoes", "black", "heel") : "",
      swappable: true,
      wearCount: 0,
      lastWorn: null,
      createdAt: now - 65 * dayMs,
    },
    {
      id: "demo_outer_1",
      name: "Boxy wash trucker jacket",
      category: "outerwear",
      color: "blue",
      occasions: ["casual", "travel"],
      photo: typeof placeholderImage === "function" ? placeholderImage("outerwear", "blue") : "",
      swappable: false,
      wearCount: 5,
      lastWorn: new Date(now - 12 * dayMs).toISOString(),
      createdAt: now - 35 * dayMs,
    },
    {
      id: "demo_outer_2",
      name: "Wool camel tailored trench",
      category: "outerwear",
      color: "brown",
      occasions: ["work", "formal"],
      photo: typeof placeholderImage === "function" ? placeholderImage("outerwear", "brown") : "",
      swappable: true,
      wearCount: 3,
      lastWorn: new Date(now - 40 * dayMs).toISOString(),
      createdAt: now - 70 * dayMs,
    },
    {
      id: "demo_acc_1",
      name: "Woven raffia market tote",
      category: "accessory",
      color: "beige",
      occasions: ["casual", "travel", "beach"],
      photo: typeof placeholderImage === "function" ? placeholderImage("accessory", "beige", "bag") : "",
      swappable: false,
      wearCount: 7,
      lastWorn: new Date(now - 8 * dayMs).toISOString(),
      createdAt: now - 20 * dayMs,
    },
    {
      id: "demo_acc_2",
      name: "Slim leather belt",
      category: "accessory",
      color: "brown",
      occasions: ["work", "casual", "date night"],
      photo: typeof placeholderImage === "function" ? placeholderImage("accessory", "brown", "belt") : "",
      swappable: false,
      wearCount: 10,
      lastWorn: new Date(now - 6 * dayMs).toISOString(),
      createdAt: now - 22 * dayMs,
    },
  ];
}

async function loadDemoWardrobe() {
  const demoItems = getDemoWardrobeItems();
  for (const item of demoItems) {
    await saveItem(item);
  }
  const saved = getSavedOutfits();
  if (!saved.length) {
    const demoOutfits = [
      {
        id: "demo_outfit_work",
        name: "Monday Office Chic",
        occasion: "work",
        createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
        items: [demoItems[0], demoItems[4], demoItems[9]],
      },
      {
        id: "demo_outfit_weekend",
        name: "Casual Saturday Stroll",
        occasion: "casual",
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        items: [demoItems[3], demoItems[5], demoItems[9], demoItems[11]],
      },
    ];
    saveSavedOutfits(demoOutfits);
  }
  closeSettings();
  renderWardrobe();
  renderProfileScreen();
  renderInsights();
  renderSavedOutfits();
  if (typeof renderFavorites === "function") renderFavorites();
  if (typeof renderWeeklyPlan === "function") renderWeeklyPlan();
  toast(`Loaded ${demoItems.length} demo wardrobe pieces ✨`);
}

// Every storage key Weari has ever used (current + legacy). Keys are not renamed;
// we just make sure Reset clears all of them.
function getAllWeariStorageKeys() {
  const known = [
    BACKUP_ITEMS_KEY, KARMA_STORAGE_KEY, COMPLETED_SWAPS_KEY, PURCHASES_AVOIDED_KEY,
    SAVED_OUTFITS_KEY, REQUESTS_KEY, ONBOARDING_COMPLETED_KEY, ONBOARDING_ANSWERS_KEY,
    PROFILE_KEY, PROFILE_DISMISSED_KEY, PROFILE_FIRST_NAME_KEY, PROFILE_EMAIL_KEY,
    WEARI_PLUS_WAITLIST_KEY, FAVORITES_STORAGE_KEY, WEEKLY_PLAN_KEY, PLAN_REPEAT_KEY,
    CUSTOM_LABELS_KEY, LISTINGS_KEY, EARNINGS_KEY, FRIEND_SHARES_KEY,
    "weari-favorite-outfits",
    ...LEGACY_ITEM_STORAGE_KEYS, ...LEGACY_WEAR_COUNT_KEYS, ...LEGACY_OUTFIT_KEYS,
    ...LEGACY_KARMA_KEYS, ...LEGACY_REQUEST_KEYS,
  ];
  const keys = new Set();
  // Include both the dash and underscore spelling of every key
  known.forEach((k) => {
    keys.add(k);
    keys.add(k.replace(/_/g, "-"));
    keys.add(k.replace(/-/g, "_"));
  });
  // Catch anything else saved under a "weari" name
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^weari/i.test(k)) keys.add(k);
    }
  } catch {}
  return [...keys];
}

async function resetApp() {
  if (!confirm("Reset all data? This permanently clears your wardrobe, photos, outfits, plans, swaps, karma and profile on this device.")) return;
  try {
    await dbRun("readwrite", (s) => s.clear()); // the "weari" IndexedDB (items + photos)
  } catch (e) {
    console.warn("DB reset error:", e);
  }
  try {
    getAllWeariStorageKeys().forEach((k) => localStorage.removeItem(k));
  } catch {}
  // Reload so nothing still held in memory gets saved back
  location.reload();
}

// Event bindings for demo and reset buttons
document.addEventListener("click", (e) => {
  if (e.target.closest("#btn-load-demo-wardrobe") || e.target.closest("#btn-settings-load-demo") || e.target.closest("#btn-profile-load-demo")) {
    loadDemoWardrobe();
  }
  if (e.target.closest("#btn-settings-reset-app") || e.target.closest("#btn-profile-reset-app")) {
    resetApp();
  }
});

// =====================================================
// PART 2: Profile Screen Logic
// =====================================================
const PROFILE_FIRST_NAME_KEY = "weari_profile_first_name";
const PROFILE_EMAIL_KEY = "weari_profile_email";
const WEARI_PLUS_WAITLIST_KEY = "weari_plus_waitlist";

function getProfileFirstName() {
  try {
    return localStorage.getItem(PROFILE_FIRST_NAME_KEY) || "Elena";
  } catch {
    return "Elena";
  }
}

function getProfileEmail() {
  try {
    return localStorage.getItem(PROFILE_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

async function renderProfileScreen() {
  const name = getProfileFirstName();
  const email = getProfileEmail();

  // 1. Avatar initial
  const initialEl = $("#profile-avatar-initial");
  if (initialEl) {
    initialEl.textContent = (name.trim().charAt(0) || "W").toUpperCase();
  }

  // 2. Editable first name & email inputs
  const nameInput = $("#profile-first-name");
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = name;
  }
  const emailInput = $("#profile-email");
  if (emailInput && document.activeElement !== emailInput) {
    emailInput.value = email;
  }

  // 3. Karma level and progress bar
  const karma = getKarma();
  const levelInfo = getLevelInfo(karma.points);
  const karmaIconEl = $("#profile-karma-icon");
  const karmaLevelNameEl = $("#profile-karma-level-name");
  const karmaPointsEl = $("#profile-karma-points");
  const karmaFillEl = $("#profile-karma-fill");
  const karmaMetaTextEl = $("#profile-karma-meta-text");
  const karmaMetaPctEl = $("#profile-karma-meta-pct");

  if (karmaIconEl) karmaIconEl.textContent = levelInfo.current.icon || "🌱";
  if (karmaLevelNameEl) karmaLevelNameEl.textContent = levelInfo.current.name;
  if (karmaPointsEl) karmaPointsEl.textContent = karma.points;
  if (karmaFillEl) karmaFillEl.style.width = `${levelInfo.pct}%`;
  if (karmaMetaTextEl) karmaMetaTextEl.textContent = levelInfo.progressText;
  if (karmaMetaPctEl) karmaMetaPctEl.textContent = `${levelInfo.pct}%`;

  // 4. My style card (from onboarding answers)
  const answersBox = $("#profile-style-answers");
  if (answersBox) {
    let ob = null;
    try {
      const raw = localStorage.getItem("weari_onboarding_answers") || localStorage.getItem(PROFILE_KEY);
      if (raw) ob = JSON.parse(raw);
    } catch {}

    if (ob && (ob.goal || ob.styles || ob.occasions || ob.shopping || ob.closet || ob.pieces)) {
      const rows = [];
      if (ob.goal) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Style goal</span><span class="profile-style-val">${escapeHtml(ob.goal)}</span></div>`);
      if (ob.styles && ob.styles.length) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Vibe / Aesthetics</span><span class="profile-style-val">${escapeHtml(ob.styles.join(", "))}</span></div>`);
      if (ob.occasions && ob.occasions.length) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Frequent occasions</span><span class="profile-style-val">${escapeHtml(ob.occasions.join(", "))}</span></div>`);
      if (ob.shopping) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Shopping habit</span><span class="profile-style-val">${escapeHtml(ob.shopping)}</span></div>`);
      if (ob.closet) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Closet state</span><span class="profile-style-val">${escapeHtml(ob.closet)}</span></div>`);
      if (ob.pieces) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Current closet size</span><span class="profile-style-val">${escapeHtml(ob.pieces)}</span></div>`);
      answersBox.innerHTML = rows.join("");
    } else {
      answersBox.innerHTML = `
        <p style="font-size:12.5px; color:var(--muted); margin:0;">
          No style questionnaire answers recorded yet. Tap Edit to personalize your profile.
        </p>`;
    }
  }

  // 5. My impact row (4 metrics)
  const [items, outfits, requests] = await Promise.all([
    getAllItems(),
    getSavedOutfits(),
    getRequests(),
  ]);
  const purchasesAvoided = getPurchasesAvoidedCount();

  const impactPiecesEl = $("#profile-impact-pieces");
  const impactOutfitsEl = $("#profile-impact-outfits");
  const impactRequestsEl = $("#profile-impact-requests");
  const impactAvoidedEl = $("#profile-impact-avoided");

  if (impactPiecesEl) impactPiecesEl.textContent = items.length;
  if (impactOutfitsEl) impactOutfitsEl.textContent = outfits.length;
  if (impactRequestsEl) impactRequestsEl.textContent = requests.length;
  if (impactAvoidedEl) impactAvoidedEl.textContent = purchasesAvoided;

  // 6. Weari Plus waitlist state
  const isWaitlist = localStorage.getItem(WEARI_PLUS_WAITLIST_KEY) === "true";
  const btnWaitlist = $("#btn-join-waitlist");
  const waitlistConfirmed = $("#waitlist-confirmed");
  if (btnWaitlist && waitlistConfirmed) {
    btnWaitlist.hidden = isWaitlist;
    waitlistConfirmed.hidden = !isWaitlist;
  }
}

// Profile input listeners
$("#profile-first-name")?.addEventListener("input", (e) => {
  const val = e.target.value;
  try { localStorage.setItem(PROFILE_FIRST_NAME_KEY, val); } catch {}
  const initialEl = $("#profile-avatar-initial");
  if (initialEl) initialEl.textContent = (val.trim().charAt(0) || "W").toUpperCase();
});

$("#profile-email")?.addEventListener("input", (e) => {
  try { localStorage.setItem(PROFILE_EMAIL_KEY, e.target.value.trim()); } catch {}
});

$("#btn-join-waitlist")?.addEventListener("click", () => {
  try { localStorage.setItem(WEARI_PLUS_WAITLIST_KEY, "true"); } catch {}
  const btnWaitlist = $("#btn-join-waitlist");
  const waitlistConfirmed = $("#waitlist-confirmed");
  if (btnWaitlist) btnWaitlist.hidden = true;
  if (waitlistConfirmed) waitlistConfirmed.hidden = false;
  toast("You're on the list! We'll notify you when Weari Plus launches ✨");
});

$("#btn-edit-my-style")?.addEventListener("click", () => {
  openOnboarding(0);
});

$("#btn-profile-replay-ob")?.addEventListener("click", () => {
  openOnboarding(0);
});

// =====================================================
// PART 3: Favorites Section & Heart Buttons
// =====================================================
const FAVORITES_STORAGE_KEY = "weari_favorite_outfits";
let activeFavFilter = "all";
let pendingFavOutfit = null;

function getFavoriteOutfits() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY) || localStorage.getItem("weari-favorite-outfits");
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {}
  return [];
}

function saveFavoriteOutfits(list) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function isOutfitFavorite(outfitId) {
  if (!outfitId) return false;
  const list = getFavoriteOutfits();
  return list.some((f) => f.id === outfitId);
}

function toggleFavoriteOutfit(outfit) {
  if (!outfit) return;
  const list = getFavoriteOutfits();
  const existingIdx = list.findIndex((f) => f.id === outfit.id);
  if (existingIdx >= 0) {
    list.splice(existingIdx, 1);
    saveFavoriteOutfits(list);
    toast("Removed from favorites");
    renderSavedOutfits();
    renderFavorites(activeFavFilter);
    return false;
  } else {
    promptFavoriteOutfit(outfit);
    return true;
  }
}

// The label sheet either favorites an outfit or just labels a saved outfit
let labelSheetMode = "favorite";
let labelSheetSelected = "";

function promptFavoriteOutfit(outfit) {
  openOutfitLabelSheet(outfit, "favorite");
}

function openOutfitLabelSheet(outfit, mode) {
  pendingFavOutfit = outfit;
  labelSheetMode = mode;
  labelSheetSelected = outfit.label || "";
  const isFav = mode === "favorite";
  $("#fav-label-title").textContent = isFav ? "Favorite look ❤️" : "Label outfit";
  $("#fav-label-sub").textContent = isFav ? "Add an optional label to organize this outfit" : `Pick a label for "${outfit.name}"`;
  $("#btn-save-fav-label").textContent = isFav ? "Save favorite" : "Save label";
  $("#btn-skip-fav-label").textContent = isFav ? "Save without label" : "Remove label";
  renderFavLabelPresets();
  const sheet = $("#fav-label-sheet");
  const backdrop = $("#fav-label-backdrop");
  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function renderFavLabelPresets() {
  const box = $("#fav-label-presets");
  if (!box) return;
  box.innerHTML = labelChipsHtml({
    selected: labelSheetSelected,
    attr: "data-label-preset",
    chipClass: "fav-preset-chip",
    extra: labelSheetSelected ? [labelSheetSelected] : [],
  });
}

function closeFavLabelSheet() {
  const sheet = $("#fav-label-sheet");
  const backdrop = $("#fav-label-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  pendingFavOutfit = null;
}

$("#fav-label-close")?.addEventListener("click", closeFavLabelSheet);
$("#fav-label-backdrop")?.addEventListener("click", closeFavLabelSheet);

$("#fav-label-presets")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-label-manager]")) {
    openLabelManager();
    return;
  }
  const btn = e.target.closest("[data-label-preset]");
  if (!btn) return;
  const value = btn.dataset.labelPreset;
  labelSheetSelected = labelSheetSelected.toLowerCase() === value.toLowerCase() ? "" : value;
  renderFavLabelPresets();
});

function commitOutfitLabel(label) {
  if (!pendingFavOutfit) return;
  if (labelSheetMode === "saved") {
    const list = getSavedOutfits();
    const target = list.find((o) => o.id === pendingFavOutfit.id);
    if (target) target.label = label;
    saveSavedOutfits(list);
    closeFavLabelSheet();
    renderSavedOutfits();
    toast(label ? `Labeled ${labelDisplay(label)}` : "Label removed");
    return;
  }

  const list = getFavoriteOutfits();
  const idx = list.findIndex((f) => f.id === pendingFavOutfit.id);
  const favObj = {
    ...pendingFavOutfit,
    label,
    favoritedAt: Date.now(),
  };
  if (idx >= 0) {
    list[idx] = favObj;
  } else {
    list.unshift(favObj);
  }
  saveFavoriteOutfits(list);
  closeFavLabelSheet();
  renderSavedOutfits();
  renderFavorites(activeFavFilter);
  toast(`Saved to favorites ${label ? `(${labelDisplay(label)}) ` : ""}❤️`);
}

$("#btn-save-fav-label")?.addEventListener("click", () => commitOutfitLabel(labelSheetSelected));
$("#btn-skip-fav-label")?.addEventListener("click", () => commitOutfitLabel(""));

// Manual outfit builder favorite button
$("#btn-manual-fav")?.addEventListener("click", () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into slots before favoriting!");
    return;
  }
  const nameInput = $("#manual-outfit-name");
  const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Custom combination";
  const outfit = {
    id: "outfit_fav_" + Date.now(),
    name,
    occasion: "casual",
    createdAt: Date.now(),
    items: activePieces,
    label: manualLabel,
  };
  promptFavoriteOutfit(outfit);
});

// Render favorites section
function renderFavorites(filter = activeFavFilter) {
  activeFavFilter = filter;
  const container = $("#favorites-list");
  if (!container) return;

  const list = getFavoriteOutfits();

  // Filter chips: All, built-in, my labels, then any other label already on an outfit
  const chipsBox = $("#fav-label-filters");
  if (chipsBox) {
    chipsBox.innerHTML = labelChipsHtml({
      selected: filter,
      attr: "data-fav-filter",
      withAll: true,
      extra: list.map((f) => f.label),
    });
  }

  const filtered = list.filter((f) => {
    if (filter === "all") return true;
    return (f.label || "").toLowerCase() === filter.toLowerCase();
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:30px 10px; color:var(--muted);">
        <p style="font-size:14px; margin:0 0 10px;">No favorites saved${filter !== "all" ? ` under "${escapeHtml(labelDisplay(filter))}"` : ""} yet.</p>
        <small>Tap the heart on any saved outfit or styled look to add it here.</small>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (f, i) => `
    <article class="collage-tile-wrap fav-tile" data-fav-id="${f.id}">
      ${collageTileHtml((f.items || []).map((it) => it.photo), i)}
      <button type="button" class="fav-heart-btn active fav-tile-heart" data-unfav-id="${f.id}" title="Remove from favorites">♥</button>
      <h4 class="collage-name">${escapeHtml(f.name)}</h4>
      ${f.label ? `<span class="fav-card-label-tag">${escapeHtml(labelDisplay(f.label))}</span>` : ""}
      <div class="fav-tile-actions">
        <button type="button" class="fav-tile-action" data-wear-fav="${f.id}">✓ Wore it</button>
        <button type="button" class="fav-tile-action" data-edit-fav-label="${f.id}">Label</button>
      </div>
    </article>`
    )
    .join("");
}

// Favorites section click listener
$("#favorites-list")?.addEventListener("click", async (e) => {
  const unfavBtn = e.target.closest("[data-unfav-id]");
  if (unfavBtn) {
    const id = unfavBtn.dataset.unfavId;
    const list = getFavoriteOutfits().filter((f) => f.id !== id);
    saveFavoriteOutfits(list);
    renderFavorites(activeFavFilter);
    renderSavedOutfits();
    toast("Removed from favorites");
    return;
  }

  const editLabelBtn = e.target.closest("[data-edit-fav-label]");
  if (editLabelBtn) {
    const id = editLabelBtn.dataset.editFavLabel;
    const fav = getFavoriteOutfits().find((f) => f.id === id);
    if (fav) promptFavoriteOutfit(fav);
    return;
  }

  const wearBtn = e.target.closest("[data-wear-fav]");
  if (wearBtn) {
    const id = wearBtn.dataset.wearFav;
    const fav = getFavoriteOutfits().find((f) => f.id === id);
    if (!fav) return;

    const allItems = await getAllItems();
    const map = new Map(allItems.map((it) => [it.id, it]));
    const nowIso = new Date().toISOString();

    for (const piece of fav.items || []) {
      const it = map.get(piece.id);
      if (it) {
        it.wearCount = (it.wearCount || 0) + 1;
        it.lastWorn = nowIso;
        await saveItem(it);
      }
    }

    updateKarmaStreak();
    recordPurchaseAvoided(1);
    awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore favorite look");
    toast(`Logged wear for "${fav.name}" ✨`);
    renderWardrobe();
    renderInsights();
    return;
  }
});

// Favorites filter chips click listener
$("#fav-label-filters")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-label-manager]")) {
    openLabelManager();
    return;
  }
  const chip = e.target.closest("[data-fav-filter]");
  if (!chip) return;
  renderFavorites(chip.dataset.favFilter);
});

// =====================================================
// Custom labels (my own outfit categories with an emoji)
// Outfits keep storing the label name as a plain string, so built-in
// and older labels keep working unchanged.
// =====================================================
const LABEL_EMOJI_PICKS = ["🏋️", "🥂", "✈️", "☕", "🎉", "🌴", "💼", "🏡"];

function getCustomLabels() {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_LABELS_KEY) || "[]");
    if (Array.isArray(list)) return list.filter((l) => l && l.id && l.name);
  } catch {}
  return [];
}

function saveCustomLabels(list) {
  try {
    localStorage.setItem(CUSTOM_LABELS_KEY, JSON.stringify(list));
  } catch {}
}

function findCustomLabel(name) {
  const n = String(name || "").toLowerCase();
  return getCustomLabels().find((l) => l.name.toLowerCase() === n) || null;
}

function labelDisplay(name) {
  const custom = findCustomLabel(name);
  return custom && custom.emoji ? `${custom.emoji} ${custom.name}` : String(name || "");
}

// Chip row: [All] + built-in + my labels + other labels found on outfits + [+ New label]
function labelChipsHtml({ selected = "", attr, withAll = false, extra = [], chipClass = "chip" }) {
  const seen = new Set();
  const names = [];
  const add = (n) => {
    const v = String(n || "").trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      names.push(v);
    }
  };
  BUILTIN_LABELS.forEach(add);
  getCustomLabels().forEach((l) => add(l.name));
  extra.forEach(add);

  const sel = String(selected || "").toLowerCase();
  const chip = (value, text) =>
    `<button type="button" class="${chipClass} label-chip ${sel === value.toLowerCase() ? "selected" : ""}" ${attr}="${escapeHtml(value)}">${escapeHtml(text)}</button>`;

  return (
    (withAll ? chip("all", "All") : "") +
    names.map((n) => chip(n, labelDisplay(n))).join("") +
    `<button type="button" class="${chipClass} label-chip label-chip-new" data-open-label-manager>+ New label</button>`
  );
}

// ---------- Create your own: label for the outfit being built ----------
function renderManualLabelChips() {
  const box = $("#manual-label-chips");
  if (!box) return;
  box.innerHTML = labelChipsHtml({
    selected: manualLabel,
    attr: "data-manual-label",
    extra: manualLabel ? [manualLabel] : [],
  });
}

$("#manual-label-chips")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-label-manager]")) {
    openLabelManager();
    return;
  }
  const chip = e.target.closest("[data-manual-label]");
  if (!chip) return;
  const value = chip.dataset.manualLabel;
  manualLabel = manualLabel.toLowerCase() === value.toLowerCase() ? "" : value;
  renderManualLabelChips();
});

// ---------- Stylist: label for the suggested look ----------
function renderStylistLabelChips() {
  const box = $("#stylist-label-chips");
  if (!box) return;
  box.innerHTML = labelChipsHtml({
    selected: stylistLabel,
    attr: "data-stylist-label",
    extra: stylistLabel ? [stylistLabel] : [],
  });
}

// Re-render everything that shows labels
function refreshLabelViews() {
  renderManualLabelChips();
  renderStylistLabelChips();
  renderSavedOutfits();
  renderFavorites(activeFavFilter);
  if (!$("#fav-label-sheet")?.hidden) renderFavLabelPresets();
  renderLabelManager();
}

// Rename or clear a label on every stored outfit (saved, favorites, weekly plan)
function relabelOutfits(oldName, newName) {
  const match = (o) => o && (o.label || "").toLowerCase() === oldName.toLowerCase();
  let count = 0;

  // Only write a list back when one of its outfits actually changed
  const update = (list) => {
    let changed = 0;
    list.forEach((o) => { if (match(o)) { o.label = newName; changed++; } });
    return changed;
  };

  const saved = getSavedOutfits();
  const savedChanged = update(saved);
  if (savedChanged) saveSavedOutfits(saved);

  const favs = getFavoriteOutfits();
  const favsChanged = update(favs);
  if (favsChanged) saveFavoriteOutfits(favs);
  count = savedChanged + favsChanged;

  const plan = getWeeklyPlan();
  if (update(Object.values(plan))) saveWeeklyPlan(plan);

  if (activeFavFilter.toLowerCase() === oldName.toLowerCase()) activeFavFilter = newName || "all";
  if (activeSavedFilter.toLowerCase() === oldName.toLowerCase()) activeSavedFilter = newName || "all";
  if (manualLabel.toLowerCase() === oldName.toLowerCase()) manualLabel = newName;
  if (stylistLabel.toLowerCase() === oldName.toLowerCase()) stylistLabel = newName;
  if (labelSheetSelected.toLowerCase() === oldName.toLowerCase()) labelSheetSelected = newName;
  return count;
}

function countOutfitsWithLabel(name) {
  const n = name.toLowerCase();
  return [...getSavedOutfits(), ...getFavoriteOutfits()].filter((o) => (o.label || "").toLowerCase() === n).length;
}

// ---------- Label manager sheet ----------
let labelRenamingId = null;
let labelConfirmAction = null;

function openLabelManager() {
  resetLabelForm();
  hideLabelConfirm();
  renderLabelManager();
  $("#label-manager-sheet").hidden = false;
  $("#label-manager-backdrop").hidden = false;
  $("#label-name-input")?.focus();
}

function closeLabelManager() {
  $("#label-manager-sheet").hidden = true;
  $("#label-manager-backdrop").hidden = true;
  resetLabelForm();
  hideLabelConfirm();
}

function renderLabelManager() {
  const picks = $("#label-emoji-picks");
  if (picks && !picks.childElementCount) {
    picks.innerHTML = LABEL_EMOJI_PICKS.map((em) => `<button type="button" class="label-emoji-pick" data-emoji-pick="${em}">${em}</button>`).join("");
  }
  const listEl = $("#label-list");
  if (!listEl) return;
  const labels = getCustomLabels();
  listEl.innerHTML = labels.length
    ? `<span class="field-label">My labels</span>` +
      labels.map((l) => `
        <div class="label-row">
          <span class="label-row-name">${escapeHtml(l.emoji || "🏷️")} ${escapeHtml(l.name)}</span>
          <button type="button" class="btn-link-action" data-label-rename="${l.id}">Rename</button>
          <button type="button" class="btn-danger-link" data-label-delete="${l.id}">Delete</button>
        </div>`).join("")
    : `<p class="label-empty">No labels of your own yet. Built-in labels: ${BUILTIN_LABELS.join(", ")}.</p>`;
}

function resetLabelForm() {
  labelRenamingId = null;
  $("#label-emoji-input").value = "";
  $("#label-name-input").value = "";
  $("#label-form-title").textContent = "New label";
  $("#label-form-submit").textContent = "Add label";
  $("#label-form-cancel").hidden = true;
  showLabelError("");
}

function showLabelError(msg) {
  const el = $("#label-form-error");
  el.textContent = msg;
  el.hidden = !msg;
}

function showLabelConfirm(text, okText, action) {
  labelConfirmAction = action;
  $("#label-confirm-text").textContent = text;
  $("#label-confirm-ok").textContent = okText;
  $("#label-confirm").hidden = false;
}

function hideLabelConfirm() {
  labelConfirmAction = null;
  $("#label-confirm").hidden = true;
}

$("#label-manager-close")?.addEventListener("click", closeLabelManager);
$("#label-manager-backdrop")?.addEventListener("click", closeLabelManager);
$("#label-form-cancel")?.addEventListener("click", resetLabelForm);
$("#label-confirm-cancel")?.addEventListener("click", hideLabelConfirm);
$("#label-confirm-ok")?.addEventListener("click", () => {
  const action = labelConfirmAction;
  hideLabelConfirm();
  if (action) action();
});

$("#label-emoji-picks")?.addEventListener("click", (e) => {
  const pick = e.target.closest("[data-emoji-pick]");
  if (pick) $("#label-emoji-input").value = pick.dataset.emojiPick;
});

$("#label-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#label-name-input").value.trim().replace(/\s+/g, " ");
  const emoji = $("#label-emoji-input").value.trim() || "🏷️";
  if (!name) return showLabelError("Give your label a short name.");
  if (name.toLowerCase() === "all") return showLabelError("Pick a different name.");

  const labels = getCustomLabels();
  const clash =
    BUILTIN_LABELS.some((b) => b.toLowerCase() === name.toLowerCase()) ||
    labels.some((l) => l.id !== labelRenamingId && l.name.toLowerCase() === name.toLowerCase());
  if (clash) return showLabelError(`You already have a "${name}" label.`);
  showLabelError("");

  if (!labelRenamingId) {
    labels.push({ id: "label_" + Date.now(), name, emoji, createdAt: Date.now() });
    saveCustomLabels(labels);
    resetLabelForm();
    refreshLabelViews();
    toast(`Added label ${emoji} ${name}`);
    return;
  }

  const target = labels.find((l) => l.id === labelRenamingId);
  if (!target) return resetLabelForm();
  const oldName = target.name;
  const used = countOutfitsWithLabel(oldName);
  showLabelConfirm(
    `Rename "${target.emoji} ${oldName}" to "${emoji} ${name}"?${used ? ` ${used} outfit${used === 1 ? "" : "s"} will move to the new name.` : ""}`,
    "Rename",
    () => {
      const fresh = getCustomLabels();
      const t = fresh.find((l) => l.id === target.id);
      if (!t) return;
      t.name = name;
      t.emoji = emoji;
      saveCustomLabels(fresh);
      if (oldName !== name) relabelOutfits(oldName, name);
      resetLabelForm();
      refreshLabelViews();
      toast(`Renamed to ${emoji} ${name}`);
    }
  );
});

$("#label-list")?.addEventListener("click", (e) => {
  const renameBtn = e.target.closest("[data-label-rename]");
  if (renameBtn) {
    const l = getCustomLabels().find((x) => x.id === renameBtn.dataset.labelRename);
    if (!l) return;
    hideLabelConfirm();
    labelRenamingId = l.id;
    $("#label-emoji-input").value = l.emoji || "";
    $("#label-name-input").value = l.name;
    $("#label-form-title").textContent = `Rename ${l.name}`;
    $("#label-form-submit").textContent = "Save name";
    $("#label-form-cancel").hidden = false;
    showLabelError("");
    $("#label-name-input").focus();
    return;
  }

  const deleteBtn = e.target.closest("[data-label-delete]");
  if (deleteBtn) {
    const l = getCustomLabels().find((x) => x.id === deleteBtn.dataset.labelDelete);
    if (!l) return;
    const used = countOutfitsWithLabel(l.name);
    showLabelConfirm(
      `Delete "${l.emoji} ${l.name}"?${used ? ` ${used} outfit${used === 1 ? "" : "s"} will lose this label (the outfits stay).` : ""}`,
      "Delete",
      () => {
        saveCustomLabels(getCustomLabels().filter((x) => x.id !== l.id));
        relabelOutfits(l.name, "");
        if (labelRenamingId === l.id) resetLabelForm();
        refreshLabelViews();
        toast(`Deleted label ${l.name}`);
      }
    );
  }
});

// =====================================================
// PART 4: Weekly Plan Logic
// =====================================================
const WEEKLY_PLAN_KEY = "weari_weekly_plan";
const PLAN_REPEAT_KEY = "weari_plan_repeat_weekly";

const PLAN_DAYS = [
  { key: "mon", name: "Monday" },
  { key: "tue", name: "Tuesday" },
  { key: "wed", name: "Wednesday" },
  { key: "thu", name: "Thursday" },
  { key: "fri", name: "Friday" },
  { key: "sat", name: "Saturday" },
  { key: "sun", name: "Sunday" },
];

function getWeeklyPlan() {
  try {
    const raw = localStorage.getItem(WEEKLY_PLAN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveWeeklyPlan(plan) {
  try {
    localStorage.setItem(WEEKLY_PLAN_KEY, JSON.stringify(plan));
  } catch {}
}

function isPlanRepeatWeekly() {
  try {
    return localStorage.getItem(PLAN_REPEAT_KEY) === "true";
  } catch {
    return false;
  }
}

// Week / Month view of the plan (kept in memory only, no storage key)
let planView = "week";
let planMonthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let openPlanDay = null; // { key, date } while the day sheet is open

const PLAN_KEY_BY_JS_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function planLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Monday of the week containing `d`, at local midnight
function planWeekStart(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

// A date shows its weekday's outfit if it falls in this week, or any week when repeating
function planDateIsPlannable(date) {
  if (isPlanRepeatWeekly()) return true;
  const start = planWeekStart(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

function planThumbHtml(outfit) {
  const items = (outfit.items || []).slice(0, 4);
  if (!items.length) return "";
  if (items.length === 1) {
    return `<img class="plan-cell-img" src="${items[0].photo}" alt="${describe(items[0])}" />`;
  }
  return `<div class="plan-cell-collage">${items.map((it) => `<img src="${it.photo}" alt="" />`).join("")}</div>`;
}

function renderWeeklyPlan() {
  const strip = $("#plan-days-strip");
  if (!strip) return;

  const plan = getWeeklyPlan();
  const isRepeat = isPlanRepeatWeekly();
  const repeatCheckbox = $("#plan-repeat-checkbox");
  if (repeatCheckbox) repeatCheckbox.checked = isRepeat;

  document.querySelectorAll("#plan-view-toggle [data-plan-view]").forEach((b) => b.classList.toggle("active", b.dataset.planView === planView));
  const monthNav = $("#plan-month-nav");
  if (monthNav) monthNav.hidden = planView !== "month";

  const today = new Date();
  const currentTodayKey = PLAN_KEY_BY_JS_DAY[today.getDay()];
  const todayDateStr = today.toISOString().slice(0, 10);

  if (planView === "week") {
    strip.className = "plan-days-strip plan-week-grid";
    const weekStart = planWeekStart(today);
    strip.innerHTML = PLAN_DAYS.map((day, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const assigned = plan[day.key] || null;
      const isToday = day.key === currentTodayKey;
      const isWornToday = assigned && assigned.lastWornDate === todayDateStr;
      return `
        <button type="button" class="plan-cell ${isToday ? "today" : ""} ${isWornToday ? "worn" : ""}"
          data-plan-open-day="${day.key}" data-plan-open-date="${planLocalDateStr(date)}"
          aria-label="${day.name}${assigned ? `: ${escapeHtml(assigned.name)}` : ", nothing planned"}">
          <span class="plan-cell-letter">${day.name[0]}</span>
          <span class="plan-cell-date">${date.getDate()}</span>
          <span class="plan-cell-thumb collage-${COLLAGE_COLORS[i % COLLAGE_COLORS.length]}">${assigned ? planThumbHtml(assigned) : `<span class="plan-cell-empty">+</span>`}</span>
          ${isWornToday ? `<span class="plan-cell-worn">✓</span>` : ""}
        </button>`;
    }).join("");
  } else {
    strip.className = "plan-days-strip plan-month-grid";
    const label = $("#plan-month-label");
    if (label) label.textContent = planMonthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const year = planMonthCursor.getFullYear();
    const month = planMonthCursor.getMonth();
    const leading = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = planLocalDateStr(today);

    let html = PLAN_DAYS.map((d) => `<span class="plan-month-head">${d.name[0]}</span>`).join("");
    for (let i = 0; i < leading; i++) html += `<span class="plan-month-blank"></span>`;
    for (let n = 1; n <= daysInMonth; n++) {
      const date = new Date(year, month, n);
      const key = PLAN_KEY_BY_JS_DAY[date.getDay()];
      const dateStr = planLocalDateStr(date);
      const hasPlan = Boolean(plan[key]) && planDateIsPlannable(date);
      html += `
        <button type="button" class="plan-month-day ${dateStr === todayStr ? "today" : ""}"
          data-plan-open-day="${key}" data-plan-open-date="${dateStr}">
          <span>${n}</span>
          ${hasPlan ? `<span class="plan-month-dot" aria-label="Outfit planned"></span>` : ""}
        </button>`;
    }
    strip.innerHTML = html;
  }

  if (openPlanDay) renderPlanDaySheet();
}

function renderPlanDaySheet() {
  const body = $("#plan-day-body");
  if (!body || !openPlanDay) return;
  const { key, date } = openPlanDay;
  const [y, m, d] = date.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const day = PLAN_DAYS.find((x) => x.key === key);
  const plan = getWeeklyPlan();
  const assigned = plan[key] || null;
  const plannable = planDateIsPlannable(dateObj);
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const isWornToday = assigned && assigned.lastWornDate === todayDateStr;

  const title = $("#plan-day-title");
  if (title) title.textContent = day ? day.name : "Day";
  const sub = $("#plan-day-sub");
  if (sub) sub.textContent = dateObj.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  if (!plannable) {
    body.innerHTML = `
      <p class="plan-day-note">Your plan covers this week only. Turn on <strong>Repeat weekly</strong> to plan outfits for this day.</p>`;
    return;
  }

  body.innerHTML = assigned
    ? `
      <div class="plan-assigned-box">
        <div class="plan-assigned-title">${escapeHtml(assigned.name)} ${isWornToday ? `<span class="plan-day-worn-tag">✓ Worn</span>` : ""}</div>
        <div class="plan-assigned-strip">
          ${(assigned.items || []).map((it) => `<img class="plan-assigned-img" src="${it.photo}" alt="${describe(it)}" title="${describe(it)}" />`).join("")}
        </div>
      </div>
      <div class="plan-day-actions">
        <button type="button" class="btn-primary" data-plan-wear="${key}">
          ${isWornToday ? "✓ Worn today" : "Mark as worn"}
        </button>
        <div class="plan-day-actions-row">
          <button type="button" class="btn-link-action" style="flex:1;" data-plan-move="${key}">Move</button>
          <button type="button" class="btn-danger-link" style="flex:1;" data-plan-clear="${key}">Clear</button>
        </div>
      </div>`
    : `
      <button type="button" class="plan-empty-slot" data-plan-assign-day="${key}">
        <span style="font-size:24px; line-height:1; color:var(--muted);">+</span>
        <strong style="font-size:13.5px; color:var(--text);">Assign outfit</strong>
        <small style="font-size:11.5px; color:var(--muted);">Choose from saved</small>
      </button>`;
}

function openPlanDaySheet(key, date) {
  openPlanDay = { key, date };
  renderPlanDaySheet();
  $("#plan-day-sheet").hidden = false;
  $("#plan-day-backdrop").hidden = false;
}

function closePlanDaySheet() {
  openPlanDay = null;
  $("#plan-day-sheet").hidden = true;
  $("#plan-day-backdrop").hidden = true;
}

$("#plan-day-close")?.addEventListener("click", closePlanDaySheet);
$("#plan-day-backdrop")?.addEventListener("click", closePlanDaySheet);

$("#plan-view-toggle")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-plan-view]");
  if (!btn || btn.dataset.planView === planView) return;
  planView = btn.dataset.planView;
  if (planView === "month") planMonthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  renderWeeklyPlan();
});

$("#plan-month-nav")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-plan-month-step]");
  if (!btn) return;
  planMonthCursor = new Date(planMonthCursor.getFullYear(), planMonthCursor.getMonth() + Number(btn.dataset.planMonthStep), 1);
  renderWeeklyPlan();
});

// Plan repeat weekly checkbox change listener
$("#plan-repeat-checkbox")?.addEventListener("change", (e) => {
  try {
    localStorage.setItem(PLAN_REPEAT_KEY, String(e.target.checked));
  } catch {}
  toast(e.target.checked ? "Plan set to repeat weekly 🔁" : "Repeat weekly disabled");
  renderWeeklyPlan();
});

// Plan days strip click delegation
let pendingPlanDayKey = null;

async function handlePlanClick(e) {
  const openBtn = e.target.closest("[data-plan-open-day]");
  if (openBtn) {
    openPlanDaySheet(openBtn.dataset.planOpenDay, openBtn.dataset.planOpenDate);
    return;
  }

  const assignBtn = e.target.closest("[data-plan-assign-day]");
  if (assignBtn) {
    const dayKey = assignBtn.dataset.planAssignDay;
    closePlanDaySheet();
    openPlanPicker(dayKey);
    return;
  }

  const clearBtn = e.target.closest("[data-plan-clear]");
  if (clearBtn) {
    const dayKey = clearBtn.dataset.planClear;
    const plan = getWeeklyPlan();
    delete plan[dayKey];
    saveWeeklyPlan(plan);
    renderWeeklyPlan();
    toast("Outfit cleared from day");
    return;
  }

  const moveBtn = e.target.closest("[data-plan-move]");
  if (moveBtn) {
    const dayKey = moveBtn.dataset.planMove;
    closePlanDaySheet();
    openPlanMoveSheet(dayKey);
    return;
  }

  const wearBtn = e.target.closest("[data-plan-wear]");
  if (wearBtn) {
    const dayKey = wearBtn.dataset.planWear;
    const plan = getWeeklyPlan();
    const outfit = plan[dayKey];
    if (!outfit) return;

    const allItems = await getAllItems();
    const map = new Map(allItems.map((it) => [it.id, it]));
    const nowIso = new Date().toISOString();

    for (const piece of outfit.items || []) {
      const it = map.get(piece.id);
      if (it) {
        it.wearCount = (it.wearCount || 0) + 1;
        it.lastWorn = nowIso;
        await saveItem(it);
      }
    }

    outfit.lastWornDate = new Date().toISOString().slice(0, 10);
    saveWeeklyPlan(plan);
    updateKarmaStreak();
    recordPurchaseAvoided(1);
    awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Wore planned outfit");
    toast(`Logged wear for planned outfit ✨`);
    renderWeeklyPlan();
    renderWardrobe();
    renderInsights();
    return;
  }
}

$("#plan-days-strip")?.addEventListener("click", handlePlanClick);
$("#plan-day-body")?.addEventListener("click", handlePlanClick);

function openPlanPicker(dayKey) {
  pendingPlanDayKey = dayKey;
  const day = PLAN_DAYS.find((d) => d.key === dayKey);
  const titleEl = $("#plan-picker-title");
  if (titleEl && day) titleEl.textContent = `Assign to ${day.name}`;

  const container = $("#plan-picker-list");
  const saved = getSavedOutfits();
  const favs = getFavoriteOutfits();

  // Combine unique looks
  const combinedMap = new Map();
  for (const f of favs) combinedMap.set(f.id, f);
  for (const s of saved) if (!combinedMap.has(s.id)) combinedMap.set(s.id, s);
  const allLooks = Array.from(combinedMap.values());

  if (container) {
    if (allLooks.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:24px 10px; color:var(--muted);">
          <p style="margin:0 0 10px; font-size:14px;">No saved or favorite outfits found yet.</p>
          <small>Create an outfit in "Create" or "AI Stylist" first, then assign it here.</small>
        </div>`;
    } else {
      container.innerHTML = allLooks.map((look) => `
        <div class="plan-picker-card" data-pick-look-id="${look.id}">
          <div class="plan-picker-info">
            <span class="plan-picker-name">${escapeHtml(look.name)}</span>
            <small style="color:var(--muted); font-size:11.5px;">${(look.items || []).length} pieces ${look.label ? `· ${look.label}` : ""}</small>
          </div>
          <div class="plan-picker-strip">
            ${(look.items || []).slice(0, 4).map((it) => `<img class="plan-picker-thumb" src="${it.photo}" alt="" />`).join("")}
          </div>
        </div>`).join("");
    }
  }

  const sheet = $("#plan-picker-sheet");
  const backdrop = $("#plan-picker-backdrop");
  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function closePlanPicker() {
  const sheet = $("#plan-picker-sheet");
  const backdrop = $("#plan-picker-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  pendingPlanDayKey = null;
}

$("#plan-picker-close")?.addEventListener("click", closePlanPicker);
$("#plan-picker-backdrop")?.addEventListener("click", closePlanPicker);
$("#plan-picker-cancel")?.addEventListener("click", closePlanPicker);

$("#plan-picker-list")?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-pick-look-id]");
  if (!card || !pendingPlanDayKey) return;
  const lookId = card.dataset.pickLookId;

  const saved = getSavedOutfits();
  const favs = getFavoriteOutfits();
  const look = favs.find((f) => f.id === lookId) || saved.find((s) => s.id === lookId);
  if (!look) return;

  const plan = getWeeklyPlan();
  plan[pendingPlanDayKey] = {
    id: look.id,
    name: look.name,
    items: look.items,
    label: look.label || "",
  };
  saveWeeklyPlan(plan);
  const day = PLAN_DAYS.find((d) => d.key === pendingPlanDayKey);
  closePlanPicker();
  renderWeeklyPlan();
  toast(`Assigned to ${day ? day.name : "day"} ✨`);
});

// Move outfit to another day sheet logic
let pendingMoveSourceDayKey = null;

function openPlanMoveSheet(dayKey) {
  pendingMoveSourceDayKey = dayKey;
  const plan = getWeeklyPlan();
  const currentOutfit = plan[dayKey];
  if (!currentOutfit) return;

  const titleEl = $("#plan-move-title");
  if (titleEl) titleEl.textContent = `Move "${currentOutfit.name}"`;

  const container = $("#plan-move-days-list");
  if (container) {
    container.innerHTML = PLAN_DAYS.filter((d) => d.key !== dayKey)
      .map((d) => {
        const hasExisting = Boolean(plan[d.key]);
        return `
          <button type="button" class="plan-move-day-btn" data-target-move-day="${d.key}">
            <span>${d.name}</span>
            <span class="plan-move-day-tag">${hasExisting ? `(swaps with ${escapeHtml(plan[d.key].name)})` : "Empty slot"}</span>
          </button>
        `;
      })
      .join("");
  }

  const sheet = $("#plan-move-sheet");
  const backdrop = $("#plan-move-backdrop");
  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function closePlanMoveSheet() {
  const sheet = $("#plan-move-sheet");
  const backdrop = $("#plan-move-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  pendingMoveSourceDayKey = null;
}

$("#plan-move-close")?.addEventListener("click", closePlanMoveSheet);
$("#plan-move-backdrop")?.addEventListener("click", closePlanMoveSheet);
$("#plan-move-cancel")?.addEventListener("click", closePlanMoveSheet);

$("#plan-move-days-list")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-target-move-day]");
  if (!btn || !pendingMoveSourceDayKey) return;
  const targetDayKey = btn.dataset.targetMoveDay;
  const plan = getWeeklyPlan();
  const movingOutfit = plan[pendingMoveSourceDayKey];
  if (!movingOutfit) return;

  const targetDayObj = PLAN_DAYS.find((d) => d.key === targetDayKey);
  const existingInTarget = plan[targetDayKey] || null;

  plan[targetDayKey] = movingOutfit;
  if (existingInTarget) {
    plan[pendingMoveSourceDayKey] = existingInTarget;
  } else {
    delete plan[pendingMoveSourceDayKey];
  }

  saveWeeklyPlan(plan);
  closePlanMoveSheet();
  renderWeeklyPlan();
  toast(`Outfit moved to ${targetDayObj ? targetDayObj.name : "day"} ✨`);
});

// =====================================================
// Optional Google sign-in (Firebase Auth, loaded as a module in index.html)
// Guest mode is the default and keeps working without it. Signing in only
// fills the profile name, email and photo; the wardrobe stays in this browser.
// =====================================================
let authUser = null; // { uid, displayName, email, photoURL } while signed in
let guestChosen = false; // "Continue as guest" tapped during this visit
const AUTH_GUEST_MSG = "You're still in guest mode.";

function readStoredProfile() {
  try {
    const data = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

// Merge into weari_user_profile without touching its other fields
function mergeStoredProfile(fields) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...readStoredProfile(), ...fields }));
  } catch {}
}

function saveGoogleProfile(user) {
  const firstName = (user.displayName || "").trim().split(/\s+/)[0];
  try {
    if (firstName) localStorage.setItem(PROFILE_FIRST_NAME_KEY, firstName);
    if (user.email) localStorage.setItem(PROFILE_EMAIL_KEY, user.email);
  } catch {}
  mergeStoredProfile({
    account: {
      provider: "google",
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      signedInAt: Date.now(),
    },
  });
}

function renderAuthBlocks() {
  document.querySelectorAll("[data-auth-block]").forEach((block) => {
    const signedIn = Boolean(authUser);
    block.querySelector("[data-auth-guest]").hidden = signedIn;
    block.querySelector("[data-auth-signed]").hidden = !signedIn;
    // The Closet prompt steps aside once someone picks guest mode
    if (block.dataset.authBlock === "prompt") block.hidden = guestChosen && !signedIn;
    if (signedIn) {
      block.querySelector("[data-auth-name]").textContent = authUser.displayName || authUser.email || "Google user";
      const photo = block.querySelector("[data-auth-photo]");
      photo.hidden = !authUser.photoURL;
      if (authUser.photoURL) photo.src = authUser.photoURL;
    }
  });

  // Profile avatar: Google photo while signed in, otherwise the initial
  const avatar = $("#profile-avatar");
  if (avatar) {
    let img = avatar.querySelector(".profile-avatar-photo");
    if (authUser && authUser.photoURL) {
      if (!img) {
        img = document.createElement("img");
        img.className = "profile-avatar-photo";
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        avatar.appendChild(img);
      }
      img.src = authUser.photoURL;
      img.hidden = false;
    } else if (img) {
      img.hidden = true;
    }
  }
}

function showAuthMessage(button, text) {
  const msg = button.closest("[data-auth-block]")?.querySelector("[data-auth-msg]");
  if (!msg) return toast(text);
  msg.textContent = text;
  msg.hidden = false;
}

async function startGoogleSignIn(button) {
  if (!window.WeariAuth) {
    showAuthMessage(button, `Google sign-in isn't available right now. ${AUTH_GUEST_MSG}`);
    return;
  }
  const label = button.querySelector("span");
  const original = label ? label.textContent : "";
  button.disabled = true;
  if (label) label.textContent = "Opening Google…";
  try {
    const user = await window.WeariAuth.signIn();
    if (!user) throw new Error("No user returned");
    authUser = user;
    guestChosen = false;
    saveGoogleProfile(user);
    renderAuthBlocks();
    if (!$("#screen-profile").hidden) renderProfileScreen();
    toast(`Signed in as ${user.displayName || user.email} ✨`);
  } catch (err) {
    const code = String((err && err.code) || "");
    const cancelled = code.includes("popup-closed") || code.includes("cancelled-popup");
    const blocked = code.includes("popup-blocked");
    showAuthMessage(
      button,
      cancelled
        ? `Sign-in was cancelled. ${AUTH_GUEST_MSG}`
        : blocked
        ? `Your browser blocked the Google popup. ${AUTH_GUEST_MSG}`
        : `Couldn't sign in with Google. ${AUTH_GUEST_MSG}`
    );
  } finally {
    button.disabled = false;
    if (label) label.textContent = original;
  }
}

async function startGoogleSignOut() {
  try {
    if (window.WeariAuth) await window.WeariAuth.signOut();
  } catch (err) {
    console.warn("Sign-out failed:", err && err.message);
  }
  // Back to guest mode: only the account details go; wardrobe, name and email stay
  authUser = null;
  const profile = readStoredProfile();
  if (profile.account) {
    delete profile.account;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}
  }
  renderAuthBlocks();
  if (!$("#screen-profile").hidden) renderProfileScreen();
  toast("Signed out. You're in guest mode.");
}

document.addEventListener("click", (e) => {
  const signIn = e.target.closest("[data-google-signin]");
  if (signIn) return startGoogleSignIn(signIn);
  if (e.target.closest("[data-google-signout]")) return startGoogleSignOut();
  const guest = e.target.closest("[data-continue-guest]");
  if (guest) {
    guestChosen = true;
    renderAuthBlocks();
    showAuthMessage(guest, "You're using Weari as a guest. Your wardrobe stays on this device.");
  }
});

// Firebase reports the signed-in user on load and after sign-in or sign-out
window.addEventListener("weari-auth", (e) => {
  authUser = e.detail || null;
  renderAuthBlocks();
  if (!$("#screen-profile").hidden) renderProfileScreen();
});

// =====================================================
// Friends: invite codes, friend feed, borrowing and swap requests (Firestore)
// Only for signed-in users. Guests never load or call Firestore.
// Only listings the user switches to "Share with friends" leave this browser.
//   users/{uid}            displayName, photoURL, inviteCode, createdAt
//   inviteCodes/{code}     uid, displayName, photoURL (lets a friend find you by code)
//   friendships/{a_b}      members [a, b] (sorted), status, requestedBy, profiles {uid: {displayName, photoURL}}
//   listings/{uid_key}     ownerUid, title, description, category, color, thumbnail, type, sharedWithFriends, status, createdAt
//   requests/{id}          listingId, ownerUid, requesterUid, type, status, messages [{from, text, at}], plus names and title for display
// =====================================================
const FRIEND_SHARES_KEY = "weari_friend_shares"; // { shareKey: firestore listing id } for the share switches
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
const THUMB_MAX_PX = 600;
const THUMB_MAX_CHARS = 150 * 1024;
const pendingInviteCode = (new URLSearchParams(location.search).get("invite") || "").toUpperCase().slice(0, 6);

let friendsTab = "feed";
let myInviteCode = "";
let friendsCache = []; // [{ id, other, status, requestedBy, profile }]
let friendFeedCache = [];
let friendRequestsCache = [];
let openThreadId = null;

function socialUid() {
  return authUser ? authUser.uid : null;
}

async function getFirestore() {
  if (!socialUid() || !window.WeariAuth || !window.WeariAuth.loadFirestore) throw new Error("signed_out");
  return window.WeariAuth.loadFirestore();
}

function friendshipId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function myPublicProfile() {
  return { displayName: (authUser && authUser.displayName) || "Weari friend", photoURL: (authUser && authUser.photoURL) || "" };
}

function getFriendShares() {
  try {
    const data = JSON.parse(localStorage.getItem(FRIEND_SHARES_KEY) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveFriendShares(map) {
  try {
    localStorage.setItem(FRIEND_SHARES_KEY, JSON.stringify(map));
  } catch {}
}

function safeThumb(listing) {
  const t = String(listing.thumbnail || "");
  return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(t) ? t : placeholderImage(listing.category, listing.color, placeholderKind(listing));
}

function setFriendsStatus(text) {
  const el = $("#friends-status");
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
}

// JPEG thumbnail, at most 600px on the long side and under 150KB
function compressThumbnail(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const nw = img.naturalWidth || THUMB_MAX_PX;
        const nh = img.naturalHeight || THUMB_MAX_PX;
        const scale = Math.min(1, THUMB_MAX_PX / Math.max(nw, nh));
        let w = Math.max(1, Math.round(nw * scale));
        let h = Math.max(1, Math.round(nh * scale));
        let quality = 0.82;
        const canvas = document.createElement("canvas");
        for (let i = 0; i < 10; i++) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff"; // JPEG has no transparency
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const url = canvas.toDataURL("image/jpeg", quality);
          if (url.length <= THUMB_MAX_CHARS) return resolve(url);
          if (quality > 0.5) quality -= 0.12;
          else {
            w = Math.round(w * 0.8);
            h = Math.round(h * 0.8);
          }
        }
        reject(new Error("Photo is too large to share"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Couldn't read the photo"));
    img.src = src;
  });
}

// ---------- My user doc and invite code ----------
function randomInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

async function ensureMyUserDoc() {
  const { fs, db } = await getFirestore();
  const uid = socialUid();
  const me = myPublicProfile();
  const userRef = fs.doc(db, "users", uid);
  const snap = await fs.getDoc(userRef);
  let code = snap.exists() ? snap.data().inviteCode : "";

  if (!code) {
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = randomInviteCode();
      const codeRef = fs.doc(db, "inviteCodes", candidate);
      if ((await fs.getDoc(codeRef)).exists()) continue;
      await fs.setDoc(codeRef, { uid, ...me, createdAt: fs.serverTimestamp() });
      code = candidate;
    }
    if (!code) throw new Error("Couldn't make an invite code, please try again");
    await fs.setDoc(userRef, { ...me, inviteCode: code, createdAt: fs.serverTimestamp() }, { merge: true });
  } else {
    await fs.setDoc(userRef, me, { merge: true });
  }
  myInviteCode = code;
  return code;
}

// ---------- Friendships ----------
async function loadFriendships() {
  const { fs, db } = await getFirestore();
  const uid = socialUid();
  const snap = await fs.getDocs(fs.query(fs.collection(db, "friendships"), fs.where("members", "array-contains", uid)));
  friendsCache = snap.docs.map((d) => {
    const data = d.data();
    const other = (data.members || []).find((m) => m !== uid) || "";
    return {
      id: d.id,
      other,
      status: data.status,
      requestedBy: data.requestedBy,
      profile: (data.profiles && data.profiles[other]) || { displayName: "Friend", photoURL: "" },
    };
  });
  return friendsCache;
}

async function addFriendByCode(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Codes are 6 letters and numbers");
  const { fs, db } = await getFirestore();
  const uid = socialUid();
  const codeSnap = await fs.getDoc(fs.doc(db, "inviteCodes", code));
  if (!codeSnap.exists()) throw new Error("No one has that code yet");
  const friend = codeSnap.data();
  if (friend.uid === uid) throw new Error("That's your own code");

  const ref = fs.doc(db, "friendships", friendshipId(uid, friend.uid));
  const existing = await fs.getDoc(ref);
  if (existing.exists()) {
    const data = existing.data();
    if (data.status === "accepted") return `You're already friends with ${friend.displayName}`;
    if (data.requestedBy === uid) return `Request already sent to ${friend.displayName}`;
    await acceptFriendship(existing.id);
    return `You're now friends with ${friend.displayName} 🎉`;
  }
  await fs.setDoc(ref, {
    members: [uid, friend.uid].sort(),
    status: "pending",
    requestedBy: uid,
    profiles: {
      [uid]: myPublicProfile(),
      [friend.uid]: { displayName: friend.displayName || "Friend", photoURL: friend.photoURL || "" },
    },
    createdAt: fs.serverTimestamp(),
  });
  return `Friend request sent to ${friend.displayName}`;
}

async function acceptFriendship(id) {
  const { fs, db } = await getFirestore();
  await fs.updateDoc(fs.doc(db, "friendships", id), {
    status: "accepted",
    [`profiles.${socialUid()}`]: myPublicProfile(),
    acceptedAt: fs.serverTimestamp(),
  });
}

async function declineFriendship(id) {
  const { fs, db } = await getFirestore();
  await fs.deleteDoc(fs.doc(db, "friendships", id));
}

// ---------- Shared listings (my side) ----------
async function shareListingWithFriends(row) {
  const { fs, db } = await getFirestore();
  const uid = socialUid();
  const items = await getAllItems();
  const item = items.find((it) => it.id === row.itemId) || {};
  const local = row.listingId ? getListings().find((l) => l.id === row.listingId) : null;
  const thumbnail = await compressThumbnail(itemIllustration(item.category ? item : local || {}, item.photo));
  const docId = `${uid}_${row.shareKey}`;
  await fs.setDoc(fs.doc(db, "listings", docId), {
    ownerUid: uid,
    title: String((local && local.title) || describe(item) || "Wardrobe piece").slice(0, 60),
    description: String((local && local.description) || `${item.color || ""} ${item.category || "piece"}, open to swaps and borrowing.`.trim()).slice(0, 400),
    category: item.category || (local && local.category) || "accessory",
    color: item.color || (local && local.color) || "multi",
    thumbnail,
    type: row.type === "sell" ? "sell" : "swap",
    sharedWithFriends: true,
    status: "Listed",
    createdAt: fs.serverTimestamp(),
  });
  const shares = getFriendShares();
  shares[row.shareKey] = docId;
  saveFriendShares(shares);
}

async function unshareListing(shareKey) {
  const shares = getFriendShares();
  const docId = shares[shareKey];
  if (docId) {
    const { fs, db } = await getFirestore();
    await fs.deleteDoc(fs.doc(db, "listings", docId));
  }
  delete shares[shareKey];
  saveFriendShares(shares);
}

// Keep a shared listing's status in step when it's sold locally (best effort)
async function syncSharedListingStatus(shareKey, status) {
  const docId = getFriendShares()[shareKey];
  if (!docId || !socialUid()) return;
  try {
    const { fs, db } = await getFirestore();
    await fs.updateDoc(fs.doc(db, "listings", docId), { status });
  } catch (err) {
    console.warn("Couldn't update shared listing:", err.message);
  }
}

// ---------- Friends feed ----------
async function loadFriendFeed() {
  const { fs, db } = await getFirestore();
  const friends = (await loadFriendships()).filter((f) => f.status === "accepted");
  const perFriend = await Promise.all(
    friends.map(async (f) => {
      const snap = await fs.getDocs(
        fs.query(fs.collection(db, "listings"), fs.where("ownerUid", "==", f.other), fs.where("sharedWithFriends", "==", true))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data(), ownerName: f.profile.displayName }));
    })
  );
  friendFeedCache = perFriend.flat().filter((l) => l.status === "Listed");
  return friendFeedCache;
}

// ---------- Requests ----------
async function loadFriendRequests() {
  const { fs, db } = await getFirestore();
  const uid = socialUid();
  const col = fs.collection(db, "requests");
  const [incoming, outgoing] = await Promise.all([
    fs.getDocs(fs.query(col, fs.where("ownerUid", "==", uid))),
    fs.getDocs(fs.query(col, fs.where("requesterUid", "==", uid))),
  ]);
  const seen = new Map();
  [...incoming.docs, ...outgoing.docs].forEach((d) => seen.set(d.id, { id: d.id, ...d.data() }));
  friendRequestsCache = [...seen.values()].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return friendRequestsCache;
}

async function createFriendRequest(listing, type) {
  const { fs, db } = await getFirestore();
  const uid = socialUid();
  const text =
    type === "borrow" ? `Hi! Could I borrow your ${listing.title}?` : `Hi! Would you swap your ${listing.title} for something from my wardrobe?`;
  await fs.addDoc(fs.collection(db, "requests"), {
    listingId: listing.id,
    ownerUid: listing.ownerUid,
    requesterUid: uid,
    type,
    status: "pending",
    messages: [{ from: uid, text, at: Date.now() }],
    listingTitle: String(listing.title || "").slice(0, 60),
    ownerName: listing.ownerName || "Friend",
    requesterName: myPublicProfile().displayName,
    createdAt: fs.serverTimestamp(),
    createdAtMs: Date.now(),
  });
}

async function setFriendRequestStatus(id, status) {
  const { fs, db } = await getFirestore();
  await fs.updateDoc(fs.doc(db, "requests", id), { status });
}

async function sendFriendMessage(id, text) {
  const { fs, db } = await getFirestore();
  await fs.updateDoc(fs.doc(db, "requests", id), {
    messages: fs.arrayUnion({ from: socialUid(), text: text.slice(0, 500), at: Date.now() }),
  });
}

// ---------- Friends screen ----------
async function renderFriends() {
  const signedIn = Boolean(socialUid());
  $("#friends-guest").hidden = signedIn;
  $("#friends-signed").hidden = !signedIn;
  if (!signedIn) return; // guest mode: no Firestore at all

  document.querySelectorAll("[data-friends-tab]").forEach((b) => b.classList.toggle("active", b.dataset.friendsTab === friendsTab));
  $("#friends-feed").hidden = friendsTab !== "feed";
  $("#friends-people").hidden = friendsTab !== "people";
  $("#friends-requests").hidden = friendsTab !== "requests";
  setFriendsStatus("");

  try {
    if (friendsTab === "feed") await renderFriendFeed();
    if (friendsTab === "people") await renderFriendPeople();
    if (friendsTab === "requests") await renderFriendRequests();
  } catch (err) {
    console.warn("Friends unavailable:", err.message);
    setFriendsStatus("Couldn't reach Friends right now. Your wardrobe is safe on this device; try again in a moment.");
  }
}

async function renderFriendFeed() {
  const box = $("#friends-feed");
  box.innerHTML = `<p class="auth-msg">Loading your friends’ pieces…</p>`;
  const feed = await loadFriendFeed();
  if (!feed.length) {
    const hasFriends = friendsCache.some((f) => f.status === "accepted");
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">👯</div>
        <p>${hasFriends ? "Your friends haven’t shared anything yet." : "Add a friend with their invite code to see what they share."}</p>
        <button class="btn-secondary" data-friends-goto="people">${hasFriends ? "See friends" : "Add a friend"}</button>
      </div>`;
    return;
  }
  box.innerHTML = `<div class="grid collage-grid">${feed
    .map(
      (l, i) => `
      <article class="collage-tile-wrap" data-friend-listing="${escapeHtml(l.id)}" tabindex="0" role="button" aria-label="${escapeHtml(l.title)}">
        ${collageTileHtml([safeThumb(l)], i)}
        <h3 class="collage-name">${escapeHtml(l.title)}</h3>
        <span class="collage-count">${escapeHtml(l.ownerName)} · ${l.type === "sell" ? "For sale" : l.type === "lend" ? "To lend" : "Open to swaps"}</span>
      </article>`
    )
    .join("")}</div>`;
}

async function renderFriendPeople() {
  if (pendingInviteCode && !$("#invite-input").value) $("#invite-input").value = pendingInviteCode;
  $("#my-invite-code").textContent = myInviteCode || "······";
  const [code, friends] = await Promise.all([myInviteCode ? myInviteCode : ensureMyUserDoc(), loadFriendships()]);
  $("#my-invite-code").textContent = code;
  const uid = socialUid();

  const person = (f, actions) => `
    <div class="friend-row">
      ${f.profile.photoURL ? `<img class="auth-photo" src="${escapeHtml(f.profile.photoURL)}" alt="" referrerpolicy="no-referrer" />` : `<span class="friend-initial">${escapeHtml((f.profile.displayName || "F")[0])}</span>`}
      <span class="friend-name">${escapeHtml(f.profile.displayName || "Friend")}</span>
      ${actions}
    </div>`;

  const incoming = friends.filter((f) => f.status === "pending" && f.requestedBy !== uid);
  const outgoing = friends.filter((f) => f.status === "pending" && f.requestedBy === uid);
  const accepted = friends.filter((f) => f.status === "accepted");

  $("#friends-pending").innerHTML =
    incoming.length || outgoing.length
      ? `<h3 class="rewear-group-title">Pending</h3>
         ${incoming
           .map((f) =>
             person(
               f,
               `<button type="button" class="btn-card-small primary" data-friend-accept="${escapeHtml(f.id)}">Accept</button>
                <button type="button" class="btn-card-small" data-friend-decline="${escapeHtml(f.id)}">Decline</button>`
             )
           )
           .join("")}
         ${outgoing.map((f) => person(f, `<small class="friend-meta">Waiting</small>`)).join("")}`
      : "";

  $("#friends-list").innerHTML = `
    <h3 class="rewear-group-title">My friends <span class="seg-count">${accepted.length}</span></h3>
    ${accepted.length ? accepted.map((f) => person(f, "")).join("") : `<p class="label-empty">No friends yet. Share your code or enter theirs.</p>`}`;
}

async function renderFriendRequests() {
  const box = $("#friends-requests");
  box.innerHTML = `<p class="auth-msg">Loading requests…</p>`;
  const list = await loadFriendRequests();
  const uid = socialUid();
  if (!list.length) {
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">💌</div>
        <p>No requests yet. Tap a piece in the Feed to ask to borrow or offer a swap.</p>
      </div>`;
    return;
  }
  box.innerHTML = list
    .map((r) => {
      const mine = r.ownerUid === uid;
      const who = mine ? `${escapeHtml(r.requesterName || "A friend")} wants to ${r.type === "borrow" ? "borrow" : "swap for"}` : `You asked ${escapeHtml(r.ownerName || "a friend")} to ${r.type === "borrow" ? "borrow" : "swap"}`;
      const statusLabel = { pending: "Pending", accepted: "Accepted", declined: "Declined" }[r.status] || r.status;
      return `
        <article class="rewear-row friend-request">
          <div class="rewear-row-info">
            <strong>${escapeHtml(r.listingTitle || "a piece")}</strong>
            <small>${who} · <span class="rewear-pill rewear-pill-${r.status === "accepted" ? "sold" : "listed"}">${escapeHtml(statusLabel)}</span></small>
            <div class="friend-request-actions">
              ${
                mine && r.status === "pending"
                  ? `<button type="button" class="btn-card-small primary" data-request-accept="${escapeHtml(r.id)}">Accept</button>
                     <button type="button" class="btn-card-small" data-request-decline="${escapeHtml(r.id)}">Decline</button>`
                  : ""
              }
              <button type="button" class="btn-card-small" data-request-thread="${escapeHtml(r.id)}">Messages (${(r.messages || []).length})</button>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

function openFriendListingSheet(id) {
  const l = friendFeedCache.find((x) => x.id === id);
  if (!l) return;
  const asked = friendRequestsCache.find((r) => r.listingId === id && r.requesterUid === socialUid());
  openSheet(`
    <div class="friend-listing">
      ${collageTileHtml([safeThumb(l)], 0)}
      <h3 class="collage-name">${escapeHtml(l.title)}</h3>
      <p class="friend-meta">Shared by ${escapeHtml(l.ownerName)}</p>
      <p class="rewear-copy">${escapeHtml(l.description || "")}</p>
      <p class="rewear-demo-banner" role="note">Demo only. Payments and local pickup are coming soon.</p>
      ${
        asked
          ? `<p class="auth-msg">You already sent a ${asked.type === "borrow" ? "borrow" : "swap"} request (${escapeHtml(asked.status)}).</p>`
          : `<div class="manual-btn-row">
               <button type="button" class="btn-primary" style="flex:1;" data-friend-ask="borrow" data-listing="${escapeHtml(l.id)}">Ask to borrow</button>
               <button type="button" class="btn-secondary" style="flex:1;" data-friend-ask="swap" data-listing="${escapeHtml(l.id)}">Offer a swap</button>
             </div>`
      }
      <button class="link-btn sheet-cancel" data-close-sheet>Close</button>
    </div>`);
}

function renderFriendThread(id) {
  const r = friendRequestsCache.find((x) => x.id === id);
  if (!r) return;
  openThreadId = id;
  const uid = socialUid();
  const other = r.ownerUid === uid ? r.requesterName : r.ownerName;
  openSheet(`
    <div class="sheet-header">
      <div>
        <h3>${escapeHtml(other || "Friend")}</h3>
        <p>About ${escapeHtml(r.listingTitle || "a piece")}</p>
      </div>
    </div>
    <p class="rewear-demo-banner" role="note">Demo only. Payments and local pickup are coming soon.</p>
    <div class="swap-chat-log" id="friend-chat-log">
      ${(r.messages || [])
        .map((m) => {
          const me = m.from === uid;
          return `<div class="chat-row ${me ? "user" : "stylist"}"><div class="chat-bubble ${me ? "user" : "stylist"}">${escapeHtml(m.text)}</div></div>`;
        })
        .join("")}
    </div>
    <form class="swap-chat-form" id="friend-chat-form" autocomplete="off">
      <input type="text" id="friend-chat-input" class="text-input" placeholder="Write a message" maxlength="500" />
      <button type="submit" class="chat-send-btn" aria-label="Send">↑</button>
    </form>
    <button class="link-btn sheet-cancel" data-close-sheet>Close</button>`);
  const log = $("#friend-chat-log");
  if (log) log.scrollTop = log.scrollHeight;
}

// Friends screen clicks
$("#screen-friends")?.addEventListener("click", async (e) => {
  const tab = e.target.closest("[data-friends-tab]") || e.target.closest("[data-friends-goto]");
  if (tab) {
    friendsTab = tab.dataset.friendsTab || tab.dataset.friendsGoto;
    return renderFriends();
  }
  const tile = e.target.closest("[data-friend-listing]");
  if (tile) {
    if (!friendRequestsCache.length) await loadFriendRequests().catch(() => []);
    return openFriendListingSheet(tile.dataset.friendListing);
  }

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast(ok);
    } catch (err) {
      setFriendsStatus(err.message && !/permission|network|offline/i.test(err.message) ? err.message : "That didn't work. Please try again.");
    }
    renderFriends();
  };
  const accept = e.target.closest("[data-friend-accept]");
  if (accept) return run(() => acceptFriendship(accept.dataset.friendAccept), "Friend added 🎉");
  const decline = e.target.closest("[data-friend-decline]");
  if (decline) return run(() => declineFriendship(decline.dataset.friendDecline), "Request declined");
  const reqAccept = e.target.closest("[data-request-accept]");
  if (reqAccept) return run(() => setFriendRequestStatus(reqAccept.dataset.requestAccept, "accepted"), "Request accepted");
  const reqDecline = e.target.closest("[data-request-decline]");
  if (reqDecline) return run(() => setFriendRequestStatus(reqDecline.dataset.requestDecline, "declined"), "Request declined");
  const thread = e.target.closest("[data-request-thread]");
  if (thread) return renderFriendThread(thread.dataset.requestThread);

  if (e.target.closest("#btn-share-invite")) {
    if (!myInviteCode) return;
    const url = `${location.origin}${location.pathname}?invite=${myInviteCode}`;
    const text = `Add me on Weari so we can borrow and swap clothes. My code is ${myInviteCode}.`;
    try {
      if (navigator.share) await navigator.share({ title: "Weari", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast("Invite link copied");
      }
    } catch (err) {
      if (err && err.name !== "AbortError") setFriendsStatus(`Share this link: ${url}`);
    }
  }
});

$("#invite-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#invite-input");
  try {
    const msg = await addFriendByCode(input.value);
    input.value = "";
    toast(msg);
  } catch (err) {
    setFriendsStatus(err.message && !/permission|network|offline/i.test(err.message) ? err.message : "Couldn't add that friend. Please try again.");
    return;
  }
  renderFriends();
});

// Listing sheet and message thread live in the shared bottom sheet
$("#sheet").addEventListener("click", async (e) => {
  const ask = e.target.closest("[data-friend-ask]");
  if (!ask) return;
  const listing = friendFeedCache.find((l) => l.id === ask.dataset.listing);
  if (!listing) return;
  ask.disabled = true;
  try {
    await createFriendRequest(listing, ask.dataset.friendAsk);
    closeSheet();
    toast(ask.dataset.friendAsk === "borrow" ? "Borrow request sent 💌" : "Swap offer sent 🔁");
    friendsTab = "requests";
    renderFriends();
  } catch (err) {
    ask.disabled = false;
    toast("Couldn't send that request. Please try again.");
  }
});

$("#sheet").addEventListener("submit", async (e) => {
  if (e.target.id !== "friend-chat-form") return;
  e.preventDefault();
  const input = $("#friend-chat-input");
  const text = input.value.trim();
  if (!text || !openThreadId) return;
  input.disabled = true;
  try {
    await sendFriendMessage(openThreadId, text);
    await loadFriendRequests();
    renderFriendThread(openThreadId);
    $("#friend-chat-input")?.focus();
  } catch {
    input.disabled = false;
    toast("Message not sent. Please try again.");
  }
});

// "Share with friends" switches in My Rewear
$("#my-rewear-list")?.addEventListener("change", async (e) => {
  const sw = e.target.closest("[data-share-key]");
  if (!sw) return;
  const on = sw.checked;
  if (!socialUid()) {
    sw.checked = !on;
    toast("Sign in with Google to share with friends");
    return showScreen("friends");
  }
  sw.disabled = true;
  try {
    if (on) {
      await shareListingWithFriends({
        shareKey: sw.dataset.shareKey,
        itemId: sw.dataset.shareItem,
        listingId: sw.dataset.shareListing || "",
        type: sw.dataset.shareType,
      });
      toast("Shared with your friends 👯");
    } else {
      await unshareListing(sw.dataset.shareKey);
      toast("No longer shared");
    }
  } catch (err) {
    console.warn("Share failed:", err.message);
    sw.checked = !on;
    toast("Couldn't update sharing. Please try again.");
  } finally {
    sw.disabled = false;
  }
});

// Signing out clears in-memory friend data so nothing carries into guest mode
window.addEventListener("weari-auth", () => {
  if (!socialUid()) {
    myInviteCode = "";
    friendsCache = [];
    friendFeedCache = [];
    friendRequestsCache = [];
    openThreadId = null;
  }
  if (!$("#screen-friends").hidden) renderFriends();
});

if (pendingInviteCode) {
  setTimeout(() => toast("Open Friends to add the person who invited you"), 1200);
}

// ---------- Start ----------
(async () => {
  buildAddForm();
  await migrateAllData();
  updateKarmaStreak();
  updateKarmaChip();
  renderKarma();
  renderAuthBlocks();
  showScreen("wardrobe");

  // Show onboarding on first time open
  if (!localStorage.getItem(ONBOARDING_COMPLETED_KEY)) {
    openOnboarding(0);
  }
})();

