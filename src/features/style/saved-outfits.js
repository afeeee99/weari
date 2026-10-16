import { $, toast } from "../../core/dom.js";
import { describeHtml, escapeHtml } from "../../core/format.js";
import { LEGACY_OUTFIT_KEYS, getAllItems, normalizeOutfit, saveItem } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { KARMA_CONFIG, awardKarma, updateKarmaStreak } from "../karma/karma.js";
import { isOutfitFavorite, toggleFavoriteOutfit } from "./favorites.js";
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

// Render Saved Outfits List
export function renderSavedOutfits() {
  const container = $("#saved-outfits-list");
  if (!container) return;
  const list = getSavedOutfits();

  if (list.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:var(--muted); margin:0;">No saved outfits yet. Assemble pieces above and tap Save.</p>`;
    return;
  }

  container.innerHTML = list
    .map(
      (outfit) => `
    <article class="saved-outfit-card" data-outfit-id="${outfit.id}">
      <div class="saved-outfit-header">
        <h4 class="saved-outfit-title">${escapeHtml(outfit.name)}</h4>
        <div style="display:flex; align-items:center; gap:8px;">
          <button type="button" class="fav-heart-btn ${isOutfitFavorite(outfit.id) ? "active" : ""}" data-toggle-fav="${outfit.id}" title="Toggle favorite">♥</button>
          <button type="button" class="btn-link-action" data-delete-outfit="${outfit.id}" title="Delete look">Delete</button>
        </div>
      </div>
      <div class="saved-outfit-strip">
        ${outfit.items.map((it) => `<img class="saved-strip-img" src="${it.photo}" alt="${describeHtml(it)}" title="${describeHtml(it)}" />`).join("")}
      </div>
      <div class="saved-outfit-actions">
        <button type="button" class="btn-card-small primary" data-wear-saved="${outfit.id}">✓ I wore this</button>
        <button type="button" class="btn-card-small" data-load-saved="${outfit.id}">Load into slots</button>
      </div>
    </article>`
    )
    .join("");
}

$("#saved-outfits-list")?.addEventListener("click", async (e) => {
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
