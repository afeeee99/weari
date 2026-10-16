import { shopCheck } from "../../../shared/buying-brain.js";
import { callApi } from "../../core/api.js";
import { CATEGORIES, COLORS } from "../../core/constants.js";
import { $, toast } from "../../core/dom.js";
import { capitalize, describe, escapeHtml, formatMoney, plainText } from "../../core/format.js";
import { resizeDataUrl } from "../../core/images.js";
import { colorHex } from "../../core/placeholders.js";
import { showScreen } from "../../core/router.js";
import { getAllItems } from "../../data/items-db.js";
import { startCameraScan } from "../camera/camera.js";
import { KARMA_CONFIG } from "../karma/karma.js";
import { skipPurchase } from "../style/chat.js";
import { kv } from "../../core/kv.js";

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
let buyItemsById = new Map(); // wardrobe lookup for the result cards
function getSavedForLater() {
  try {
    const list = JSON.parse(kv.getItem(SAVED_FOR_LATER_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function saveSavedForLater(list) {
  try {
    kv.setItem(SAVED_FOR_LATER_KEY, JSON.stringify(list.slice(0, 20)));
    return true;
  } catch {
    toast("Couldn't save — browser storage is full");
    return false;
  }
}
export function getConsideredNotBoughtCount() {
  try {
    return Number(kv.getItem(CONSIDERED_NOT_BOUGHT_KEY)) || 0;
  } catch {
    return 0;
  }
}
// Counted once per scan, when it ends in "I'll skip it" or "Save for later"
function recordConsideredNotBought() {
  if (!currentBuyCheck || currentBuyCheck.counted) return;
  currentBuyCheck.counted = true;
  try {
    kv.setItem(CONSIDERED_NOT_BOUGHT_KEY, String(getConsideredNotBoughtCount() + 1));
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

export async function runBuyCheck(photo, price) {
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
    buyItemsById = new Map(items.map((it) => [String(it.id), it]));
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
  const pieces = ids.map((id) => buyItemsById.get(String(id))).filter(Boolean);
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
  // Same rules as the server (shared/buying-brain.js)
  const items = await getAllItems();
  buyItemsById = new Map(items.map((it) => [String(it.id), it]));
  const wardrobe = items.map((it) => ({
    id: String(it.id),
    name: it.name || describe(it),
    category: it.category,
    color: it.color,
    occasions: it.occasions || [],
    wears: it.wearCount || 0,
  }));
  const r = currentBuyCheck.result;
  const local = shopCheck({ category, color, occasions: r.occasions || [] }, wardrobe);
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
      renderSavedForLater();
    }
  }

  if (action === "swap") {
    closeBuyCheckView();
    showScreen("swap");
  }
});

$("#btn-buying-brain")?.addEventListener("click", () => startCameraScan("buycheck"));

export function renderSavedForLater() {
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
