import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { fb } from "./app.js";

// =====================================================
// Friends: invite codes, friendships, listings shared with friends,
// and borrow/swap requests with messages. Signed-in users only.
//   users/{uid}            displayName, photoURL, inviteCode
//   inviteCodes/{code}     uid, displayName, photoURL (lets a friend find you by code)
//   friendships/{a_b}      members [a, b] (sorted), status, requestedBy, profiles {uid: {displayName, photoURL}}
//   listings/{uid_key}     sharedWithFriends: true, thumbnail (small JPEG), type, status…
//   requests/{id}          listingId, ownerUid, requesterUid, type, status, messages [{from, text, at}]
// Who may read or change what is enforced by firebase/firestore.rules.
// =====================================================
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I

export const friendshipId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

function randomInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

// me = { displayName, photoURL } — what friends see
export async function ensureMyUserDoc(uid, me) {
  const userRef = doc(fb.db, "users", uid);
  const snap = await getDoc(userRef);
  let code = snap.exists() ? snap.data().inviteCode : "";

  if (!code) {
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = randomInviteCode();
      const codeRef = doc(fb.db, "inviteCodes", candidate);
      if ((await getDoc(codeRef)).exists()) continue;
      await setDoc(codeRef, { uid, ...me, createdAt: serverTimestamp() });
      code = candidate;
    }
    if (!code) throw new Error("Couldn't make an invite code, please try again");
    await setDoc(userRef, { ...me, inviteCode: code, createdAt: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(userRef, me, { merge: true });
  }
  return code;
}

// ---------- Friendships ----------
export async function loadFriendships(uid) {
  const snap = await getDocs(query(collection(fb.db, "friendships"), where("members", "array-contains", uid)));
  return snap.docs.map((d) => {
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
}

export async function acceptFriendship(uid, me, id) {
  await updateDoc(doc(fb.db, "friendships", id), {
    status: "accepted",
    [`profiles.${uid}`]: me,
    acceptedAt: serverTimestamp(),
  });
}

export function declineFriendship(id) {
  return deleteDoc(doc(fb.db, "friendships", id));
}

// Returns a message to show the person
export async function addFriendByCode(uid, me, rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Codes are 6 letters and numbers");
  const codeSnap = await getDoc(doc(fb.db, "inviteCodes", code));
  if (!codeSnap.exists()) throw new Error("No one has that code yet");
  const friend = codeSnap.data();
  if (friend.uid === uid) throw new Error("That's your own code");

  const ref = doc(fb.db, "friendships", friendshipId(uid, friend.uid));
  const existing = await getDoc(ref).catch(() => null);
  if (existing && existing.exists()) {
    const data = existing.data();
    if (data.status === "accepted") return `You're already friends with ${friend.displayName}`;
    if (data.requestedBy === uid) return `Request already sent to ${friend.displayName}`;
    await acceptFriendship(uid, me, existing.id);
    return `You're now friends with ${friend.displayName} 🎉`;
  }
  await setDoc(ref, {
    members: [uid, friend.uid].sort(),
    status: "pending",
    requestedBy: uid,
    profiles: {
      [uid]: me,
      [friend.uid]: { displayName: friend.displayName || "Friend", photoURL: friend.photoURL || "" },
    },
    createdAt: serverTimestamp(),
  });
  return `Friend request sent to ${friend.displayName}`;
}

// ---------- Listings I share with friends ----------
export function shareListingWithFriends(docId, listing) {
  return setDoc(doc(fb.db, "listings", docId), {
    ...listing,
    public: false,
    sharedWithFriends: true,
    status: "Listed",
    createdAt: serverTimestamp(),
  });
}

export function unshareListing(docId) {
  return deleteDoc(doc(fb.db, "listings", docId));
}

export function setSharedListingStatus(docId, status) {
  return updateDoc(doc(fb.db, "listings", docId), { status });
}

// What my accepted friends are sharing
export async function loadFriendFeed(friends) {
  const perFriend = await Promise.all(
    friends.map(async (f) => {
      const snap = await getDocs(query(collection(fb.db, "listings"), where("ownerUid", "==", f.other), where("sharedWithFriends", "==", true)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data(), ownerName: f.profile.displayName }));
    })
  );
  return perFriend.flat().filter((l) => l.status === "Listed");
}

// ---------- Borrow / swap requests between friends ----------
export async function loadFriendRequests(uid) {
  const col = collection(fb.db, "requests");
  const [incoming, outgoing] = await Promise.all([
    getDocs(query(col, where("ownerUid", "==", uid))),
    getDocs(query(col, where("requesterUid", "==", uid))),
  ]);
  const seen = new Map();
  [...incoming.docs, ...outgoing.docs].forEach((d) => seen.set(d.id, { id: d.id, ...d.data() }));
  return [...seen.values()].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

export function createFriendRequest(uid, me, listing, type) {
  const text = type === "borrow" ? `Hi! Could I borrow your ${listing.title}?` : `Hi! Would you swap your ${listing.title} for something from my wardrobe?`;
  return addDoc(collection(fb.db, "requests"), {
    listingId: listing.id,
    ownerUid: listing.ownerUid,
    requesterUid: uid,
    type,
    status: "pending",
    messages: [{ from: uid, text, at: Date.now() }],
    listingTitle: String(listing.title || "").slice(0, 60),
    ownerName: listing.ownerName || "Friend",
    requesterName: me.displayName,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
}

export function setFriendRequestStatus(id, status) {
  return updateDoc(doc(fb.db, "requests", id), { status });
}

export function sendFriendMessage(uid, id, text) {
  return updateDoc(doc(fb.db, "requests", id), {
    messages: arrayUnion({ from: uid, text: text.slice(0, 500), at: Date.now() }),
  });
}
