import { callApi } from "../../core/api.js";
import { $, toast } from "../../core/dom.js";
import { describeHtml, escapeHtml, formatLastWorn, plainText } from "../../core/format.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { KARMA_CONFIG, awardKarma, unlockBadge, updateKarmaStreak } from "../karma/karma.js";
import { getSavedOutfits, renderSavedOutfits, saveSavedOutfits } from "./saved-outfits.js";
import { labelState } from "./labels.js";

// Manual Outfit Slot State
export const manualSlots = {
  top: null,
  "bottom-or-dress": null,
  shoes: null,
  outerwear: null,
  accessory: null,
};

let activePickerSlot = null;

export function renderManualOutfit() {
  const slotKeys = ["top", "bottom-or-dress", "shoes", "outerwear", "accessory"];
  const slotLabels = {
    top: "Pick top",
    "bottom-or-dress": "Pick bottom or dress",
    shoes: "Pick shoes",
    outerwear: "Pick outerwear",
    accessory: "Pick accessory",
  };

  slotKeys.forEach((key) => {
    const bodyEl = $(`#slot-body-${key}`);
    if (!bodyEl) return;
    const item = manualSlots[key];

    if (!item) {
      bodyEl.innerHTML = `
        <button type="button" class="slot-pick-btn" data-slot-target="${key}">
          <span class="slot-plus">+</span>
          <span class="slot-text">${slotLabels[key]}</span>
        </button>`;
    } else {
      bodyEl.innerHTML = `
        <div class="slot-filled-card">
          <img src="${item.photo}" alt="${describeHtml(item)}" />
          <button type="button" class="slot-remove-btn" data-remove-slot="${key}" title="Remove piece" aria-label="Remove piece">✕</button>
          <div class="slot-filled-overlay">
            <span class="slot-filled-name">${describeHtml(item)}</span>
          </div>
        </div>`;
    }
  });
}

// Slot picker bottom sheet
async function openSlotPicker(slotKey) {
  activePickerSlot = slotKey;
  const sheet = $("#slot-picker-sheet");
  const backdrop = $("#slot-picker-backdrop");
  const title = $("#slot-picker-title");
  const sub = $("#slot-picker-sub");
  const grid = $("#slot-picker-grid");

  const slotFriendly = {
    top: "Top",
    "bottom-or-dress": "Bottom or Dress",
    shoes: "Shoes",
    outerwear: "Outerwear",
    accessory: "Accessory",
  };

  if (title) title.textContent = `Pick ${slotFriendly[slotKey] || "piece"}`;
  if (sub) sub.textContent = "Choose an item from your wardrobe";

  const allItems = await getAllItems();
  let matching = [];

  if (slotKey === "top") {
    matching = allItems.filter((it) => it.category === "top");
  } else if (slotKey === "bottom-or-dress") {
    matching = allItems.filter((it) => it.category === "bottom" || it.category === "dress");
  } else if (slotKey === "shoes") {
    matching = allItems.filter((it) => it.category === "shoes");
  } else if (slotKey === "outerwear") {
    matching = allItems.filter((it) => it.category === "outerwear");
  } else if (slotKey === "accessory") {
    matching = allItems.filter((it) => it.category === "accessory");
  }

  if (matching.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 24px 10px; color: var(--muted);">
        <p style="margin: 0 0 14px; font-size: 14px;">No ${slotFriendly[slotKey].toLowerCase()} in your wardrobe yet.</p>
        <button type="button" class="btn-primary" data-go="add" data-close-slot-picker>+ Add item</button>
      </div>`;
  } else {
    grid.innerHTML = matching
      .map(
        (it) => `
      <div class="slot-picker-card" data-pick-item-id="${it.id}">
        <img src="${it.photo}" alt="${describeHtml(it)}" loading="lazy" />
        <span class="slot-picker-name">${describeHtml(it)}</span>
        <span class="slot-picker-sub">${formatLastWorn(it.lastWorn)}</span>
      </div>`
      )
      .join("");
  }

  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function closeSlotPicker() {
  const sheet = $("#slot-picker-sheet");
  const backdrop = $("#slot-picker-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  activePickerSlot = null;
}

$("#slot-picker-close")?.addEventListener("click", closeSlotPicker);
$("#slot-picker-cancel")?.addEventListener("click", closeSlotPicker);
$("#slot-picker-backdrop")?.addEventListener("click", closeSlotPicker);

$("#slot-picker-grid")?.addEventListener("click", async (e) => { if (e.target.closest("[data-close-slot-picker]")) return closeSlotPicker();
  const card = e.target.closest("[data-pick-item-id]");
  if (!card || !activePickerSlot) return;
  const id = card.dataset.pickItemId;
  const allItems = await getAllItems();
  const chosen = allItems.find((it) => it.id === id);
  if (chosen) {
    manualSlots[activePickerSlot] = chosen;
    renderManualOutfit();
    closeSlotPicker();
  }
});

// Slot interactions in Create your own
$("#style-mode-manual")?.addEventListener("click", (e) => {
  const pickBtn = e.target.closest("[data-slot-target]");
  if (pickBtn) {
    openSlotPicker(pickBtn.dataset.slotTarget);
    return;
  }

  const removeBtn = e.target.closest("[data-remove-slot]");
  if (removeBtn) {
    const key = removeBtn.dataset.removeSlot;
    manualSlots[key] = null;
    renderManualOutfit();
    return;
  }
});

$("#btn-clear-slots")?.addEventListener("click", () => {
  manualSlots.top = null;
  manualSlots["bottom-or-dress"] = null;
  manualSlots.shoes = null;
  manualSlots.outerwear = null;
  manualSlots.accessory = null;
  const reviewBox = $("#manual-review-box");
  if (reviewBox) reviewBox.hidden = true;
  renderManualOutfit();
  toast("Cleared slots");
});

// "✓ I wore this" button in Create your own
$("#btn-manual-wore")?.addEventListener("click", async () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your slots first!");
    return;
  }

  const nowIso = new Date().toISOString();
  for (const piece of activePieces) {
    piece.wearCount = (piece.wearCount || 0) + 1;
    piece.lastWorn = nowIso;
    await saveItem(piece);
  }

  updateKarmaStreak();
  recordPurchaseAvoided(1);
  awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Wore custom outfit");
  unlockBadge("rewear_rookie");

  toast(`Logged wear for all ${activePieces.length} pieces ✨`);
});

// "💾 Save" button in Create your own
$("#btn-manual-save")?.addEventListener("click", () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your slots before saving!");
    return;
  }

  const nameInput = $("#manual-outfit-name");
  const outfitName = (nameInput && nameInput.value.trim()) || "My Custom Look";

  const saved = getSavedOutfits();
  saved.unshift({
    id: String(Date.now()),
    name: outfitName,
    items: activePieces.map((it) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      color: it.color,
      photo: it.photo,
    })),
    createdAt: Date.now(),
    label: labelState.manual,
  });
  saveSavedOutfits(saved);
  awardKarma(10, "Saved custom look");
  renderSavedOutfits();
  toast(`Saved outfit "${outfitName}"! ✨`);
});

// "✨ Ask Gemini to review my look" button
$("#btn-manual-review")?.addEventListener("click", async () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your outfit slots first!");
    return;
  }

  const btn = $("#btn-manual-review");
  const reviewBox = $("#manual-review-box");
  const nameInput = $("#manual-outfit-name");
  const outfitName = (nameInput && nameInput.value.trim()) || "My Outfit";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="sparkle-icon">✨</span> Gemini is reviewing...`;
  }

  if (reviewBox) {
    reviewBox.hidden = false;
    reviewBox.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13.5px;">
        <span class="sparkle-icon">✨</span><span>Gemini is reviewing your look...</span>
      </div>`;
  }

  try {
    // Only category, color and name of each piece are sent (no photos)
    const items = activePieces.map((it) => ({
      role: it.category.charAt(0).toUpperCase() + it.category.slice(1),
      category: it.category,
      color: it.color,
      name: plainText(it.name).slice(0, 40),
    }));
    const res = await callApi("/api/review", { outfitName, items }, { timeoutMs: 20000 });
    const label = res.source === "mock" ? "✨ Stylist Review (test mode, not real Gemini)" : "✨ Stylist Review by Gemini";
    if (reviewBox) {
      reviewBox.innerHTML = `
        <div class="review-header">${label}</div>
        <p class="review-text">"${escapeHtml(res.review)}"</p>`;
    }
  } catch (err) {
    console.warn("Gemini review unavailable:", err.message);
    const msg = "Our stylist is taking a short break, but your outfit looks great! Tap to ask again in a moment.";
    if (reviewBox) {
      reviewBox.innerHTML = `
        <div class="review-header">✨ Stylist Review</div>
        <p class="review-text">${escapeHtml(msg)}</p>`;
    }
    toast("Stylist is busy right now");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="sparkle-icon">✨</span> Ask Gemini to review my look`;
    }
  }
});
