import { STYLIST_BREAK_MSG, callApi } from "../../core/api.js";
import { OCCASIONS } from "../../core/constants.js";
import { $, toast } from "../../core/dom.js";
import { THIRTY_DAYS_MS, escapeHtml, formatLastWorn, plainText } from "../../core/format.js";
import { colorHex } from "../../core/placeholders.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { KARMA_CONFIG, awardKarma, unlockBadge, updateKarmaStreak } from "../karma/karma.js";
import { getOnboardingPreferences, suggestOutfit } from "./basic-stylist.js";
import { promptFavoriteOutfit } from "./favorites.js";
import { getSavedOutfits, renderSavedOutfits, saveSavedOutfits } from "./saved-outfits.js";
import { handleStylistLabelClick, labelState, renderStylistLabelChips } from "./labels.js";
import { styleState } from "./style-screen.js";

export async function renderStyleOccasions() {
  const items = await getAllItems();
  const countFor = (o) => items.filter((it) => it.occasions.includes(o)).length;

  $("#style-occasions").innerHTML = OCCASIONS.map((o) => {
    const n = countFor(o);
    return `<button type="button" class="chip ${o === styleState.occasion ? "selected" : ""}" data-style-occasion="${o}">
      ${o}${n ? ` <span class="chip-count">${n}</span>` : ""}</button>`;
  }).join("");
}

$("#style-occasions").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-style-occasion]");
  if (!btn) return;
  styleState.occasion = btn.dataset.styleOccasion;
  styleState.lastOutfitIds = [];
  document.querySelectorAll("[data-style-occasion]").forEach((b) => b.classList.toggle("selected", b === btn));
  $("#suggest-btn").disabled = false;
  $("#style-result").innerHTML = "";
});

function wardrobeAsText(items) {
  return items
    .map((it) =>
      [it.id, plainText(it.name).slice(0, 40), it.category, it.color, (it.occasions || []).join(", ")]
        .map(plainText)
        .join(" | ")
    )
    .join("\n");
}

// Ask Gemini (via the server) for an outfit. On any problem, use the basic rules in stylist.js.
async function getOutfitSuggestion(items) {
  if (!items.length) return suggestOutfit(items, styleState.occasion, styleState.lastOutfitIds, priorityStyleItemId);
  try {
    // getOnboardingPreferences() returns only goal, styles and occasions — no other personal answers
    const res = await callApi(
      "/api/style",
      {
        occasion: styleState.occasion,
        wardrobe: wardrobeAsText(items),
        preferences: getOnboardingPreferences() || {},
        previousOutfitIds: styleState.lastOutfitIds,
        mustIncludeItemId: priorityStyleItemId,
      },
      { timeoutMs: 25000 }
    );
    if (!res.canFormOutfit) return { missing: res.missing, source: res.source };
    const byId = new Map(items.map((it) => [String(it.id), it]));
    const outfit = res.outfit.map((p) => ({ role: p.role, item: byId.get(String(p.itemId)) })).filter((p) => p.item);
    if (!outfit.length) throw new Error("Suggested items are not in the wardrobe");
    return { outfit, explanation: res.explanation, source: res.source };
  } catch (err) {
    console.warn("Gemini stylist unavailable, using basic rules:", err.message);
    const basic = await suggestOutfit(items, styleState.occasion, styleState.lastOutfitIds, priorityStyleItemId);
    return { ...basic, source: "rules", notice: STYLIST_BREAK_MSG };
  }
}

const STYLE_SOURCE_LABELS = {
  gemini: "✨ Styled by Gemini",
  mock: "✨ Test mode (not real Gemini)",
  rules: "Basic suggestion",
};

// "I wore this": +1 wear for each piece, then karma (shared by AI Stylist and Chat)
export async function logOutfitWorn(itemIds) {
  const nowIso = new Date().toISOString();
  const allItems = await getAllItems();
  const map = new Map(allItems.map((it) => [String(it.id), it]));
  let hadIdleItem = false;
  let logged = 0;
  for (const id of itemIds) {
    const it = map.get(String(id));
    if (it) {
      if (!it.lastWorn || (Date.now() - new Date(it.lastWorn).getTime() > THIRTY_DAYS_MS)) {
        hadIdleItem = true;
      }
      it.wearCount = (it.wearCount || 0) + 1;
      it.lastWorn = nowIso;
      await saveItem(it);
      logged++;
    }
  }
  toast(`Logged wear for all ${logged} pieces ✨`);
  updateKarmaStreak();
  recordPurchaseAvoided(1);
  awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore outfit (+10)");
  unlockBadge("rewear_rookie");
  if (hadIdleItem) {
    awardKarma(KARMA_CONFIG.POINTS.WEAR_IDLE_ITEM, "Rescued idle piece (+25)");
    unlockBadge("never_worn_rescuer");
  }
}

let currentSuggestedOutfit = [];
let priorityStyleItemId = null;

export async function showSuggestion(forcedItemId = null) {
  if (forcedItemId) {
    priorityStyleItemId = forcedItemId;
  }
  if (!styleState.occasion) return;

  const suggestBtn = $("#suggest-btn");
  const origBtnText = suggestBtn ? suggestBtn.textContent : "Suggest outfit";
  if (suggestBtn) {
    suggestBtn.disabled = true;
    suggestBtn.textContent = "Styling with Gemini...";
  }

  const box = $("#style-result");
  const tryAnotherBtn = $("#try-another");
  if (tryAnotherBtn) {
    tryAnotherBtn.disabled = true;
    tryAnotherBtn.textContent = "Styling with Gemini...";
  }

  if (!box.children.length) {
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">✨</div>
        <p>Gemini is styling a look for <strong>${styleState.occasion}</strong>...</p>
      </div>`;
  }

  try {
    const items = await getAllItems();
    const result = await getOutfitSuggestion(items);

    if (result.missing) {
      box.innerHTML = `
        <div class="notice">
          <div class="notice-icon">🧺</div>
          ${result.notice ? `<p class="stylist-notice">${escapeHtml(result.notice)}</p>` : ""}
          <p>${escapeHtml(result.missing)}</p>
          <button class="btn-secondary" data-go="add">Add item</button>
        </div>`;
      return;
    }

    currentSuggestedOutfit = result.outfit;
    styleState.lastOutfitIds = result.outfit.map((p) => p.item.id);
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 class="outfit-title" style="margin:0;">Your ${styleState.occasion} look</h3>
        <button id="btn-fav-suggested-header" type="button" class="fav-heart-btn" title="Favorite this look">♥</button>
      </div>
      ${result.notice ? `<p class="stylist-notice">${escapeHtml(result.notice)}</p>` : ""}
      <div class="style-source">${STYLE_SOURCE_LABELS[result.source] || STYLE_SOURCE_LABELS.rules}</div>
      <div class="grid outfit-grid">
        ${result.outfit
          .map(
            ({ role, item }) => `
          <article class="card">
            <img src="${item.photo}" alt="${item.color} ${item.category}" />
            <div class="card-body">
              <div class="role">${role}</div>
              <div class="card-top">
                <span class="dot" style="background:${colorHex(item.color)}"></span>
                <span class="card-cat">${item.color} ${item.category}</span>
              </div>
              <span class="card-last-worn">${formatLastWorn(item.lastWorn)}</span>
            </div>
          </article>`
          )
          .join("")}
      </div>
      ${
        result.explanation
          ? `<div class="outfit-explanation"><p>${escapeHtml(result.explanation)}</p></div>`
          : ""
      }
      <div class="field-group stylist-label-group">
        <span class="field-label">Label <span class="hint">(optional)</span></span>
        <div class="label-chip-row" id="stylist-label-chips"></div>
      </div>
      <button id="wore-outfit" class="btn-primary btn-block" style="margin-bottom: 8px;">✓ I wore this outfit</button>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <button id="btn-fav-suggested" type="button" class="btn-secondary" style="flex:1;">♥ Favorite look</button>
        <button id="btn-save-suggested" type="button" class="btn-secondary" style="flex:1;">💾 Save look</button>
      </div>
      <button id="try-another" class="btn-secondary btn-block">↻ Try another</button>`;
    labelState.stylist = "";
    renderStylistLabelChips();
    box.classList.remove("fade-in");
    void box.offsetWidth; // restart the fade animation
    box.classList.add("fade-in");
  } catch (err) {
    let msg = err.message || "Our stylist is busy, tap Try again";
    if (
      msg.includes("high demand") ||
      msg.includes("busy") ||
      msg.includes("503") ||
      msg.includes("Failed") ||
      msg.includes("unavailable") ||
      msg.includes("overloaded") ||
      msg.includes("API key") ||
      msg.includes("Internal")
    ) {
      msg = "Our stylist is busy, tap Try again";
    }
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">🧺</div>
        <p>${escapeHtml(msg)}</p>
        <button id="try-another" class="btn-secondary">Try again</button>
      </div>`;
  } finally {
    if (suggestBtn) {
      suggestBtn.disabled = false;
      suggestBtn.textContent = origBtnText;
    }
  }
}

$("#suggest-btn").addEventListener("click", () => showSuggestion());
$("#style-result").addEventListener("click", async (e) => {
  if (e.target.closest("#try-another")) {
    showSuggestion();
    return;
  }

  if (handleStylistLabelClick(e)) return;

  const favBtn = e.target.closest("#btn-fav-suggested") || e.target.closest("#btn-fav-suggested-header");
  if (favBtn && currentSuggestedOutfit && currentSuggestedOutfit.length) {
    const outfit = {
      id: "outfit_sug_" + Date.now(),
      name: `${(styleState.occasion || "Styled").charAt(0).toUpperCase() + (styleState.occasion || "Styled").slice(1)} look`,
      occasion: styleState.occasion || "casual",
      createdAt: Date.now(),
      items: currentSuggestedOutfit.map((p) => p.item),
      label: labelState.stylist,
    };
    promptFavoriteOutfit(outfit);
    return;
  }

  const saveBtn = e.target.closest("#btn-save-suggested");
  if (saveBtn && currentSuggestedOutfit && currentSuggestedOutfit.length) {
    const outfit = {
      id: "outfit_" + Date.now(),
      name: `${(styleState.occasion || "Styled").charAt(0).toUpperCase() + (styleState.occasion || "Styled").slice(1)} look`,
      occasion: styleState.occasion || "casual",
      createdAt: Date.now(),
      items: currentSuggestedOutfit.map((p) => p.item),
      label: labelState.stylist,
    };
    const list = getSavedOutfits();
    list.unshift(outfit);
    saveSavedOutfits(list);
    saveBtn.disabled = true;
    saveBtn.textContent = "✓ Saved!";
    renderSavedOutfits();
    toast("Outfit saved to your collection ✨");
    return;
  }

  const woreBtn = e.target.closest("#wore-outfit");
  if (woreBtn && currentSuggestedOutfit && currentSuggestedOutfit.length) {
    woreBtn.disabled = true;
    woreBtn.textContent = "✓ Outfit logged!";
    await logOutfitWorn(currentSuggestedOutfit.map((p) => p.item.id));
  }
});
