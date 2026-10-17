import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { fb } from "./app.js";

// =====================================================
// Community swap feed (shared between all signed-in users)
//   listings/{uid}_{itemId}  an item someone marked "Available to swap" (public: true)
//   swapRequests/{id}        "I'd swap my X for your Y"
//     status: pending -> accepted | declined -> completed
// Who may read or change what is enforced by firestore.rules.
// =====================================================
export const listingDocId = (uid, itemId) => `${uid}_${itemId}`;

const clip = (v, n) => String(v ?? "").slice(0, n);

// Called by the sync whenever a swappable item is saved (photo is already a cloud URL)
export function upsertListing(uid, ownerName, item) {
  return setDoc(doc(fb.db, "listings", listingDocId(uid, item.id)), {
    ownerUid: uid,
    ownerName: clip(ownerName || "Weari member", 40),
    itemId: item.id,
    title: clip(item.name || `${item.color} ${item.category}`, 60),
    category: item.category,
    color: item.color,
    occasions: (item.occasions || []).slice(0, 5),
    photo: item.photo || "",
    type: "swap",
    status: "Listed",
    public: true, // on the community swap feed (friends-only listings have public: false)
    sharedWithFriends: false,
    createdAt: item.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
}

export function removeListing(uid, itemId) {
  return deleteDoc(doc(fb.db, "listings", listingDocId(uid, itemId)));
}

// Newest 100 public listings from everyone; onChange(list) runs on every update.
// (Sorted here rather than in the query, so Firestore needs no extra index.)
export function watchListings(onChange, onError) {
  const q = query(collection(fb.db, "listings"), where("public", "==", true), limit(100));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))),
    (err) => {
      console.warn("Swap feed unavailable:", err.code || err);
      onError?.(err);
    }
  );
}

// Requests I sent and requests for my items. onChange({ sent, received })
export function watchSwapRequests(uid, onChange) {
  const state = { sent: [], received: [] };
  const listen = (field, bucket) =>
    onSnapshot(
      query(collection(fb.db, "swapRequests"), where(field, "==", uid)),
      (snap) => {
        state[bucket] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onChange({ ...state });
      },
      (err) => console.warn(`Swap requests (${bucket}) unavailable:`, err.code || err)
    );
  const stopSent = listen("fromUid", "sent");
  const stopReceived = listen("toUid", "received");
  return () => {
    stopSent();
    stopReceived();
  };
}

// listing: a community listing · offered: one of my items (photo already a cloud URL)
export function sendSwapRequest(uid, fromName, listing, offered) {
  return addDoc(collection(fb.db, "swapRequests"), {
    fromUid: uid,
    fromName: clip(fromName || "Weari member", 40),
    toUid: listing.ownerUid,
    listingId: listing.id,
    listing: { title: clip(listing.title, 60), photo: listing.photo || "", ownerName: clip(listing.ownerName, 40), category: listing.category, color: listing.color },
    offered: { itemId: offered.id, title: clip(offered.name || `${offered.color} ${offered.category}`, 60), photo: offered.photo || "", category: offered.category, color: offered.color },
    status: "pending",
    createdAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

export function setSwapRequestStatus(id, status) {
  return updateDoc(doc(fb.db, "swapRequests", id), { status, updatedAt: serverTimestamp() });
}

export function cancelSwapRequest(id) {
  return deleteDoc(doc(fb.db, "swapRequests", id));
}
