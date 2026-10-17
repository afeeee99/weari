import { $, toast } from "../../core/dom.js";
import { describe, describeHtml, escapeHtml } from "../../core/format.js";
import { kv } from "../../core/kv.js";
import { collageColor } from "../../core/collage.js";
import { colorHex } from "../../core/placeholders.js";
import { getCurrentScreen } from "../../core/router.js";
import { openSheet } from "../../core/sheet.js";
import { LEGACY_REQUEST_KEYS, getAllItems, normalizeRequest } from "../../data/items-db.js";
import { getDisplayName, getFirebase, getSignedInUser, isCloudReady } from "../account/account.js";
import { recordCompletedSwap } from "../insights/impact.js";
import { KARMA_CONFIG, awardKarma, unlockBadge } from "../karma/karma.js";
import { getSampleListings } from "./sample-listings.js";

// =====================================================
// Swap screen (Rewear)
//   Feed         real community listings (when signed in) + sample listings
//   My listings  my items marked "Available to swap"
//   Requests     swaps I asked for, and swaps people asked me for
// Requests on sample listings stay on this device; requests on community
// listings live in Firestore (src/firebase/community.js).
// =====================================================
export const REQUESTS_KEY = "weari-swap-requests"; // requests on sample listings
const COUNTED_KEY = "weari_counted_swaps"; // community swaps already rewarded (so karma is given once)
const COMPLETED_SWAP_POINTS = 25;
let swapTab = "feed";
// Swipe deck: listings skipped this visit (kept in memory only, no storage key)
const swapSkipped = new Set();
const SWAP_DEMO_ACCEPT_MS = 2000; // sample members "accept" after 2 seconds
const SWIPE_THRESHOLD = 90; // px to drag before a card counts as liked/skipped

const community = { listings: [], sent: [], received: [], loaded: false, stop: [] };
const lastStatus = new Map(); // request id -> status seen last time (to notice changes)

// ---------- Sample-listing requests (on this device) ----------
export function getRequests() {
  try {
    const raw = kv.getItem(REQUESTS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list.map(normalizeRequest).filter(Boolean);
    }
    for (const key of LEGACY_REQUEST_KEYS) {
      const legacyRaw = kv.getItem(key);
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
export function saveRequests(list) {
  try {
    kv.setItem(REQUESTS_KEY, JSON.stringify(list));
  } catch {
    toast("Couldn't save — browser storage is full or blocked");
  }
}

// All requests I sent (sample + community), for counts on Profile
export const getAllSentRequestsCount = () => getRequests().length + community.sent.length;

// Every swap I offered one of my pieces in (sample + community), for My Rewear's statuses
export function getRewearRequests() {
  const cloud = community.sent
    .filter((r) => r.status !== "declined")
    .map((r) => ({ offeredItemId: r.offered?.itemId, status: r.status === "completed" ? "completed" : "pending" }));
  return [...getRequests(), ...cloud];
}

// ---------- Community data (live from Firestore while signed in) ----------
function stopCommunity() {
  community.stop.forEach((fn) => fn());
  Object.assign(community, { listings: [], sent: [], received: [], loaded: false, stop: [] });
  lastStatus.clear();
  updateSwapBadge();
}

function startCommunity(user) {
  stopCommunity();
  const firebase = getFirebase();
  if (!firebase || !user) return;
  community.stop.push(
    firebase.watchListings(
      (list) => {
        community.listings = list;
        community.loaded = true;
        rerenderIfVisible();
      },
      () => {
        community.loaded = true;
        rerenderIfVisible();
      }
    )
  );
  community.stop.push(
    firebase.watchSwapRequests(user.uid, ({ sent, received }) => {
      noticeChanges([...sent, ...received], received);
      community.sent = sent;
      community.received = received;
      updateSwapBadge();
      rerenderIfVisible();
    })
  );
}

document.addEventListener("weari:auth-changed", (e) => startCommunity(e.detail.user));

function rerenderIfVisible() {
  if (getCurrentScreen() === "swap") renderSwap();
}

function countedIds() {
  try {
    return JSON.parse(kv.getItem(COUNTED_KEY)) || [];
  } catch {
    return [];
  }
}

// Give karma + impact once per completed community swap (on each side)
function rewardCompletedSwap(requestId) {
  const counted = countedIds();
  if (counted.includes(requestId)) return;
  kv.setItem(COUNTED_KEY, JSON.stringify([...counted, requestId].slice(-200)));
  recordCompletedSwap(1);
  awardKarma(COMPLETED_SWAP_POINTS, "Completed swap");
}

function noticeChanges(all, received) {
  const firstLoad = lastStatus.size === 0;
  for (const r of all) {
    const before = lastStatus.get(r.id);
    if (!firstLoad && before !== r.status) {
      if (!before && received.includes(r)) toast(`New swap request from ${r.fromName} 💌`);
      if (r.status === "accepted" && before === "pending" && !received.includes(r)) toast(`${r.listing?.ownerName || "They"} accepted your swap 🎉`);
    }
    if (r.status === "completed" && before && before !== "completed") rewardCompletedSwap(r.id);
    lastStatus.set(r.id, r.status);
  }
}

// Little number on the Swap tab: requests waiting for my answer
function updateSwapBadge() {
  const waiting = community.received.filter((r) => r.status === "pending").length;
  document.querySelectorAll('.tab[data-go="swap"]').forEach((tab) => {
    let badge = tab.querySelector(".tab-badge");
    if (!waiting) return badge?.remove();
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "tab-badge";
      tab.appendChild(badge);
    }
    badge.textContent = waiting;
  });
}

// ---------- Rendering ----------
export const tagsHtml = (occasions) => `<div class="tags">${(occasions || []).map((o) => `<span class="tag">${escapeHtml(o)}</span>`).join("")}</div>`;

const myItemCard = (it, listed) => `
  <article class="card">
    <img src="${escapeHtml(it.photo)}" alt="${describeHtml(it)}" loading="lazy" />
    ${listed ? `<span class="swap-badge live">Live</span>` : ""}
    <div class="card-body">
      <div class="card-top">
        <span class="dot" style="background:${colorHex(it.color)}"></span>
        <span class="card-cat">${describeHtml(it)}</span>
      </div>
      ${tagsHtml(it.occasions)}
    </div>
  </article>`;

// Sample and community listings in one shape: { key, member, title, category, color, occasions, photo, sample }
async function getFeed() {
  const user = getSignedInUser();
  const samples = (await getSampleListings()).map((l) => ({ ...l, key: `sample:${l.id}` }));
  const real = user
    ? community.listings
        .filter((l) => l.ownerUid !== user.uid)
        .map((l) => ({ ...l, key: `cloud:${l.id}`, member: l.ownerName || "Weari member", sample: false }))
    : [];
  return { real, samples };
}

function feedBanner() {
  const user = getSignedInUser();
  if (!isCloudReady() || user) return "";
  return `
    <div class="swap-banner">
      <div><strong>Swap with real people</strong><small>You’re seeing sample listings. Sign in to see what the community is offering.</small></div>
      <button type="button" class="btn-primary" data-auth-open="signin">Sign in</button>
    </div>`;
}

const STATUS_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  completed: "✓ Completed",
};

function requestRow({ id, mineImg, theirsImg, text, status, date, actions, note }) {
  return `
    <div class="request">
      <div class="request-pics">
        ${mineImg ? `<img src="${escapeHtml(mineImg)}" alt="" />` : `<div class="pic-gone"></div>`}
        <span class="swap-arrow">⇄</span>
        ${theirsImg ? `<img src="${escapeHtml(theirsImg)}" alt="" />` : `<div class="pic-gone"></div>`}
      </div>
      <div class="request-info">
        <div class="request-text">${text}</div>
        ${note ? `<div class="request-note">${note}</div>` : ""}
        <div class="request-meta">
          <span class="status status-${status}">${STATUS_LABELS[status] || "Pending"}</span>
          <span>${new Date(date || Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          ${actions}
        </div>
      </div>
    </div>`;
}

export async function renderSwap() {
  const [{ real, samples }, items] = await Promise.all([getFeed(), getAllItems()]);
  acceptDueDemoRequests();
  const localRequests = getRequests();
  const mine = items.filter((it) => it.swappable);
  const user = getSignedInUser();
  const waiting = community.received.filter((r) => r.status === "pending").length;

  // Tabs (with counts)
  const counts = { listings: mine.length, requests: localRequests.length + community.sent.length + community.received.length };
  document.querySelectorAll("[data-swap-tab]").forEach((b) => {
    const tab = b.dataset.swapTab;
    b.classList.toggle("active", tab === swapTab);
    const label = { feed: "Feed", listings: "My listings", requests: "Requests" }[tab];
    const n = tab === "requests" && waiting ? waiting : counts[tab];
    b.innerHTML = n ? `${label} <span class="seg-count ${tab === "requests" && waiting ? "alert" : ""}">${n}</span>` : label;
  });
  $("#swap-feed").hidden = swapTab !== "feed";
  $("#swap-listings").hidden = swapTab !== "listings";
  $("#swap-requests").hidden = swapTab !== "requests";

  // --- Feed: one big card at a time (community listings first, then samples) ---
  const requested = new Set([...localRequests.map((r) => `sample:${r.listingId}`), ...community.sent.map((r) => `cloud:${r.listingId}`)]);
  const all = [...real, ...samples];
  const deck = all.filter((l) => !requested.has(l.key) && !swapSkipped.has(l.key));
  const top = deck[0];
  const loadingNote = user && !community.loaded ? `<p class="swap-demo-note">Loading the community feed…</p>` : "";
  $("#swap-feed").innerHTML = top
    ? `
      ${feedBanner()}
      ${loadingNote}
      ${top.sample ? `<p class="swap-demo-note">Sample piece: requests and replies are simulated.</p>` : ""}
      <div class="swap-deck collage-${collageColor(all.length - deck.length)}">
        <article class="swap-card" id="swap-card" data-swap-card="${escapeHtml(top.key)}">
          <div class="swap-card-media">
            <img src="${escapeHtml(top.photo)}" alt="${escapeHtml(top.title)}" draggable="false" />
            <span class="member-badge"><span class="avatar">${escapeHtml((top.member || "?")[0])}</span>${escapeHtml(top.member)}</span>
            ${top.sample ? `<span class="sample-badge" title="Example listing">Sample</span>` : ""}
            <span class="swap-stamp swap-stamp-like">LIKE</span>
            <span class="swap-stamp swap-stamp-skip">SKIP</span>
          </div>
          <div class="card-body">
            <div class="listing-title">${escapeHtml(top.title)}</div>
            <div class="card-top">
              <span class="dot" style="background:${colorHex(top.color)}"></span>
              <span class="card-meta">${escapeHtml(describe({ color: top.color, category: top.category }))}</span>
            </div>
            ${tagsHtml(top.occasions)}
          </div>
        </article>
      </div>
      <div class="swap-deck-actions">
        <button type="button" class="swap-deck-btn skip" data-swap-skip aria-label="Skip">✕ <span>Skip</span></button>
        <span class="swap-deck-count">${all.length - deck.length + 1} of ${all.length}</span>
        <button type="button" class="swap-deck-btn like" data-swap-like aria-label="Like and offer a swap">♥ <span>Like</span></button>
      </div>`
    : `${feedBanner()}
      <div class="notice">
        <div class="notice-icon">✨</div>
        <p>You’ve seen every piece for now.</p>
        ${swapSkipped.size ? `<button class="btn-secondary" data-swap-reset>See skipped pieces again</button>` : `<button class="btn-secondary" data-swap-goto="requests">View my requests</button>`}
      </div>`;
  bindSwapCardDrag();

  // --- My listings ---
  const sharing = user ? `<p class="section-sub swap-listing-note">✓ Your listed pieces are visible to the Weari community.</p>` : isCloudReady() ? `<p class="section-sub swap-listing-note">Sign in to share your listed pieces with the community.</p>` : "";
  $("#swap-listings").innerHTML = mine.length
    ? `${sharing}<div class="grid">${mine.map((it) => myItemCard(it, Boolean(user))).join("")}</div>`
    : `<div class="notice">
        <div class="notice-icon">🔁</div>
        <p>You haven’t listed anything yet.<br />When adding an item, switch on <strong>Available to swap</strong>.</p>
        <button class="btn-secondary" data-go="add">Add item</button>
      </div>`;

  // --- Requests ---
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const sampleById = Object.fromEntries(samples.map((l) => [l.id, l]));

  const receivedHtml = community.received
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) =>
      requestRow({
        id: r.id,
        mineImg: r.listing?.photo,
        theirsImg: r.offered?.photo,
        text: `<strong>${escapeHtml(r.fromName)}</strong> offers their <strong>${escapeHtml(r.offered?.title || "item")}</strong> for your <strong>${escapeHtml(r.listing?.title || "item")}</strong>`,
        status: r.status,
        date: r.createdAt,
        note: r.status === "accepted" ? "Arrange the handover with them, then mark it completed." : "",
        actions:
          r.status === "pending"
            ? `<button class="link-btn strong" data-swap-accept="${r.id}">Accept</button><button class="link-btn" data-swap-decline="${r.id}">Decline</button>`
            : r.status === "accepted"
              ? `<button class="link-btn strong" data-swap-complete="${r.id}">Mark completed</button>`
              : "",
      })
    )
    .join("");

  const sentCloud = community.sent.map((r) => ({
    createdAt: r.createdAt,
    html: requestRow({
      id: r.id,
      mineImg: r.offered?.photo,
      theirsImg: r.listing?.photo,
      text: `Your <strong>${escapeHtml(r.offered?.title || "item")}</strong> for ${escapeHtml(r.listing?.ownerName || "member")}’s <strong>${escapeHtml(r.listing?.title || "item")}</strong>`,
      status: r.status,
      date: r.createdAt,
      note: r.status === "accepted" ? `🎉 Accepted! Arrange the handover with ${escapeHtml(r.listing?.ownerName || "them")}.` : "",
      actions:
        r.status === "pending"
          ? `<button class="link-btn" data-swap-cancel="${r.id}">Cancel</button>`
          : r.status === "accepted"
            ? `<button class="link-btn strong" data-swap-complete="${r.id}">Mark completed</button>`
            : r.status === "declined"
              ? `<button class="link-btn" data-swap-cancel="${r.id}">Remove</button>`
              : "",
    }),
  }));
  const sentLocal = localRequests.map((r) => {
    const theirs = sampleById[r.listingId] || r.listing || { member: "Community member", title: "Swap item", photo: "" };
    const offered = byId[r.offeredItemId];
    const done = r.status === "completed";
    const accepted = r.status === "accepted";
    return {
      createdAt: r.createdAt,
      html: requestRow({
        id: r.id,
        mineImg: offered?.photo,
        theirsImg: theirs.photo,
        text: `Your <strong>${offered ? describeHtml(offered) : "removed item"}</strong> for ${escapeHtml(theirs.member || "member")}’s <strong>${escapeHtml(theirs.title || "item")}</strong> <span class="sample-inline">sample</span>`,
        status: done ? "completed" : accepted ? "accepted" : "pending",
        date: r.createdAt,
        note: accepted ? `🎉 ${escapeHtml(theirs.member || "They")} accepted (demo).` : "",
        actions: `${accepted ? `<button class="link-btn strong" data-open-swap-chat="${r.id}">Open chat</button>` : ""}${done ? "" : `<button class="link-btn" data-complete-request="${r.id}">Mark completed</button>`}<button class="link-btn" data-cancel-request="${r.id}">${done ? "Remove" : "Cancel"}</button>`,
      }),
    };
  });
  const sentHtml = [...sentCloud, ...sentLocal]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((x) => x.html)
    .join("");

  $("#swap-requests").innerHTML =
    receivedHtml || sentHtml
      ? `${receivedHtml ? `<h3 class="section-heading">Requests for your pieces</h3>${receivedHtml}` : ""}
         ${sentHtml ? `<h3 class="section-heading">Your requests</h3>${sentHtml}` : ""}`
      : `<div class="notice">
          <div class="notice-icon">💌</div>
          <p>No swap requests yet.<br />Tap <strong>I’m interested</strong> on something in the feed.</p>
          <button class="btn-secondary" data-swap-goto="feed">Browse the feed</button>
        </div>`;
}

document.querySelector("#swap-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-swap-tab]");
  if (!btn) return;
  swapTab = btn.dataset.swapTab;
  renderSwap();
});

async function updateCommunityRequest(id, status, message) {
  try {
    await getFirebase().setSwapRequestStatus(id, status);
    if (status === "completed") rewardCompletedSwap(id);
    toast(message);
  } catch (err) {
    console.warn("Swap update failed:", err.code || err);
    toast("Couldn’t update the swap. Check your connection and try again.");
  }
}

document.querySelector("#screen-swap").addEventListener("click", async (e) => {
  const goto = e.target.closest("[data-swap-goto]");
  if (goto) {
    swapTab = goto.dataset.swapGoto;
    renderSwap();
  }
  const interested = e.target.closest("[data-interested]");
  if (interested) openOfferSheet(interested.dataset.interested);

  // Swipe deck buttons
  if (e.target.closest("[data-swap-like]")) return swipeSwapCard("right");
  if (e.target.closest("[data-swap-skip]")) return swipeSwapCard("left");
  if (e.target.closest("[data-swap-reset]")) {
    swapSkipped.clear();
    renderSwap();
    return;
  }
  const chatBtn = e.target.closest("[data-open-swap-chat]");
  if (chatBtn) return openSwapChat(chatBtn.dataset.openSwapChat);

  // Community requests
  const accept = e.target.closest("[data-swap-accept]");
  if (accept) return updateCommunityRequest(accept.dataset.swapAccept, "accepted", "Swap accepted 🎉");
  const decline = e.target.closest("[data-swap-decline]");
  if (decline) return updateCommunityRequest(decline.dataset.swapDecline, "declined", "Request declined");
  const completeCloud = e.target.closest("[data-swap-complete]");
  if (completeCloud) return updateCommunityRequest(completeCloud.dataset.swapComplete, "completed", "Swap completed! Circular impact updated 🌱");
  const cancelCloud = e.target.closest("[data-swap-cancel]");
  if (cancelCloud) {
    try {
      await getFirebase().cancelSwapRequest(cancelCloud.dataset.swapCancel);
      toast("Request removed");
    } catch {
      toast("Couldn’t remove the request. Please try again.");
    }
    return;
  }

  // Sample-listing requests (this device)
  const complete = e.target.closest("[data-complete-request]");
  if (complete) {
    const list = getRequests();
    const targetReq = list.find((r) => r.id === complete.dataset.completeRequest);
    if (targetReq) {
      targetReq.status = "completed";
      saveRequests(list);
      recordCompletedSwap(1);
      awardKarma(COMPLETED_SWAP_POINTS, "Completed swap");
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
let offerFor = null; // the listing being requested
let offerChoice = null; // id of my item being offered

async function openOfferSheet(listingKey) {
  const [{ real, samples }, items] = await Promise.all([getFeed(), getAllItems()]);
  offerFor = [...real, ...samples].find((l) => l.key === listingKey);
  if (!offerFor) return;
  offerChoice = null;
  const mine = items.filter((it) => it.swappable);

  const header = `
    <div class="sheet-header">
      <img src="${escapeHtml(offerFor.photo)}" alt="" />
      <div>
        <h3>Offer a swap</h3>
        <p>for ${escapeHtml(offerFor.member)}’s ${escapeHtml(offerFor.title)}</p>
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
          <img src="${escapeHtml(it.photo)}" alt="${describeHtml(it)}" />
          <span>${describeHtml(it)}</span>
        </button>`
        )
        .join("")}
    </div>
    <button id="send-request" class="btn-primary btn-block" disabled>Send swap request</button>
    <button class="link-btn sheet-cancel" data-close-sheet>Cancel</button>`);
}

function showRequestSent(demoRequestId) {
  awardKarma(KARMA_CONFIG.POINTS.SEND_SWAP_REQUEST, "Sent swap request");
  unlockBadge("first_swap_request");
  openSheet(`
    <div class="success">
      <div class="success-icon">🎉</div>
      <h3>Swap request sent!</h3>
      <p>Your offer for ${escapeHtml(offerFor.member)}’s ${escapeHtml(offerFor.title)} is in <strong>Requests</strong>.${offerFor.sample ? "" : " You’ll see it here when they answer."}</p>
      ${demoRequestId ? `<p class="swap-waiting" data-waiting-request="${demoRequestId}">⏳ Waiting for a reply… <small>(demo)</small></p>` : ""}
      <button class="btn-primary btn-block" data-close-sheet>Done</button>
    </div>`);
  renderSwap();
}

$("#sheet").addEventListener("click", async (e) => {
  const option = e.target.closest("[data-offer]");
  if (option) {
    offerChoice = option.dataset.offer;
    document.querySelectorAll("[data-offer]").forEach((b) => b.classList.toggle("selected", b === option));
    $("#send-request").disabled = false;
  }

  const sendBtn = e.target.closest("#send-request");
  if (!sendBtn || !offerChoice || !offerFor) return;

  if (offerFor.sample) {
    const { photo, key, ...listing } = offerFor;
    const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    saveRequests([
      ...getRequests(),
      {
        id: requestId,
        listingId: offerFor.id,
        listing,
        offeredItemId: offerChoice,
        status: "pending",
        demo: true, // simulated: accepted automatically after 2 seconds
        createdAt: Date.now(),
      },
    ]);
    setTimeout(() => acceptDemoRequest(requestId), SWAP_DEMO_ACCEPT_MS);
    showRequestSent(requestId);
    return;
  }

  // Community listing: the request goes to the other member through Firestore
  const user = getSignedInUser();
  const firebase = getFirebase();
  if (!user || !firebase) return toast("Please sign in to swap with the community");
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";
  try {
    const item = (await getAllItems()).find((it) => it.id === offerChoice);
    const photo = await firebase.uploadPhoto(user.uid, item.photo);
    await firebase.sendSwapRequest(user.uid, getDisplayName(), offerFor, { ...item, photo });
    showRequestSent();
  } catch (err) {
    console.warn("Swap request failed:", err.code || err);
    sendBtn.disabled = false;
    sendBtn.textContent = "Send swap request";
    toast("Couldn’t send the request. Check your connection and try again.");
  }
});

// ---------- Swipe deck: drag right to like, left to skip ----------
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
  const key = card.dataset.swapCard;
  card.classList.add("flying");
  card.style.setProperty(direction === "right" ? "--like" : "--skip", 1);
  card.style.transform = `translateX(${direction === "right" ? 140 : -140}%) rotate(${direction === "right" ? 18 : -18}deg)`;
  setTimeout(() => {
    if (direction === "left") {
      swapSkipped.add(key);
      renderSwap();
      return;
    }
    // Liked: the card comes back until a request is actually sent
    card.classList.remove("flying");
    resetSwapCard(card);
    openOfferSheet(key);
  }, 260);
}

// ---------- Sample members: simulated reply after 2 seconds, then a demo chat ----------
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
  rerenderIfVisible();
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
  const samples = await getSampleListings();
  const theirs = samples.find((l) => l.id === r.listingId) || r.listing || {};
  const member = theirs.member || "Community member";
  const messages = Array.isArray(r.messages) ? r.messages : [];

  openSheet(`
    <div class="sheet-header">
      ${theirs.photo ? `<img src="${escapeHtml(theirs.photo)}" alt="" />` : ""}
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
  const text = $("#swap-chat-input").value.trim();
  if (!text || !swapChatId) return;
  const list = getRequests();
  const r = list.find((x) => x.id === swapChatId);
  if (!r) return;
  r.messages = [...(Array.isArray(r.messages) ? r.messages : []), { from: "me", text, at: Date.now() }];
  saveRequests(list);
  openSwapChat(swapChatId).then(() => $("#swap-chat-input")?.focus());
});
