import { BACKUP_ITEMS_KEY, LEGACY_ITEM_STORAGE_KEYS, LEGACY_KARMA_KEYS, LEGACY_OUTFIT_KEYS, LEGACY_REQUEST_KEYS, LEGACY_WEAR_COUNT_KEYS, dbRun, normalizeItem, normalizeOutfit, normalizeRequest } from "./items-db.js";
import { extractKarma, getKarma, saveKarma } from "../features/karma/karma.js";
import { getSavedOutfits, saveSavedOutfits } from "../features/style/saved-outfits.js";
import { getRequests, saveRequests } from "../features/swap/swap.js";
import { kv } from "../core/kv.js";

let isMigrated = false;
export async function migrateAllData() {
  if (isMigrated) return;
  isMigrated = true;

  try {
    // 1. Standalone wear counts in localStorage
    const standaloneWears = {};
    for (const k of LEGACY_WEAR_COUNT_KEYS) {
      try {
        const raw = kv.getItem(k);
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
        const raw = kv.getItem(k);
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
        kv.setItem(BACKUP_ITEMS_KEY, JSON.stringify(allMerged));
      }
    } catch {}

    // 4. Migrate Karma points, badges, streak
    const karma = getKarma();
    for (const k of LEGACY_KARMA_KEYS) {
      try {
        const raw = kv.getItem(k);
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
        const raw = kv.getItem(k);
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
        const raw = kv.getItem(k);
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
