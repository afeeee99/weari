import { callApi } from "../../core/api.js";
import { $, toast } from "../../core/dom.js";
import { describe, describeHtml, escapeHtml } from "../../core/format.js";
import { kv } from "../../core/kv.js";
import { itemIllustration } from "../../core/placeholders.js";
import { showScreen } from "../../core/router.js";
import { closeSheet } from "../../core/sheet.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { isCloudReady } from "../account/account.js";
import { getFriendShares, syncSharedListingStatus } from "../friends/friends.js";
import { getCompletedSwapsCount } from "../insights/impact.js";
import { KARMA_CONFIG, awardKarma } from "../karma/karma.js";
import { getRewearRequests } from "../swap/swap.js";

// =====================================================
// Rewear: Sell, Swap and Donate (demo — no payments, no pickup yet)
//   weari_listings: [{ id, itemId, type: "sell" | "donate", status, title, description,
//                      price, currency, center, itemName, category, color, createdAt, soldAt, donatedAt }]
//   weari_earnings: { currency: "LKR", total, entries: [{ listingId, itemName, amount, soldAt }] }
//   Swaps reuse the existing swap feed: an item marked swappable is "Listed", and a swap
//   request offering it is "Pending" (or "Swapped" once completed).
// =====================================================
export const LISTINGS_KEY = "weari_listings";
export const EARNINGS_KEY = "weari_earnings";
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

export function getListings() {
  try {
    const list = JSON.parse(kv.getItem(LISTINGS_KEY) || "[]");
    if (Array.isArray(list)) return list.filter((l) => l && l.id && l.itemId);
  } catch {}
  return [];
}

function saveListings(list) {
  try {
    kv.setItem(LISTINGS_KEY, JSON.stringify(list));
  } catch {
    toast("Couldn't save — browser storage is full or blocked");
  }
}

export function getEarnings() {
  try {
    const raw = JSON.parse(kv.getItem(EARNINGS_KEY) || "null");
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
    kv.setItem(EARNINGS_KEY, JSON.stringify(earnings));
  } catch {}
}

export function formatLkr(amount) {
  return `${REWEAR_CURRENCY} ${Math.round(Number(amount) || 0).toLocaleString("en-LK")}`;
}

// Where one item is in its Rewear journey, or null if it's just in the closet
export function getRewearStatus(item, listings = getListings(), requests = getRewearRequests()) {
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
export function rewearSheetSection(item) {
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
        <button type="button" class="rewear-action" data-rewear-action="sell" data-rewear-item="${escapeHtml(item.id)}"><span>🏷️</span>Sell</button>
        <button type="button" class="rewear-action" data-rewear-action="swap" data-rewear-item="${escapeHtml(item.id)}"><span>🔁</span>Swap</button>
        <button type="button" class="rewear-action" data-rewear-action="donate" data-rewear-item="${escapeHtml(item.id)}"><span>💚</span>Donate</button>
      </div>
    </div>`;
}

function rewearItemHtml(item) {
  return `
    <img src="${escapeHtml(item.photo)}" alt="${describeHtml(item)}" />
    <div>
      <strong>${escapeHtml(describe(item))}</strong>
      <small>${escapeHtml(item.category || "")}${item.color ? ` · ${escapeHtml(item.color)}` : ""}</small>
    </div>`;
}

async function getRewearItem() {
  if (!rewearItemId) return null;
  return (await getAllItems()).find((x) => x.id === rewearItemId) || null;
}

export function openRewearFlow(action, itemId) {
  rewearItemId = itemId;
  closeSheet();
  showScreen(`rewear-${action}`);
}

// ---------- Sell ----------
export async function renderSellScreen() {
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
export async function renderRewearSwapScreen() {
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
export async function renderDonateScreen() {
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
export async function renderMyRewear() {
  const [items, listings, requests] = [await getAllItems(), getListings(), getRewearRequests()];
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
            <img src="${escapeHtml(r.photo)}" alt="" />
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
              (r.type === "sell" || r.type === "swap") && r.status === "Listed" && isCloudReady()
                ? `<label class="toggle-row share-toggle">
                     <span>Share with friends</span>
                     <input type="checkbox" data-share-key="${escapeHtml(r.shareKey)}" data-share-item="${escapeHtml(r.itemId)}" data-share-listing="${r.listing ? escapeHtml(r.listing.id) : ""}" data-share-type="${r.type}" ${shares[r.shareKey] ? "checked" : ""} />
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
export function getRewearCounts() {
  const listings = getListings();
  return {
    sold: listings.filter((l) => l.status === "Sold").length,
    donated: listings.filter((l) => l.status === "Donated").length,
    swapped: getCompletedSwapsCount(),
    earned: getEarnings().total,
  };
}
