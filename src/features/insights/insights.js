import { $, toast } from "../../core/dom.js";
import { describeHtml, formatLastWorn, isWornInLast30Days } from "../../core/format.js";
import { colorHex } from "../../core/placeholders.js";
import { showScreen } from "../../core/router.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { getConsideredNotBoughtCount } from "../buying-brain/buying-brain.js";
import { IMPACT_CONFIG, getCompletedSwapsCount, getPurchasesAvoidedCount } from "./impact.js";
import { KARMA_CONFIG, awardKarma } from "../karma/karma.js";
import { renderStyleOccasions, showSuggestion } from "../style/ai-stylist.js";
import { styleState } from "../style/style-screen.js";
import { tagsHtml } from "../swap/swap.js";

// =====================================================
// Insights screen
// =====================================================
export async function renderInsights() {
  const items = await getAllItems();

  // 1. Swap nudge (simple rules, not AI)
  const neverWorn = items.filter((it) => !isWornInLast30Days(it));
  const nudgeEl = $("#insights-nudge");
  if (items.length === 0) {
    nudgeEl.innerHTML = `<p>Your wardrobe is empty. Add pieces to begin tracking wears and swaps.</p>`;
  } else if (neverWorn.length === 0) {
    nudgeEl.innerHTML = `<p>Every piece in your wardrobe was worn in the last 30 days! Outstanding rotation.</p>`;
  } else if (neverWorn.length === 1) {
    nudgeEl.innerHTML = `<p>You have 1 piece you haven’t worn in 30 days. Could someone else love it?</p>`;
  } else {
    nudgeEl.innerHTML = `<p>You have ${neverWorn.length} pieces you haven’t worn in 30 days. Could someone else love them?</p>`;
  }

  // 2. Circular impact (only completed swaps and purchases avoided, not items simply worn)
  const completedSwaps = getCompletedSwapsCount();
  const purchasesAvoided = getPurchasesAvoidedCount();
  const impact = IMPACT_CONFIG.calculate(completedSwaps, purchasesAvoided);

  const avoidedEl = $("#stat-purchases-avoided");
  if (avoidedEl) avoidedEl.textContent = purchasesAvoided;
  const consideredEl = $("#stat-considered");
  if (consideredEl) consideredEl.textContent = getConsideredNotBoughtCount();

  const countsEl = $("#impact-counts");
  if (countsEl) countsEl.textContent = `Estimated · ${completedSwaps} completed swap${completedSwaps === 1 ? "" : "s"} · ${purchasesAvoided} purchase${purchasesAvoided === 1 ? "" : "s"} avoided`;
  const headlineEl = $("#impact-headline");
  if (headlineEl) headlineEl.textContent = impact.headline;
  const detailEl = $("#impact-detail");
  if (detailEl) detailEl.textContent = impact.caption;
  const noteEl = $("#impact-estimate-note");
  if (noteEl) noteEl.innerHTML = `<small><strong>How we estimate this:</strong> Based on estimated lifecycle savings from completed swaps and retail purchases avoided by rewearing.</small>`;

  // 3. Wardrobe usage (worn in last 30 days)
  const worn30Days = items.filter(isWornInLast30Days);
  const percent = items.length ? Math.round((worn30Days.length / items.length) * 100) : 0;

  $("#usage-percent").textContent = `${percent}%`;
  $("#usage-fraction").textContent = `${worn30Days.length} of ${items.length} pieces`;
  $("#usage-bar-fill").style.width = `${percent}%`;

  const circ = 2 * Math.PI * 42; // ~263.89
  const ringProgress = $("#usage-ring-progress");
  ringProgress.style.strokeDasharray = `${circ}`;
  ringProgress.style.strokeDashoffset = `${circ - (circ * percent) / 100}`;

  if (items.length === 0) {
    $("#usage-desc").textContent = "Add clothes to your wardrobe to see your rotation analytics.";
  } else if (percent >= 70) {
    $("#usage-desc").textContent = "High rotation! You regularly wear most of your collection.";
  } else if (percent >= 35) {
    $("#usage-desc").textContent = "Steady rotation. Try styling idle pieces for upcoming occasions.";
  } else {
    $("#usage-desc").textContent = "Great opportunity to rotate more pieces or list idle favorites on Rewear.";
  }

  // 4. Most worn items (top 3)
  const mostWorn = items
    .filter((it) => (it.wearCount || 0) > 0)
    .sort((a, b) => (b.wearCount || 0) - (a.wearCount || 0))
    .slice(0, 3);

  const mostWornList = $("#most-worn-list");
  if (!mostWorn.length) {
    mostWornList.innerHTML = `<p class="empty-hint">No wears logged yet. Tap "Mark as worn" on any item or log an outfit in Style me.</p>`;
  } else {
    mostWornList.innerHTML = mostWorn
      .map(
        (it) => `
      <article class="card">
        <img src="${it.photo}" alt="${describeHtml(it)}" loading="lazy" />
        <div class="card-body">
          <div class="card-top">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="card-cat">${describeHtml(it)}</span>
          </div>
          ${tagsHtml(it.occasions)}
          <div class="card-wear-row">
            <span class="wear-stat-pill"><strong>${it.wearCount}</strong> wear${it.wearCount === 1 ? "" : "s"}</span>
            <span class="card-last-worn">${formatLastWorn(it.lastWorn)}</span>
          </div>
        </div>
      </article>`
      )
      .join("");
  }

  // 5. Never worn / Inactive items (not worn in 30 days or ever)
  const neverWornList = $("#never-worn-list");
  if (!neverWorn.length) {
    neverWornList.innerHTML = `<p class="empty-hint">None! Every single item in your wardrobe has been worn within the last 30 days.</p>`;
  } else {
    neverWornList.innerHTML = neverWorn
      .map(
        (it) => `
      <article class="card">
        <img src="${it.photo}" alt="${describeHtml(it)}" loading="lazy" />
        ${it.swappable ? `<span class="swap-badge">Swap</span>` : ""}
        <div class="card-body">
          <div class="card-top">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="card-cat">${describeHtml(it)}</span>
          </div>
          ${tagsHtml(it.occasions)}
          <span class="card-last-worn">${formatLastWorn(it.lastWorn)}</span>
          <div class="insights-card-actions">
            <button type="button" class="btn-small ${it.swappable ? "done" : ""}" data-list-swap="${it.id}">
              ${it.swappable ? "✓ Listed on Rewear" : "List on Rewear"}
            </button>
            <button type="button" class="btn-small btn-secondary" data-style-item="${it.id}">
              Style it
            </button>
          </div>
        </div>
      </article>`
      )
      .join("");
  }
}

$("#screen-insights").addEventListener("click", async (e) => {
  const swapBtn = e.target.closest("[data-list-swap]");
  if (swapBtn) {
    const id = swapBtn.dataset.listSwap;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      const wasSwappable = it.swappable;
      it.swappable = true;
      await saveItem(it);
      renderInsights();
      toast("Listed on Rewear ✨");
      if (!wasSwappable) {
        awardKarma(KARMA_CONFIG.POINTS.MARK_SWAPPABLE, "Listed on Rewear");
      }
    }
    return;
  }

  const styleBtn = e.target.closest("[data-style-item]");
  if (styleBtn) {
    const id = styleBtn.dataset.styleItem;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      styleState.occasion = (it.occasions && it.occasions[0]) || "casual";
      showScreen("style");
      renderStyleOccasions();
      showSuggestion(it.id);
      toast(`Styling an outfit with your ${it.color} ${it.category}`);
    }
  }
});
