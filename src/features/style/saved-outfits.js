import { $, toast } from "../../core/dom.js";
import { describeHtml, escapeHtml } from "../../core/format.js";
import { LEGACY_OUTFIT_KEYS, getAllItems, normalizeOutfit, saveItem } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { KARMA_CONFIG, awardKarma, updateKarmaStreak } from "../karma/karma.js";
import { isOutfitFavorite, openOutfitLabelSheet, toggleFavoriteOutfit } from "./favorites.js";
import { labelChipsHtml, labelDisplay, labelState, openLabelManager } from "./labels.js";
import { manualSlots, renderManualOutfit } from "./manual-builder.js";
import { kv } from "../../core/kv.js";

// Saved Custom Outfits Storage
export const SAVED_OUTFITS_KEY = "weari_saved_outfits";

export function getSavedOutfits() {
  try {
    const raw = kv.getItem(SAVED_OUTFITS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list.map((o) => normalizeOutfit(o)).filter(Boolean);
    }
    for (const key of LEGACY_OUTFIT_KEYS) {
      const legacyRaw = kv.getItem(key);
      if (legacyRaw) {
        const list = JSON.parse(legacyRaw);
        if (Array.isArray(list) && list.length > 0) return list.map((o) => normalizeOutfit(o)).filter(Boolean);
      }
    }
  } catch {
    return [];
  }
  return [];
}

export function saveSavedOutfits(list) {
  try {
    kv.setItem(SAVED_OUTFITS_KEY, JSON.stringify(list));
  } catch {}
}

// Render Saved Outfits List (with label filter chips)
export function renderSavedOutfits() {
  const container = $("#saved-outfits-list");
  if (!container) return;
  const all = getSavedOutfits();

  const chipsBox = $("#saved-label-filters");
  if (chipsBox) {
    chipsBox.hidden = all.length === 0;
    chipsBox.innerHTML = labelChipsHtml({ selected: labelState.savedFilter, attr: "data-saved-filter", withAll: true, extra: all.map((o) => o.label) });
  }

  if (all.length === 0) {
    container.innerHTML = `<p class="saved-outfits-empty">No saved outfits yet. Assemble pieces above and tap Save.</p>`;
    return;
  }

  const filter = labelState.savedFilter;
  const list = filter === "all" ? all : all.filter((o) => (o.label || "").toLowerCase() === filter.toLowerCase());
  if (list.length === 0) {
    container.innerHTML = `<p class="saved-outfits-empty">No saved outfits under "${escapeHtml(labelDisplay(filter))}" yet.</p>`;
    return;
  }

  container.innerHTML = list
    .map(
      (outfit) => `
    <article class="saved-outfit-card" data-outfit-id="${escapeHtml(outfit.id)}">
      <div class="saved-outfit-header">
        <div class="fav-card-title-group">
          <h4 class="saved-outfit-title">${escapeHtml(outfit.name)}</h4>
          ${outfit.label ? `<span class="fav-card-label-tag">${escapeHtml(labelDisplay(outfit.label))}</span>` : ""}
        </div>
        <div class="saved-outfit-tools">
          <button type="button" class="fav-heart-btn ${isOutfitFavorite(outfit.id) ? "active" : ""}" data-toggle-fav="${escapeHtml(outfit.id)}" title="Toggle favorite">♥</button>
          <button type="button" class="btn-link-action" data-delete-outfit="${escapeHtml(outfit.id)}" title="Delete look">Delete</button>
        </div>
      </div>
      <div class="saved-outfit-strip">
        ${outfit.items.map((it) => `<img class="saved-strip-img" src="${escapeHtml(it.photo)}" alt="${describeHtml(it)}" title="${describeHtml(it)}" />`).join("")}
      </div>
      <div class="saved-outfit-actions">
        <button type="button" class="btn-card-small primary" data-wear-saved="${escapeHtml(outfit.id)}">✓ I wore this</button>
        <button type="button" class="btn-card-small" data-load-saved="${escapeHtml(outfit.id)}">Load into slots</button>
        <button type="button" class="btn-card-small" data-label-saved="${escapeHtml(outfit.id)}">Label</button>
      </div>
    </article>`
    )
    .join("");
}

$("#saved-label-filters")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-label-manager]")) return openLabelManager();
  const chip = e.target.closest("[data-saved-filter]");
  if (!chip) return;
  labelState.savedFilter = chip.dataset.savedFilter;
  renderSavedOutfits();
});

$("#saved-outfits-list")?.addEventListener("click", async (e) => {
  const labelBtn = e.target.closest("[data-label-saved]");
  if (labelBtn) {
    const outfit = getSavedOutfits().find((o) => o.id === labelBtn.dataset.labelSaved);
    if (outfit) openOutfitLabelSheet(outfit, "saved");
    return;
  }

  const favBtn = e.target.closest("[data-toggle-fav]");
  if (favBtn) {
    const id = favBtn.dataset.toggleFav;
    const outfit = getSavedOutfits().find((o) => o.id === id);
    if (outfit) toggleFavoriteOutfit(outfit);
    return;
  }

  const deleteBtn = e.target.closest("[data-delete-outfit]");
  if (deleteBtn) {
    const id = deleteBtn.dataset.deleteOutfit;
    const list = getSavedOutfits().filter((o) => o.id !== id);
    saveSavedOutfits(list);
    renderSavedOutfits();
    toast("Deleted saved look");
    return;
  }

  const wearBtn = e.target.closest("[data-wear-saved]");
  if (wearBtn) {
    const id = wearBtn.dataset.wearSaved;
    const outfit = getSavedOutfits().find((o) => o.id === id);
    if (!outfit) return;
    const nowIso = new Date().toISOString();
    const allItems = await getAllItems();
    for (const piece of outfit.items) {
      const it = allItems.find((x) => x.id === piece.id);
      if (it) {
        it.wearCount = (it.wearCount || 0) + 1;
        it.lastWorn = nowIso;
        await saveItem(it);
      }
    }
    updateKarmaStreak();
    recordPurchaseAvoided(1);
    awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore saved outfit");
    toast(`Logged wear for "${outfit.name}" ✨`);
    return;
  }

  const loadBtn = e.target.closest("[data-load-saved]");
  if (loadBtn) {
    const id = loadBtn.dataset.loadSaved;
    const outfit = getSavedOutfits().find((o) => o.id === id);
    if (!outfit) return;
    const allItems = await getAllItems();

    manualSlots.top = null;
    manualSlots["bottom-or-dress"] = null;
    manualSlots.shoes = null;
    manualSlots.outerwear = null;
    manualSlots.accessory = null;

    for (const piece of outfit.items) {
      const full = allItems.find((x) => x.id === piece.id);
      if (!full) continue;
      if (full.category === "top" && !manualSlots.top) manualSlots.top = full;
      else if ((full.category === "bottom" || full.category === "dress") && !manualSlots["bottom-or-dress"]) manualSlots["bottom-or-dress"] = full;
      else if (full.category === "shoes" && !manualSlots.shoes) manualSlots.shoes = full;
      else if (full.category === "outerwear" && !manualSlots.outerwear) manualSlots.outerwear = full;
      else if (full.category === "accessory" && !manualSlots.accessory) manualSlots.accessory = full;
    }

    const nameInput = $("#manual-outfit-name");
    if (nameInput) nameInput.value = outfit.name;
    renderManualOutfit();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast(`Loaded "${outfit.name}" into slots ✨`);
    return;
  }
});
