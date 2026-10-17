import { collageTileHtml } from "../../core/collage.js";
import { $, toast } from "../../core/dom.js";
import { escapeHtml } from "../../core/format.js";
import { kv } from "../../core/kv.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { renderInsights } from "../insights/insights.js";
import { KARMA_CONFIG, awardKarma, updateKarmaStreak } from "../karma/karma.js";
import { renderWardrobe } from "../wardrobe/wardrobe.js";
import { labelChipsHtml, labelDisplay, labelState, openLabelManager } from "./labels.js";
import { manualSlots } from "./manual-builder.js";
import { getSavedOutfits, renderSavedOutfits, saveSavedOutfits } from "./saved-outfits.js";

// =====================================================
// Favorites: outfits marked with a heart, with optional labels
// =====================================================
export const FAVORITES_STORAGE_KEY = "weari_favorite_outfits";
let pendingFavOutfit = null;
// The label pop-up either favorites an outfit or just labels a saved outfit
let labelSheetMode = "favorite";

export function getFavoriteOutfits() {
  try {
    const raw = kv.getItem(FAVORITES_STORAGE_KEY) || kv.getItem("weari-favorite-outfits");
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {}
  return [];
}

export function saveFavoriteOutfits(list) {
  try {
    kv.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function isOutfitFavorite(outfitId) {
  if (!outfitId) return false;
  return getFavoriteOutfits().some((f) => f.id === outfitId);
}

export function toggleFavoriteOutfit(outfit) {
  if (!outfit) return;
  const list = getFavoriteOutfits();
  const existingIdx = list.findIndex((f) => f.id === outfit.id);
  if (existingIdx >= 0) {
    list.splice(existingIdx, 1);
    saveFavoriteOutfits(list);
    toast("Removed from favorites");
    renderSavedOutfits();
    renderFavorites();
    return false;
  }
  promptFavoriteOutfit(outfit);
  return true;
}

export function promptFavoriteOutfit(outfit) {
  openOutfitLabelSheet(outfit, "favorite");
}

// mode "favorite": save to Favorites with a label · mode "saved": just label a saved outfit
export function openOutfitLabelSheet(outfit, mode) {
  pendingFavOutfit = outfit;
  labelSheetMode = mode;
  labelState.sheetSelected = outfit.label || "";
  const isFav = mode === "favorite";
  $("#fav-label-title").textContent = isFav ? "Favorite look ❤️" : "Label outfit";
  $("#fav-label-sub").textContent = isFav ? "Add an optional label to organize this outfit" : `Pick a label for "${outfit.name}"`;
  $("#btn-save-fav-label").textContent = isFav ? "Save favorite" : "Save label";
  $("#btn-skip-fav-label").textContent = isFav ? "Save without label" : "Remove label";
  renderFavLabelPresets();
  $("#fav-label-sheet").hidden = false;
  $("#fav-label-backdrop").hidden = false;
}

export function renderFavLabelPresets() {
  const box = $("#fav-label-presets");
  if (!box) return;
  box.innerHTML = labelChipsHtml({
    selected: labelState.sheetSelected,
    attr: "data-label-preset",
    chipClass: "fav-preset-chip",
    extra: labelState.sheetSelected ? [labelState.sheetSelected] : [],
  });
}

function closeFavLabelSheet() {
  $("#fav-label-sheet").hidden = true;
  $("#fav-label-backdrop").hidden = true;
  pendingFavOutfit = null;
}

$("#fav-label-close")?.addEventListener("click", closeFavLabelSheet);
$("#fav-label-backdrop")?.addEventListener("click", closeFavLabelSheet);

$("#fav-label-presets")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-label-manager]")) return openLabelManager();
  const btn = e.target.closest("[data-label-preset]");
  if (!btn) return;
  const value = btn.dataset.labelPreset;
  labelState.sheetSelected = labelState.sheetSelected.toLowerCase() === value.toLowerCase() ? "" : value;
  renderFavLabelPresets();
});

function commitOutfitLabel(label) {
  if (!pendingFavOutfit) return;
  if (labelSheetMode === "saved") {
    const list = getSavedOutfits();
    const target = list.find((o) => o.id === pendingFavOutfit.id);
    if (target) target.label = label;
    saveSavedOutfits(list);
    closeFavLabelSheet();
    renderSavedOutfits();
    toast(label ? `Labeled ${labelDisplay(label)}` : "Label removed");
    return;
  }

  const list = getFavoriteOutfits();
  const idx = list.findIndex((f) => f.id === pendingFavOutfit.id);
  const favObj = { ...pendingFavOutfit, label, favoritedAt: Date.now() };
  if (idx >= 0) list[idx] = favObj;
  else list.unshift(favObj);
  saveFavoriteOutfits(list);
  closeFavLabelSheet();
  renderSavedOutfits();
  renderFavorites();
  toast(`Saved to favorites ${label ? `(${labelDisplay(label)}) ` : ""}❤️`);
}

$("#btn-save-fav-label")?.addEventListener("click", () => commitOutfitLabel(labelState.sheetSelected));
$("#btn-skip-fav-label")?.addEventListener("click", () => commitOutfitLabel(""));

// Manual outfit builder favorite button
$("#btn-manual-fav")?.addEventListener("click", () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into slots before favoriting!");
    return;
  }
  const nameInput = $("#manual-outfit-name");
  const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Custom combination";
  promptFavoriteOutfit({
    id: "outfit_fav_" + Date.now(),
    name,
    occasion: "casual",
    createdAt: Date.now(),
    items: activePieces,
    label: labelState.manual,
  });
});

// Render favorites section
export function renderFavorites(filter = labelState.favFilter) {
  labelState.favFilter = filter;
  const container = $("#favorites-list");
  if (!container) return;

  const list = getFavoriteOutfits();

  // Filter chips: All, built-in, my labels, then any other label already on an outfit
  const chipsBox = $("#fav-label-filters");
  if (chipsBox) {
    chipsBox.innerHTML = labelChipsHtml({ selected: filter, attr: "data-fav-filter", withAll: true, extra: list.map((f) => f.label) });
  }

  const filtered = list.filter((f) => filter === "all" || (f.label || "").toLowerCase() === filter.toLowerCase());

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="favorites-empty">
        <p>No favorites saved${filter !== "all" ? ` under "${escapeHtml(labelDisplay(filter))}"` : ""} yet.</p>
        <small>Tap the heart on any saved outfit or styled look to add it here.</small>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (f, i) => `
    <article class="collage-tile-wrap fav-tile" data-fav-id="${escapeHtml(f.id)}">
      ${collageTileHtml((f.items || []).map((it) => it.photo), i)}
      <button type="button" class="fav-heart-btn active fav-tile-heart" data-unfav-id="${escapeHtml(f.id)}" title="Remove from favorites">♥</button>
      <h4 class="collage-name">${escapeHtml(f.name)}</h4>
      ${f.label ? `<span class="fav-card-label-tag">${escapeHtml(labelDisplay(f.label))}</span>` : ""}
      <div class="fav-tile-actions">
        <button type="button" class="fav-tile-action" data-wear-fav="${escapeHtml(f.id)}">✓ Wore it</button>
        <button type="button" class="fav-tile-action" data-edit-fav-label="${escapeHtml(f.id)}">Label</button>
      </div>
    </article>`
    )
    .join("");
}

// Favorites section click listener
$("#favorites-list")?.addEventListener("click", async (e) => {
  const unfavBtn = e.target.closest("[data-unfav-id]");
  if (unfavBtn) {
    saveFavoriteOutfits(getFavoriteOutfits().filter((f) => f.id !== unfavBtn.dataset.unfavId));
    renderFavorites();
    renderSavedOutfits();
    toast("Removed from favorites");
    return;
  }

  const editLabelBtn = e.target.closest("[data-edit-fav-label]");
  if (editLabelBtn) {
    const fav = getFavoriteOutfits().find((f) => f.id === editLabelBtn.dataset.editFavLabel);
    if (fav) promptFavoriteOutfit(fav);
    return;
  }

  const wearBtn = e.target.closest("[data-wear-fav]");
  if (wearBtn) {
    const fav = getFavoriteOutfits().find((f) => f.id === wearBtn.dataset.wearFav);
    if (!fav) return;

    const allItems = await getAllItems();
    const map = new Map(allItems.map((it) => [it.id, it]));
    const nowIso = new Date().toISOString();
    for (const piece of fav.items || []) {
      const it = map.get(piece.id);
      if (it) {
        it.wearCount = (it.wearCount || 0) + 1;
        it.lastWorn = nowIso;
        await saveItem(it);
      }
    }

    updateKarmaStreak();
    recordPurchaseAvoided(1);
    awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore favorite look");
    toast(`Logged wear for "${fav.name}" ✨`);
    renderWardrobe();
    renderInsights();
  }
});

// Favorites filter chips click listener
$("#fav-label-filters")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-label-manager]")) return openLabelManager();
  const chip = e.target.closest("[data-fav-filter]");
  if (!chip) return;
  renderFavorites(chip.dataset.favFilter);
});
