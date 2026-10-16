import { $, toast } from "../../core/dom.js";
import { describe, describeHtml, escapeHtml } from "../../core/format.js";
import { kv } from "../../core/kv.js";
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

function listingCard(l, requested) {
  return `
    <article class="card listing-card">
      <img src="${escapeHtml(l.photo)}" alt="${escapeHtml(l.title)}" loading="lazy" />
      <span class="member-badge"><span class="avatar">${escapeHtml((l.member || "?")[0])}</span>${escapeHtml(l.member)}</span>
      ${l.sample ? `<span class="sample-badge" title="Example listing">Sample</span>` : ""}
      <div class="card-body">
        <div class="listing-title">${escapeHtml(l.title)}</div>
        <div class="card-top">
          <span class="dot" style="background:${colorHex(l.color)}"></span>
          <span class="card-meta">${escapeHtml(describe({ color: l.color, category: l.category }))}</span>
        </div>
        ${tagsHtml(l.occasions)}
        ${
          requested
            ? `<button class="btn-small done" disabled>✓ Requested</button>`
            : `<button class="btn-small" data-interested="${escapeHtml(l.key)}">I’m interested</button>`
        }
      </div>
    </article>`;
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

  // --- Feed ---
  const requested = new Set([...localRequests.map((r) => `sample:${r.listingId}`), ...community.sent.map((r) => `cloud:${r.listingId}`)]);
  const realSection = user
    ? real.length
      ? `<h3 class="section-heading">From the community</h3><div class="grid">${real.map((l) => listingCard(l, requested.has(l.key))).join("")}</div>`
      : community.loaded
        ? `<div class="notice flat"><p>No community listings yet. Be the first: mark a piece <strong>Available to swap</strong>.</p></div>`
        : `<div class="notice flat"><p>Loading the community feed…</p></div>`
    : "";
  $("#swap-feed").innerHTML = `
    ${feedBanner()}
    ${realSection}
    ${user ? `<h3 class="section-heading">Sample listings</h3>` : ""}
    <div class="grid">${samples.map((l) => listingCard(l, requested.has(l.key))).join("")}</div>`;

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
    return {
      createdAt: r.createdAt,
      html: requestRow({
        id: r.id,
        mineImg: offered?.photo,
        theirsImg: theirs.photo,
        text: `Your <strong>${offered ? describeHtml(offered) : "removed item"}</strong> for ${escapeHtml(theirs.member || "member")}’s <strong>${escapeHtml(theirs.title || "item")}</strong> <span class="sample-inline">sample</span>`,
        status: done ? "completed" : "pending",
        date: r.createdAt,
        actions: `${done ? "" : `<button class="link-btn" data-complete-request="${r.id}">Mark completed</button>`}<button class="link-btn" data-cancel-request="${r.id}">${done ? "Remove" : "Cancel"}</button>`,
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

function showRequestSent() {
  awardKarma(KARMA_CONFIG.POINTS.SEND_SWAP_REQUEST, "Sent swap request");
  unlockBadge("first_swap_request");
  openSheet(`
    <div class="success">
      <div class="success-icon">🎉</div>
      <h3>Swap request sent!</h3>
      <p>Your offer for ${escapeHtml(offerFor.member)}’s ${escapeHtml(offerFor.title)} is in <strong>Requests</strong>.${offerFor.sample ? "" : " You’ll see it here when they answer."}</p>
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
    saveRequests([
      ...getRequests(),
      {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        listingId: offerFor.id,
        listing,
        offeredItemId: offerChoice,
        status: "pending",
        createdAt: Date.now(),
      },
    ]);
    showRequestSent();
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
