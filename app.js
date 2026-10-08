// =====================================================
// Weari — wardrobe app
// Everything is saved in the browser (IndexedDB), so
// no server or database is needed yet.
// =====================================================

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
// Storage (IndexedDB = the browser's built-in database)
// =====================================================
const DB_NAME = "weari";
const STORE = "items";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbRun(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

const getAllItems = () => dbRun("readonly", (s) => s.getAll());
const saveItem = (item) => dbRun("readwrite", (s) => s.put(item));
const deleteItem = (id) => dbRun("readwrite", (s) => s.delete(id));

// =====================================================
// Photo: shrink it before saving so storage stays small
// =====================================================
function resizeImage(file, maxSize = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
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
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.go === name));
  window.scrollTo(0, 0);
  if (name === "wardrobe") renderWardrobe();
  if (name === "style") renderStyleOccasions();
  if (name === "swap") renderSwap();
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
  const items = (await getAllItems()).sort((a, b) => b.createdAt - a.createdAt);
  $("#item-count").textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "";

  $("#empty-state").hidden = items.length > 0;
  $("#filters").hidden = items.length === 0;
  renderFilters(items);

  const shown = items.filter((it) =>
    activeFilter === "all" ? true : activeFilter === "swap" ? it.swappable : it.category === activeFilter
  );

  $("#grid").innerHTML = shown
    .map(
      (it) => `
      <article class="card">
        <img src="${it.photo}" alt="${it.color} ${it.category}" loading="lazy" />
        ${it.swappable ? `<span class="swap-badge">Swap</span>` : ""}
        <button class="delete-btn" data-delete="${it.id}" aria-label="Delete item">×</button>
        <div class="card-body">
          <div class="card-top">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="card-cat">${it.color} ${it.category}</span>
          </div>
          <div class="tags">${it.occasions.map((o) => `<span class="tag">${o}</span>`).join("")}</div>
        </div>
      </article>`
    )
    .join("");

  if (items.length && !shown.length) {
    $("#grid").innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted)">Nothing here yet.</p>`;
  }
}

$("#grid").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete]");
  if (!btn) return;
  if (!confirm("Remove this item from your wardrobe?")) return;
  await deleteItem(btn.dataset.delete);
  renderWardrobe();
  toast("Item removed");
});

// =====================================================
// Add item screen
// =====================================================
const form = {
  photo: null,
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

// Photo upload
$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    form.photo = await resizeImage(file);
    $("#photo-preview").src = form.photo;
    $("#photo-preview").hidden = false;
    $("#photo-placeholder").hidden = true;
  } catch (err) {
    showError(err.message);
  }
});

function showError(msg) {
  const el = $("#form-error");
  el.textContent = msg;
  el.hidden = !msg;
}

function resetForm() {
  form.photo = null;
  form.category = null;
  form.color = null;
  form.occasions.clear();
  $("#add-form").reset();
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

  await saveItem({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    photo: form.photo,
    category: form.category,
    color: form.color,
    occasions: [...form.occasions],
    swappable: $("#swap-input").checked,
    createdAt: Date.now(),
  });

  resetForm();
  activeFilter = "all";
  showScreen("wardrobe");
  toast("Added to your wardrobe ✨");
});

// =====================================================
// Style me screen
// (the outfit-picking rules live in stylist.js)
// =====================================================
let styleOccasion = null;
let lastOutfitIds = [];

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

async function showSuggestion() {
  if (!styleOccasion) return;
  const items = await getAllItems();
  const result = await suggestOutfit(items, styleOccasion, lastOutfitIds);
  const box = $("#style-result");

  if (result.missing) {
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">🧺</div>
        <p>${result.missing}</p>
        <button class="btn-secondary" data-go="add">Add item</button>
      </div>`;
    return;
  }

  lastOutfitIds = result.outfit.map((p) => p.item.id);
  box.innerHTML = `
    <h3 class="outfit-title">Your ${styleOccasion} look</h3>
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
          </div>
        </article>`
        )
        .join("")}
    </div>
    ${result.repeated ? `<p class="hint-text">That’s the only combination for now. Add more ${styleOccasion} pieces for variety.</p>` : ""}
    <button id="try-another" class="btn-secondary btn-block">↻ Try another</button>`;
  box.classList.remove("fade-in");
  void box.offsetWidth; // restart the fade animation
  box.classList.add("fade-in");
}

$("#suggest-btn").addEventListener("click", showSuggestion);
$("#style-result").addEventListener("click", (e) => {
  if (e.target.closest("#try-another")) showSuggestion();
});

// =====================================================
// Swap screen (Rewear)
// (sample listings live in swap-data.js)
// =====================================================
const REQUESTS_KEY = "weari-swap-requests";
let swapTab = "feed";

// Swap requests are small, so they're kept in localStorage
function getRequests() {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY)) || [];
  } catch {
    return [];
  }
}
function saveRequests(list) {
  try {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(list));
  } catch {
    toast("Couldn't save — browser storage is full or blocked");
  }
}

const describe = (it) => `${it.color} ${it.category}`;
const tagsHtml = (occasions) => `<div class="tags">${occasions.map((o) => `<span class="tag">${o}</span>`).join("")}</div>`;
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

  // --- Feed ---
  const requested = new Set(requests.map((r) => r.listingId));
  $("#swap-feed").innerHTML = listings
    .map(
      (l) => `
      <article class="card">
        <img src="${l.photo}" alt="${l.title}" loading="lazy" />
        <span class="member-badge"><span class="avatar">${l.member[0]}</span>${l.member}</span>
        <div class="card-body">
          <div class="listing-title">${l.title}</div>
          <div class="card-top">
            <span class="dot" style="background:${colorHex(l.color)}"></span>
            <span class="card-meta">${describe(l)}</span>
          </div>
          ${tagsHtml(l.occasions)}
          ${
            requested.has(l.id)
              ? `<button class="btn-small done" disabled>✓ Requested</button>`
              : `<button class="btn-small" data-interested="${l.id}">I’m interested</button>`
          }
        </div>
      </article>`
    )
    .join("");

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
          const theirs = listingById[r.listingId] || r.listing;
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
                for ${theirs.member}’s <strong>${theirs.title}</strong></div>
              <div class="request-meta">
                <span class="status">Pending</span>
                <span>${new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
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

$("#sheet").addEventListener("click", (e) => {
  if (e.target.closest("[data-close-sheet]")) return closeSheet();

  const option = e.target.closest("[data-offer]");
  if (option) {
    offerChoice = option.dataset.offer;
    document.querySelectorAll("[data-offer]").forEach((b) => b.classList.toggle("selected", b === option));
    $("#send-request").disabled = false;
  }

  if (e.target.closest("#send-request") && offerChoice) {
    const { photo, ...listing } = offerFor; // keep a small copy of the listing
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
    openSheet(`
      <div class="success">
        <div class="success-icon">🎉</div>
        <h3>Swap request sent!</h3>
        <p>Your offer for ${offerFor.member}’s ${offerFor.title} is saved in <strong>My requests</strong>.</p>
        <button class="btn-primary btn-block" data-close-sheet>Done</button>
      </div>`);
    renderSwap();
  }
});

// ---------- Start ----------
buildAddForm();
showScreen("wardrobe");
