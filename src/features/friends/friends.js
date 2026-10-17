import { collageTileHtml } from "../../core/collage.js";
import { $, toast } from "../../core/dom.js";
import { describe, escapeHtml } from "../../core/format.js";
import { kv } from "../../core/kv.js";
import { itemIllustration, placeholderImage, placeholderKind } from "../../core/placeholders.js";
import { getCurrentScreen, showScreen } from "../../core/router.js";
import { closeSheet, openSheet } from "../../core/sheet.js";
import { getAllItems } from "../../data/items-db.js";
import { getDisplayName, getFirebase, getSignedInUser } from "../account/account.js";
import { getListings } from "../rewear/rewear.js";

// =====================================================
// Friends: invite codes, a feed of what friends share, and borrow/swap
// requests with messages. Only for signed-in users; guests never touch Firestore.
// Only pieces switched to "Share with friends" (in My Rewear) are shared,
// as small compressed thumbnails. Data calls live in src/firebase/friends.js.
// =====================================================
export const FRIEND_SHARES_KEY = "weari_friend_shares"; // { shareKey: firestore listing id } for the share switches
const THUMB_MAX_PX = 600;
const THUMB_MAX_CHARS = 150 * 1024;
const pendingInviteCode = (new URLSearchParams(location.search).get("invite") || "").toUpperCase().slice(0, 6);

let friendsTab = "feed";
let myInviteCode = "";
let friendsCache = []; // [{ id, other, status, requestedBy, profile }]
let friendFeedCache = [];
let friendRequestsCache = [];
let openThreadId = null;

const api = () => getFirebase()?.friends;
const uid = () => getSignedInUser()?.uid || null;
// What friends see about me
const me = () => ({ displayName: getDisplayName(), photoURL: getSignedInUser()?.photoURL || "" });

export function getFriendShares() {
  try {
    const data = JSON.parse(kv.getItem(FRIEND_SHARES_KEY) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveFriendShares(map) {
  try {
    kv.setItem(FRIEND_SHARES_KEY, JSON.stringify(map));
  } catch {}
}

// Only small JPEG data URLs are shown; anything else becomes a drawing
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

// Show our own messages as-is; hide technical ones (permissions, network)
const friendlyError = (err, fallback) => (err?.message && !/permission|network|offline|firebase/i.test(err.message) ? err.message : fallback);

// JPEG thumbnail, at most 600px on the long side and under 150KB
function compressThumbnail(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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

// ---------- Sharing my pieces (switches in My Rewear) ----------
async function shareRow(row) {
  const items = await getAllItems();
  const item = items.find((it) => it.id === row.itemId) || {};
  const local = row.listingId ? getListings().find((l) => l.id === row.listingId) : null;
  const thumbnail = await compressThumbnail(itemIllustration(item.category ? item : local || {}, item.photo));
  const docId = `${uid()}_${row.shareKey}`;
  await api().shareListingWithFriends(docId, {
    ownerUid: uid(),
    ownerName: getDisplayName().slice(0, 40),
    title: String((local && local.title) || describe(item) || "Wardrobe piece").slice(0, 60),
    description: String((local && local.description) || `${item.color || ""} ${item.category || "piece"}, open to swaps and borrowing.`.trim()).slice(0, 400),
    category: item.category || (local && local.category) || "accessory",
    color: item.color || (local && local.color) || "multi",
    thumbnail,
    type: row.type === "sell" ? "sell" : "swap",
  });
  const shares = getFriendShares();
  shares[row.shareKey] = docId;
  saveFriendShares(shares);
}

async function unshareRow(shareKey) {
  const shares = getFriendShares();
  if (shares[shareKey]) await api().unshareListing(shares[shareKey]);
  delete shares[shareKey];
  saveFriendShares(shares);
}

// Keep a shared listing's status in step when it's sold locally (best effort)
export async function syncSharedListingStatus(shareKey, status) {
  const docId = getFriendShares()[shareKey];
  if (!docId || !uid() || !api()) return;
  try {
    await api().setSharedListingStatus(docId, status);
  } catch (err) {
    console.warn("Couldn't update shared listing:", err.message);
  }
}

$("#my-rewear-list")?.addEventListener("change", async (e) => {
  const sw = e.target.closest("[data-share-key]");
  if (!sw) return;
  const on = sw.checked;
  if (!uid() || !api()) {
    sw.checked = !on;
    toast("Sign in to share with friends");
    return showScreen("friends");
  }
  sw.disabled = true;
  try {
    if (on) {
      await shareRow({ shareKey: sw.dataset.shareKey, itemId: sw.dataset.shareItem, listingId: sw.dataset.shareListing || "", type: sw.dataset.shareType });
      toast("Shared with your friends 👯");
    } else {
      await unshareRow(sw.dataset.shareKey);
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

// ---------- Friends screen ----------
export async function renderFriends() {
  const signedIn = Boolean(uid() && api());
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
    console.warn("Friends unavailable:", err.code || err.message);
    setFriendsStatus("Couldn't reach Friends right now. Your wardrobe is safe; try again in a moment.");
  }
}

async function renderFriendFeed() {
  const box = $("#friends-feed");
  box.innerHTML = `<p class="auth-msg">Loading your friends’ pieces…</p>`;
  friendsCache = await api().loadFriendships(uid());
  friendFeedCache = await api().loadFriendFeed(friendsCache.filter((f) => f.status === "accepted"));
  if (!friendFeedCache.length) {
    const hasFriends = friendsCache.some((f) => f.status === "accepted");
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">👯</div>
        <p>${hasFriends ? "Your friends haven’t shared anything yet." : "Add a friend with their invite code to see what they share."}</p>
        <button class="btn-secondary" data-friends-goto="people">${hasFriends ? "See friends" : "Add a friend"}</button>
      </div>`;
    return;
  }
  box.innerHTML = `<div class="grid collage-grid">${friendFeedCache
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
  const [code, friends] = await Promise.all([myInviteCode || api().ensureMyUserDoc(uid(), me()), api().loadFriendships(uid())]);
  myInviteCode = code;
  friendsCache = friends;
  $("#my-invite-code").textContent = code;

  const person = (f, actions) => `
    <div class="friend-row">
      ${f.profile.photoURL ? `<img class="auth-photo" src="${escapeHtml(f.profile.photoURL)}" alt="" referrerpolicy="no-referrer" />` : `<span class="friend-initial">${escapeHtml((f.profile.displayName || "F")[0])}</span>`}
      <span class="friend-name">${escapeHtml(f.profile.displayName || "Friend")}</span>
      ${actions}
    </div>`;

  const incoming = friends.filter((f) => f.status === "pending" && f.requestedBy !== uid());
  const outgoing = friends.filter((f) => f.status === "pending" && f.requestedBy === uid());
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
  friendRequestsCache = await api().loadFriendRequests(uid());
  if (!friendRequestsCache.length) {
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">💌</div>
        <p>No requests yet. Tap a piece in the Feed to ask to borrow or offer a swap.</p>
      </div>`;
    return;
  }
  box.innerHTML = friendRequestsCache
    .map((r) => {
      const mine = r.ownerUid === uid();
      const verb = r.type === "borrow" ? "borrow" : "swap for";
      const who = mine ? `${escapeHtml(r.requesterName || "A friend")} wants to ${verb}` : `You asked ${escapeHtml(r.ownerName || "a friend")} to ${r.type === "borrow" ? "borrow" : "swap"}`;
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
  const asked = friendRequestsCache.find((r) => r.listingId === id && r.requesterUid === uid());
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
  const other = r.ownerUid === uid() ? r.requesterName : r.ownerName;
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
          const mineMsg = m.from === uid();
          return `<div class="chat-row ${mineMsg ? "user" : "stylist"}"><div class="chat-bubble ${mineMsg ? "user" : "stylist"}">${escapeHtml(m.text)}</div></div>`;
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
    if (!friendRequestsCache.length) friendRequestsCache = await api().loadFriendRequests(uid()).catch(() => []);
    return openFriendListingSheet(tile.dataset.friendListing);
  }

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast(ok);
    } catch (err) {
      setFriendsStatus(friendlyError(err, "That didn't work. Please try again."));
    }
    renderFriends();
  };
  const accept = e.target.closest("[data-friend-accept]");
  if (accept) return run(() => api().acceptFriendship(uid(), me(), accept.dataset.friendAccept), "Friend added 🎉");
  const decline = e.target.closest("[data-friend-decline]");
  if (decline) return run(() => api().declineFriendship(decline.dataset.friendDecline), "Request declined");
  const reqAccept = e.target.closest("[data-request-accept]");
  if (reqAccept) return run(() => api().setFriendRequestStatus(reqAccept.dataset.requestAccept, "accepted"), "Request accepted");
  const reqDecline = e.target.closest("[data-request-decline]");
  if (reqDecline) return run(() => api().setFriendRequestStatus(reqDecline.dataset.requestDecline, "declined"), "Request declined");
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
    const msg = await api().addFriendByCode(uid(), me(), input.value);
    input.value = "";
    toast(msg);
  } catch (err) {
    setFriendsStatus(friendlyError(err, "Couldn't add that friend. Please try again."));
    return;
  }
  renderFriends();
});

// Listing pop-up and message thread live in the shared sheet
$("#sheet").addEventListener("click", async (e) => {
  const ask = e.target.closest("[data-friend-ask]");
  if (!ask) return;
  const listing = friendFeedCache.find((l) => l.id === ask.dataset.listing);
  if (!listing) return;
  ask.disabled = true;
  try {
    await api().createFriendRequest(uid(), me(), listing, ask.dataset.friendAsk);
    closeSheet();
    toast(ask.dataset.friendAsk === "borrow" ? "Borrow request sent 💌" : "Swap offer sent 🔁");
    friendsTab = "requests";
    renderFriends();
  } catch {
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
    await api().sendFriendMessage(uid(), openThreadId, text);
    friendRequestsCache = await api().loadFriendRequests(uid());
    renderFriendThread(openThreadId);
    $("#friend-chat-input")?.focus();
  } catch {
    input.disabled = false;
    toast("Message not sent. Please try again.");
  }
});

// Signing out clears in-memory friend data so nothing carries into guest mode
document.addEventListener("weari:auth-changed", () => {
  if (!uid()) {
    myInviteCode = "";
    friendsCache = [];
    friendFeedCache = [];
    friendRequestsCache = [];
    openThreadId = null;
  }
  if (getCurrentScreen() === "friends") renderFriends();
});

if (pendingInviteCode) {
  setTimeout(() => toast("Open Friends to add the person who invited you"), 1200);
}
