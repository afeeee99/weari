import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { deleteObject, listAll, ref } from "firebase/storage";
import { kv, onKvChange, withoutSync } from "../core/kv.js";
import { deleteItem, getAllItems, getItem, onItemsChange, saveItem } from "../data/items-db.js";
import { fb } from "./app.js";
import { listingDocId, removeListing, upsertListing } from "./community.js";
import { withCloudPhotos } from "./photos.js";

// =====================================================
// Cloud sync for a signed-in user.
//
// The app still reads and writes on the device (fast, works offline).
// This file copies every change to Firestore and applies changes made on
// the user's other devices:
//   users/{uid}/items/{itemId}   one document per wardrobe item
//   users/{uid}/state/{key}      everything else (karma, outfits, plan…),
//                                one document per localStorage key
// The newest copy wins (updatedAt). The first time a device signs in, its
// guest data is merged into the account instead of being replaced.
// =====================================================

// localStorage keys that follow the user to every device, and how to combine
// two copies the first time a device joins an account:
//   karma: keep the higher points and every badge · max: keep the higher number
//   list: keep entries from both (by id) · object: combine fields · lww: newest wins
export const SYNCED_KEYS = {
  "weari-karma": "karma",
  "weari-completed-swaps": "max",
  "weari-purchases-avoided": "max",
  weari_considered_not_bought: "max",
  weari_saved_outfits: "list",
  weari_favorite_outfits: "list",
  weari_saved_for_later: "list",
  "weari-swap-requests": "list",
  weari_counted_swaps: "list",
  weari_weekly_plan: "object",
  weari_plan_repeat_weekly: "lww",
  weari_onboarding_completed: "lww",
  weari_onboarding_answers: "lww",
  weari_user_profile: "lww",
  weari_profile_dismissed: "lww",
  weari_profile_first_name: "lww",
  weari_plus_waitlist: "lww",
};

// Device-only bookkeeping (never synced; the "weari__" prefix keeps them out of SYNCED_KEYS)
const META_KEY = "weari__sync_meta"; // { key: updatedAt } of the copy on this device
const MERGED_UID_KEY = "weari__sync_uid"; // the account this device's data was merged into
const DIRTY_KEY = "weari__sync_dirty"; // changes not yet confirmed by the cloud

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const meta = {
  get: (key) => readJson(META_KEY, {})[key] || 0,
  set(key, time) {
    const all = readJson(META_KEY, {});
    all[key] = time;
    writeJson(META_KEY, all);
  },
};

// dirty = { items: [ids to upload], deletes: [ids to delete], keys: [state keys to upload] }
function markDirty(kind, id, on = true) {
  const d = readJson(DIRTY_KEY, { items: [], deletes: [], keys: [] });
  d[kind] = d[kind].filter((x) => x !== id);
  if (on) d[kind].push(id);
  writeJson(DIRTY_KEY, d);
}
const dirty = () => readJson(DIRTY_KEY, { items: [], deletes: [], keys: [] });

let session = null;

function setStatus(s, status) {
  s.status = status;
  s.onStatus?.(status);
}
function track(s, promise) {
  s.pending++;
  setStatus(s, navigator.onLine ? "syncing" : "offline");
  return promise
    .catch((err) => {
      console.warn("Cloud sync write failed (will retry):", err.code || err.message || err);
      s.failed = true;
    })
    .finally(() => {
      s.pending--;
      if (!s.pending) setStatus(s, s.failed ? "error" : navigator.onLine ? "synced" : "offline");
    });
}

// ---------- Start / stop ----------
// options: { ownerName(): string, onChange(): void, onStatus(status): void }
export function startSync(user, options) {
  stopSync();
  const s = {
    uid: user.uid,
    ...options,
    unsubs: [],
    timers: new Map(),
    remoteItems: new Map(),
    firstMerge: localStorage.getItem(MERGED_UID_KEY) !== user.uid,
    itemsMerged: false,
    stateMerged: false,
    pending: 0,
    failed: false,
    status: "syncing",
  };
  session = s;
  setStatus(s, navigator.onLine ? "syncing" : "offline");

  // A small public profile so swap partners see a name
  track(s, setDoc(doc(fb.db, "users", s.uid), { displayName: s.ownerName(), lastSeenAt: serverTimestamp() }, { merge: true }));

  s.unsubs.push(onItemsChange((change) => onLocalItemChange(s, change)));
  s.unsubs.push(onKvChange((key) => onLocalKeyChange(s, key)));
  s.unsubs.push(
    onSnapshot(collection(fb.db, "users", s.uid, "items"), { includeMetadataChanges: true }, (snap) => onItemsSnapshot(s, snap), (err) => onSyncError(s, err))
  );
  s.unsubs.push(
    onSnapshot(collection(fb.db, "users", s.uid, "state"), { includeMetadataChanges: true }, (snap) => onStateSnapshot(s, snap), (err) => onSyncError(s, err))
  );

  const retry = () => s === session && retryDirty(s);
  const offline = () => s === session && setStatus(s, "offline");
  window.addEventListener("online", retry);
  window.addEventListener("offline", offline);
  s.unsubs.push(() => window.removeEventListener("online", retry));
  s.unsubs.push(() => window.removeEventListener("offline", offline));
}

export function stopSync() {
  if (!session) return;
  session.unsubs.forEach((fn) => fn());
  session.timers.forEach((t) => clearTimeout(t));
  session = null;
}

export const getSyncStatus = () => session?.status || "off";

function onSyncError(s, err) {
  console.warn("Cloud sync listener error:", err.code || err);
  setStatus(s, "error");
}

function finishMergeIfReady(s) {
  if (!s.itemsMerged || !s.stateMerged) return;
  if (s.firstMerge) {
    localStorage.setItem(MERGED_UID_KEY, s.uid);
    s.firstMerge = false;
  }
  retryDirty(s);
  if (!s.pending) setStatus(s, "synced");
  s.onChange?.();
}

// ---------- Wardrobe items ----------
function onLocalItemChange(s, change) {
  if (s !== session) return;
  if (change.type === "put") {
    markDirty("items", change.item.id);
    track(s, pushItem(s, change.item));
  } else if (change.type === "delete") {
    markDirty("deletes", change.id);
    track(s, deleteRemoteItem(s, change.id));
  }
}

async function pushItem(s, item) {
  const cloudItem = await withCloudPhotos(s.uid, item);
  const previous = s.remoteItems.get(item.id);
  s.remoteItems.set(item.id, cloudItem);
  await setDoc(doc(fb.db, "users", s.uid, "items", item.id), cloudItem);
  // Swappable items are also listed on the community swap feed
  if (cloudItem.swappable) await upsertListing(s.uid, s.ownerName(), cloudItem);
  else if (!previous || previous.swappable) await removeListing(s.uid, item.id);
  markDirty("items", item.id, false);
}

async function deleteRemoteItem(s, id) {
  s.remoteItems.delete(id);
  await deleteDoc(doc(fb.db, "users", s.uid, "items", id));
  await removeListing(s.uid, id);
  markDirty("deletes", id, false);
}

async function onItemsSnapshot(s, snap) {
  if (s !== session) return;
  // Wait for a complete answer from the server before the first merge,
  // otherwise an empty offline cache could look like "everything was deleted"
  if (!s.itemsMerged) {
    if (snap.metadata.fromCache) return;
    s.itemsMerged = true;
    await mergeItems(s, snap);
    finishMergeIfReady(s);
    return;
  }
  let changed = false;
  for (const change of snap.docChanges()) {
    if (change.doc.metadata.hasPendingWrites) continue; // our own write coming back
    const remote = change.doc.data();
    if (change.type === "removed") {
      if (dirty().items.includes(change.doc.id)) continue;
      s.remoteItems.delete(change.doc.id);
      await deleteItem(change.doc.id, { fromSync: true });
      changed = true;
    } else {
      s.remoteItems.set(change.doc.id, remote);
      const local = await getItem(change.doc.id);
      if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
        await saveItem(remote, { fromSync: true });
        changed = true;
      }
    }
  }
  if (changed) s.onChange?.();
}

async function mergeItems(s, snap) {
  const remote = new Map(snap.docs.map((d) => [d.id, d.data()]));
  s.remoteItems = remote;
  const local = await getAllItems();
  const localIds = new Set(local.map((it) => it.id));
  const waiting = dirty();

  for (const [id, r] of remote) {
    if (waiting.deletes.includes(id)) continue; // deleted here while offline
    const l = local.find((it) => it.id === id);
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) await saveItem(r, { fromSync: true });
  }
  for (const l of local) {
    const r = remote.get(l.id);
    if (!r) {
      // Not in the cloud: new on this device (upload it) or deleted on another device (remove it)
      if (s.firstMerge || waiting.items.includes(l.id)) track(s, pushItem(s, l));
      else await deleteItem(l.id, { fromSync: true });
    } else if ((l.updatedAt || 0) > (r.updatedAt || 0)) {
      track(s, pushItem(s, l));
    }
  }
  for (const id of waiting.deletes) if (!localIds.has(id)) track(s, deleteRemoteItem(s, id));
}

// ---------- Everything else (one document per key) ----------
function onLocalKeyChange(s, key) {
  if (s !== session || !(key in SYNCED_KEYS)) return;
  meta.set(key, Date.now());
  markDirty("keys", key);
  clearTimeout(s.timers.get(key));
  // Wait a moment so quick changes (typing a name) become one upload
  s.timers.set(key, setTimeout(() => track(s, pushKey(s, key)), 600));
}

async function pushKey(s, key) {
  const raw = kv.getItem(key);
  let value = raw;
  if (raw && /^[[{]/.test(raw)) {
    try {
      value = JSON.stringify(await withCloudPhotos(s.uid, JSON.parse(raw), { inlineSize: 200 }));
    } catch {}
  }
  await setDoc(doc(fb.db, "users", s.uid, "state", key), { value: value ?? null, updatedAt: meta.get(key) || Date.now() });
  markDirty("keys", key, false);
}

function applyRemoteKey(key, remote) {
  withoutSync(() => (remote.value == null ? kv.removeItem(key) : kv.setItem(key, remote.value)));
  meta.set(key, remote.updatedAt || Date.now());
}

function onStateSnapshot(s, snap) {
  if (s !== session) return;
  if (!s.stateMerged) {
    if (snap.metadata.fromCache) return;
    s.stateMerged = true;
    mergeState(s, snap);
    finishMergeIfReady(s);
    return;
  }
  let changed = false;
  for (const change of snap.docChanges()) {
    const key = change.doc.id;
    if (change.type === "removed" || change.doc.metadata.hasPendingWrites || !(key in SYNCED_KEYS)) continue;
    const remote = change.doc.data();
    if ((remote.updatedAt || 0) > meta.get(key) && remote.value !== kv.getItem(key)) {
      applyRemoteKey(key, remote);
      changed = true;
    }
  }
  if (changed) s.onChange?.();
}

function mergeState(s, snap) {
  const remote = new Map(snap.docs.map((d) => [d.id, d.data()]));
  for (const [key, type] of Object.entries(SYNCED_KEYS)) {
    const r = remote.get(key);
    const local = kv.getItem(key);
    const localTime = meta.get(key);
    const remoteTime = r?.updatedAt || 0;

    if (s.firstMerge && r && r.value != null && local != null) {
      // Same setting on both sides: combine them, then share the result
      const merged = mergeValues(type, local, r.value, localTime, remoteTime);
      if (merged !== local) withoutSync(() => kv.setItem(key, merged));
      if (merged !== r.value) {
        meta.set(key, Date.now());
        track(s, pushKey(s, key));
      } else meta.set(key, remoteTime);
    } else if (r && remoteTime >= localTime) {
      if (r.value !== local) applyRemoteKey(key, r);
      else meta.set(key, remoteTime);
    } else if (local != null || (r && localTime > remoteTime)) {
      track(s, pushKey(s, key));
    }
  }
}

const parse = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};
const idOf = (x) => (x && typeof x === "object" && x.id ? x.id : JSON.stringify(x));

export function mergeValues(type, local, remote, localTime, remoteTime) {
  const localNewer = localTime > remoteTime;
  if (type === "max") return String(Math.max(Number(local) || 0, Number(remote) || 0));
  if (type === "karma") {
    const a = parse(local, {});
    const b = parse(remote, {});
    return JSON.stringify({
      points: Math.max(Number(a.points) || 0, Number(b.points) || 0),
      unlockedBadges: [...new Set([...(a.unlockedBadges || []), ...(b.unlockedBadges || [])])],
      streakDays: Math.max(Number(a.streakDays) || 1, Number(b.streakDays) || 1),
      lastActiveDate: [a.lastActiveDate, b.lastActiveDate].filter(Boolean).sort().pop() || null,
    });
  }
  if (type === "list") {
    const [first, second] = localNewer ? [parse(local, []), parse(remote, [])] : [parse(remote, []), parse(local, [])];
    if (!Array.isArray(first) || !Array.isArray(second)) return localNewer ? local : remote;
    const seen = new Set(first.map(idOf));
    return JSON.stringify([...first, ...second.filter((x) => !seen.has(idOf(x)))]);
  }
  if (type === "object") {
    const [older, newer] = localNewer ? [parse(remote, {}), parse(local, {})] : [parse(local, {}), parse(remote, {})];
    return JSON.stringify({ ...older, ...newer });
  }
  return localNewer ? local : remote;
}

// ---------- Retry anything that didn't reach the cloud ----------
async function retryDirty(s) {
  const waiting = dirty();
  for (const id of waiting.items) {
    const item = await getItem(id);
    if (item) track(s, pushItem(s, item));
    else markDirty("items", id, false);
  }
  for (const id of waiting.deletes) track(s, deleteRemoteItem(s, id));
  for (const key of waiting.keys) if (key in SYNCED_KEYS) track(s, pushKey(s, key));
  s.failed = false;
}

// ---------- Reset: delete this user's cloud copy ----------
export async function wipeCloudData(uid) {
  stopSync();
  const deleteAll = async (docs) => {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(fb.db);
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };
  const items = await getDocs(collection(fb.db, "users", uid, "items"));
  await deleteAll(items.docs);
  await Promise.all(items.docs.map((d) => deleteDoc(doc(fb.db, "listings", listingDocId(uid, d.id))).catch(() => {})));
  await deleteAll((await getDocs(collection(fb.db, "users", uid, "state"))).docs);
  await deleteAll((await getDocs(query(collection(fb.db, "swapRequests"), where("fromUid", "==", uid)))).docs);
  try {
    if (!fb.storage) throw Object.assign(new Error("no bucket"), { code: "no-bucket" });
    const photos = await listAll(ref(fb.storage, `users/${uid}/photos`));
    await Promise.all(photos.items.map((p) => deleteObject(p).catch(() => {})));
  } catch (err) {
    console.warn("Could not delete cloud photos:", err.code || err);
  }
  [META_KEY, MERGED_UID_KEY, DIRTY_KEY].forEach((k) => localStorage.removeItem(k));
}

// Forget which account this device was merged with (after signing out)
export function forgetSyncState() {
  stopSync();
  [META_KEY, MERGED_UID_KEY, DIRTY_KEY].forEach((k) => localStorage.removeItem(k));
}
