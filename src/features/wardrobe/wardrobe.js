import { CATEGORIES } from "../../core/constants.js";
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

  $("#grid").innerHTML = shown
    .map(
      (it) => `
      <article class="card wardrobe-card" data-card-item-id="${it.id}" tabindex="0" role="button" aria-label="${describeHtml(it)}">
        <div class="card-media">
          <img src="${escapeHtml(it.photo)}" alt="${describeHtml(it)}" loading="lazy" />
          ${it.swappable ? `<span class="swap-dot" title="Up for swap"></span>` : ""}
        </div>
        <div class="card-body">
          <h3 class="card-name">${describeHtml(it)}</h3>
          <div class="card-tags-line">
            ${it.occasions && it.occasions.length ? it.occasions.map((o) => `<span class="tag">${escapeHtml(o)}</span>`).join("") : `<span class="tag">casual</span>`}
          </div>
        </div>
      </article>`
    )
    .join("");

  if (items.length && !shown.length) {
    $("#grid").innerHTML = `<p class="grid-empty">Nothing here yet.</p>`;
  }
}

$("#grid").addEventListener("click", async (e) => {
  const card = e.target.closest("[data-card-item-id]");
  if (card) {
    openItemDetailSheet(card.dataset.cardItemId);
    return;
  }
});

$("#grid").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const card = e.target.closest("[data-card-item-id]");
    if (card) {
      e.preventDefault();
      openItemDetailSheet(card.dataset.cardItemId);
    }
  }
});
