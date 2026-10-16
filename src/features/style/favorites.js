import { $, toast } from "../../core/dom.js";
import { describeHtml, escapeHtml } from "../../core/format.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { renderInsights } from "../insights/insights.js";
import { KARMA_CONFIG, awardKarma, updateKarmaStreak } from "../karma/karma.js";
import { manualSlots } from "./manual-builder.js";
import { renderSavedOutfits } from "./saved-outfits.js";
import { renderWardrobe } from "../wardrobe/wardrobe.js";
import { kv } from "../../core/kv.js";

// =====================================================
// PART 3: Favorites Section & Heart Buttons
// =====================================================
export const FAVORITES_STORAGE_KEY = "weari_favorite_outfits";
let activeFavFilter = "all";
let pendingFavOutfit = null;

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

function saveFavoriteOutfits(list) {
  try {
    kv.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function isOutfitFavorite(outfitId) {
  if (!outfitId) return false;
  const list = getFavoriteOutfits();
  return list.some((f) => f.id === outfitId);
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
    renderFavorites(activeFavFilter);
    return false;
  } else {
    promptFavoriteOutfit(outfit);
    return true;
  }
}

export function promptFavoriteOutfit(outfit) {
  pendingFavOutfit = outfit;
  const sheet = $("#fav-label-sheet");
  const backdrop = $("#fav-label-backdrop");
  const input = $("#fav-custom-label");
  if (input) input.value = outfit.label || "";
  document.querySelectorAll(".fav-preset-chip").forEach((c) => c.classList.remove("selected"));
  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function closeFavLabelSheet() {
  const sheet = $("#fav-label-sheet");
  const backdrop = $("#fav-label-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  pendingFavOutfit = null;
}

$("#fav-label-close")?.addEventListener("click", closeFavLabelSheet);
$("#fav-label-backdrop")?.addEventListener("click", closeFavLabelSheet);

document.querySelectorAll(".fav-preset-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".fav-preset-chip").forEach((b) => b.classList.toggle("selected", b === btn));
    const input = $("#fav-custom-label");
    if (input) input.value = btn.dataset.labelPreset;
  });
});

$("#btn-save-fav-label")?.addEventListener("click", () => {
  if (!pendingFavOutfit) return;
  const customInput = $("#fav-custom-label");
  const selectedPreset = document.querySelector(".fav-preset-chip.selected")?.dataset.labelPreset;
  const label = (customInput && customInput.value.trim()) || selectedPreset || "";

  const list = getFavoriteOutfits();
  const idx = list.findIndex((f) => f.id === pendingFavOutfit.id);
  const favObj = {
    ...pendingFavOutfit,
    label,
    favoritedAt: Date.now(),
  };
  if (idx >= 0) {
    list[idx] = favObj;
  } else {
    list.unshift(favObj);
  }
  saveFavoriteOutfits(list);
  closeFavLabelSheet();
  renderSavedOutfits();
  renderFavorites(activeFavFilter);
  toast(`Saved to favorites ${label ? `(${label}) ` : ""}❤️`);
});

$("#btn-skip-fav-label")?.addEventListener("click", () => {
  if (!pendingFavOutfit) return;
  const list = getFavoriteOutfits();
  const idx = list.findIndex((f) => f.id === pendingFavOutfit.id);
  const favObj = {
    ...pendingFavOutfit,
    label: "",
    favoritedAt: Date.now(),
  };
  if (idx >= 0) {
    list[idx] = favObj;
  } else {
    list.unshift(favObj);
  }
  saveFavoriteOutfits(list);
  closeFavLabelSheet();
  renderSavedOutfits();
  renderFavorites(activeFavFilter);
  toast("Saved to favorites ❤️");
});

// Manual outfit builder favorite button
$("#btn-manual-fav")?.addEventListener("click", () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into slots before favoriting!");
    return;
  }
  const nameInput = $("#manual-outfit-name");
  const name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Custom combination";
  const outfit = {
    id: "outfit_fav_" + Date.now(),
    name,
    occasion: "casual",
    createdAt: Date.now(),
    items: activePieces,
  };
  promptFavoriteOutfit(outfit);
});

// Render favorites section
export function renderFavorites(filter = activeFavFilter) {
  activeFavFilter = filter;
  const container = $("#favorites-list");
  if (!container) return;

  // Filter chips
  document.querySelectorAll("#fav-label-filters [data-fav-filter]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.favFilter.toLowerCase() === filter.toLowerCase());
  });

  const list = getFavoriteOutfits();
  const filtered = list.filter((f) => {
    if (filter === "all") return true;
    return (f.label || "").toLowerCase() === filter.toLowerCase();
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:30px 10px; color:var(--muted);">
        <p style="font-size:14px; margin:0 0 10px;">No favorites saved${filter !== "all" ? ` under "${filter}"` : ""} yet.</p>
        <small>Tap the heart on any saved outfit or styled look to add it here.</small>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (f) => `
    <article class="fav-outfit-card" data-fav-id="${f.id}">
      <div class="fav-card-header">
        <div class="fav-card-title-group">
          <h4 class="fav-card-title">${escapeHtml(f.name)}</h4>
          ${f.label ? `<span class="fav-card-label-tag">${escapeHtml(f.label)}</span>` : ""}
        </div>
        <button type="button" class="fav-heart-btn active" data-unfav-id="${f.id}" title="Remove from favorites">♥</button>
      </div>
      <div class="fav-strip">
        ${(f.items || []).map((it) => `<img class="fav-strip-img" src="${it.photo}" alt="${describeHtml(it)}" title="${describeHtml(it)}" />`).join("")}
      </div>
      <div class="fav-card-actions">
        <button type="button" class="btn-primary" style="padding:10px 18px; font-size:13px;" data-wear-fav="${f.id}">
          ✓ I wore this
        </button>
        <button type="button" class="btn-secondary" style="padding:10px 18px; font-size:13px;" data-edit-fav-label="${f.id}">
          Edit label
        </button>
      </div>
    </article>`
    )
    .join("");
}

// Favorites section click listener
$("#favorites-list")?.addEventListener("click", async (e) => {
  const unfavBtn = e.target.closest("[data-unfav-id]");
  if (unfavBtn) {
    const id = unfavBtn.dataset.unfavId;
    const list = getFavoriteOutfits().filter((f) => f.id !== id);
    saveFavoriteOutfits(list);
    renderFavorites(activeFavFilter);
    renderSavedOutfits();
    toast("Removed from favorites");
    return;
  }

  const editLabelBtn = e.target.closest("[data-edit-fav-label]");
  if (editLabelBtn) {
    const id = editLabelBtn.dataset.editFavLabel;
    const fav = getFavoriteOutfits().find((f) => f.id === id);
    if (fav) promptFavoriteOutfit(fav);
    return;
  }

  const wearBtn = e.target.closest("[data-wear-fav]");
  if (wearBtn) {
    const id = wearBtn.dataset.wearFav;
    const fav = getFavoriteOutfits().find((f) => f.id === id);
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
    return;
  }
});

// Favorites filter chips click listener
$("#fav-label-filters")?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-fav-filter]");
  if (!chip) return;
  renderFavorites(chip.dataset.favFilter);
});
