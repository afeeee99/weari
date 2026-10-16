import { $, toast } from "../../core/dom.js";
import { confirmDialog } from "../../core/dialog.js";
import { THIRTY_DAYS_MS, describeHtml, escapeHtml, formatLastWorn } from "../../core/format.js";
import { colorHex } from "../../core/placeholders.js";
import { closeSheet, openSheet } from "../../core/sheet.js";
import { deleteItem, getItem, saveItem } from "../../data/items-db.js";
import { KARMA_CONFIG, awardKarma, unlockBadge, updateKarmaStreak } from "../karma/karma.js";
import { openRewearFlow, rewearSheetSection } from "../rewear/rewear.js";
import { renderWardrobe } from "./wardrobe.js";

// =====================================================
// Item detail pop-up (tap a piece in the Wardrobe)
// =====================================================
const tagList = (occasions) =>
  (occasions && occasions.length ? occasions : ["casual"]).map((o) => `<span class="tag">${escapeHtml(o)}</span>`).join("");

export async function openItemDetailSheet(itemId) {
  const it = await getItem(itemId);
  if (!it) return;

  openSheet(`
    <div class="item-detail-sheet">
      <div class="item-detail-header">
        <div class="item-detail-title-group">
          <h2 class="item-detail-name">${describeHtml(it)}</h2>
          <div class="item-detail-meta">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="item-detail-cat">${escapeHtml(it.category)}</span>
            <span class="item-detail-sep">·</span>
            <span class="item-detail-color">${escapeHtml(it.color)}</span>
          </div>
        </div>
        <button type="button" class="btn-detail-close" aria-label="Close" data-close-sheet>✕</button>
      </div>

      <div class="item-detail-layout">
        <div class="item-detail-media">
          <img src="${escapeHtml(it.photo)}" alt="${describeHtml(it)}" />
          ${it.swappable ? `<span class="item-detail-swappable-badge"><span>🔁</span> Available to swap</span>` : ""}
        </div>

        <div class="item-detail-body">
          <div class="item-detail-section">
            <label class="item-detail-label">Occasions</label>
            <div class="tags">${tagList(it.occasions)}</div>
          </div>

          <div class="item-detail-section item-detail-wear-box">
            <div class="item-detail-wear-status">
              <div class="item-detail-wear-count">
                <strong>${it.wearCount || 0}</strong>
                <span>wear${it.wearCount === 1 ? "" : "s"} logged</span>
              </div>
              <div class="item-detail-last-worn">
                <span class="item-detail-wear-pill">${formatLastWorn(it.lastWorn)}</span>
              </div>
            </div>
            <button type="button" class="btn-primary btn-mark-worn-sheet" data-sheet-mark-worn="${it.id}">
              ✓ Mark as worn ${it.wearCount ? `(${it.wearCount}×)` : ""}
            </button>
          </div>

          ${rewearSheetSection(it)}

          <div class="item-detail-actions">
            <button type="button" class="btn-outline-action" data-sheet-toggle-swap="${it.id}">
              ${it.swappable ? "Remove from swap feed" : `List on Rewear (+${KARMA_CONFIG.POINTS.MARK_SWAPPABLE} pts)`}
            </button>
            <button type="button" class="btn-danger-link" data-sheet-delete="${it.id}">
              Remove from wardrobe
            </button>
          </div>
        </div>
      </div>
    </div>`);
}

$("#sheet").addEventListener("click", async (e) => {
  const rewearBtn = e.target.closest("[data-rewear-action]");
  if (rewearBtn) return openRewearFlow(rewearBtn.dataset.rewearAction, rewearBtn.dataset.rewearItem);

  const markWornBtn = e.target.closest("[data-sheet-mark-worn]");
  if (markWornBtn) {
    const it = await getItem(markWornBtn.dataset.sheetMarkWorn);
    if (!it) return;
    const wasIdle = !it.lastWorn || Date.now() - new Date(it.lastWorn).getTime() > THIRTY_DAYS_MS;
    it.wearCount = (it.wearCount || 0) + 1;
    it.lastWorn = new Date().toISOString();
    await saveItem(it);
    renderWardrobe();
    toast(`Marked as worn (${it.wearCount} total) ✨`);
    updateKarmaStreak();
    if (wasIdle) {
      awardKarma(KARMA_CONFIG.POINTS.WEAR_IDLE_ITEM, "Rescued idle piece");
      unlockBadge("never_worn_rescuer");
    } else {
      awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore favorite piece");
    }
    unlockBadge("rewear_rookie");
    openItemDetailSheet(it.id);
    return;
  }

  const toggleSwapBtn = e.target.closest("[data-sheet-toggle-swap]");
  if (toggleSwapBtn) {
    const it = await getItem(toggleSwapBtn.dataset.sheetToggleSwap);
    if (!it) return;
    it.swappable = !it.swappable;
    await saveItem(it);
    renderWardrobe();
    if (it.swappable) {
      toast("Listed on Rewear ✨");
      awardKarma(KARMA_CONFIG.POINTS.MARK_SWAPPABLE, "Listed on Rewear");
    } else {
      toast("Removed from Rewear feed");
    }
    openItemDetailSheet(it.id);
    return;
  }

  const deleteBtn = e.target.closest("[data-sheet-delete]");
  if (deleteBtn) {
    const ok = await confirmDialog({ title: "Remove this item?", message: "It will be removed from your wardrobe and any swap listing.", confirmLabel: "Remove", danger: true });
    if (!ok) return;
    await deleteItem(deleteBtn.dataset.sheetDelete);
    closeSheet();
    renderWardrobe();
    toast("Item removed");
  }
});
