import { $ } from "../../core/dom.js";
import { renderChat } from "./chat.js";
import { renderFavorites } from "./favorites.js";
import { renderManualOutfit } from "./manual-builder.js";
import { renderSavedOutfits } from "./saved-outfits.js";
import { renderWeeklyPlan } from "./weekly-plan.js";

// =====================================================
// Style me screen — Dual Modes: AI Stylist & Create your own
// =====================================================
export let currentStyleMode = "chat";
export const styleState = { occasion: null, lastOutfitIds: [] }; // shared with Insights ("Style it")

// Style Mode Tabs Switcher
document.querySelectorAll("#style-mode-tabs [data-style-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentStyleMode = btn.dataset.styleMode;
    document.querySelectorAll("#style-mode-tabs [data-style-mode]").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    const chatView = $("#style-mode-chat");
    if (chatView) {
      chatView.hidden = currentStyleMode !== "chat";
      if (currentStyleMode === "chat") renderChat();
    }
    const aiView = $("#style-mode-ai");
    const manualView = $("#style-mode-manual");
    const favView = $("#style-mode-favorites");
    const planView = $("#style-mode-plan");
    if (aiView) aiView.hidden = currentStyleMode !== "ai";
    if (manualView) {
      manualView.hidden = currentStyleMode !== "manual";
      if (currentStyleMode === "manual") {
        renderManualOutfit();
        renderSavedOutfits();
      }
    }
    if (favView) {
      favView.hidden = currentStyleMode !== "favorites";
      if (currentStyleMode === "favorites") {
        renderFavorites();
      }
    }
    if (planView) {
      planView.hidden = currentStyleMode !== "plan";
      if (currentStyleMode === "plan") {
        renderWeeklyPlan();
      }
    }
  });
});
