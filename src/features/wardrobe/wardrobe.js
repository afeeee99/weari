import { CATEGORIES } from "../../core/constants.js";
import { CLOSET_TILE_NAMES, collageTileHtml } from "../../core/collage.js";
import { $ } from "../../core/dom.js";
import { describeHtml, escapeHtml } from "../../core/format.js";
import { getAllItems } from "../../data/items-db.js";
import { renderProfileCard } from "../profile/profile-card.js";
import { openItemDetailSheet } from "./item-detail.js";

// =====================================================
// Wardrobe screen
// =====================================================
export const wardrobeState = { filter: "all" }; // which filter chip is selected

function renderFilters(items) {
  const options = ["all", ...CATEGORIES, "swap"];
  $("#filters").innerHTML = options
    .map((opt) => {
      const label = opt === "swap" ? "Up for swap" : opt === "all" ? `All (${items.length})` : opt;
      return `<button class="chip ${opt === wardrobeState.filter ? "selected" : ""}" data-filter="${opt}">${label}</button>`;
    })
    .join("");
}

$("#filters").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  wardrobeState.filter = btn.dataset.filter;
  renderWardrobe();
});

export async function renderWardrobe() {
  const items = (await getAllItems()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const countEl = $("#item-count");
  if (countEl) {
    countEl.textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "";
  }

  $("#empty-state").hidden = items.length > 0;
  $("#filters").hidden = items.length === 0;
  renderFilters(items);
  renderProfileCard();

  const shown = items.filter((it) =>
    wardrobeState.filter === "all" ? true : wardrobeState.filter === "swap" ? it.swappable : it.category === wardrobeState.filter
  );

  const grid = $("#grid");
  grid.className = "grid collage-grid";
  if (wardrobeState.filter === "all") {
    // One collage tile per category, made from the newest pieces in it
    grid.innerHTML = CATEGORIES.map((cat) => items.filter((it) => it.category === cat))
      .filter((group) => group.length)
      .map((group, i) => {
        const cat = group[0].category;
        const name = CLOSET_TILE_NAMES[cat] || cat;
        const count = `${group.length} piece${group.length === 1 ? "" : "s"}`;
        return `
        <article class="collage-tile-wrap" data-closet-category="${cat}" tabindex="0" role="button" aria-label="${name}, ${count}">
          ${collageTileHtml(group.map((it) => it.photo), i)}
          <h3 class="collage-name">${name}</h3>
          <span class="collage-count">${count}</span>
        </article>`;
      })
      .join("");
  } else {
    grid.innerHTML = shown
      .map(
        (it, i) => `
        <article class="collage-tile-wrap wardrobe-card" data-card-item-id="${it.id}" tabindex="0" role="button" aria-label="${describeHtml(it)}">
          ${collageTileHtml([it.photo], i)}
          ${it.swappable ? `<span class="swap-dot" title="Up for swap"></span>` : ""}
          <h3 class="collage-name">${describeHtml(it)}</h3>
          <span class="collage-count">${escapeHtml((it.occasions && it.occasions.length ? it.occasions : ["casual"]).join(" · "))}</span>
        </article>`
      )
      .join("");
  }

  if (items.length && !shown.length) {
    $("#grid").innerHTML = `<p class="grid-empty">Nothing here yet.</p>`;
  }
}

// Tapping a category tile opens that category
function openCategory(tile) {
  wardrobeState.filter = tile.dataset.closetCategory;
  renderWardrobe();
}

$("#grid").addEventListener("click", async (e) => {
  const tile = e.target.closest("[data-closet-category]");
  if (tile) return openCategory(tile);
  const card = e.target.closest("[data-card-item-id]");
  if (card) {
    openItemDetailSheet(card.dataset.cardItemId);
    return;
  }
});

$("#grid").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const tile = e.target.closest("[data-closet-category]");
    if (tile) {
      e.preventDefault();
      return openCategory(tile);
    }
    const card = e.target.closest("[data-card-item-id]");
    if (card) {
      e.preventDefault();
      openItemDetailSheet(card.dataset.cardItemId);
    }
  }
});
