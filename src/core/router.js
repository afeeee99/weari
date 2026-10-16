import { closeSheet } from "./sheet.js";
import { renderSavedForLater } from "../features/buying-brain/buying-brain.js";
import { renderInsights } from "../features/insights/insights.js";
import { renderKarma } from "../features/karma/karma-screen.js";
import { renderProfileScreen } from "../features/profile/profile-screen.js";
import { renderStyleOccasions } from "../features/style/ai-stylist.js";
import { renderChat } from "../features/style/chat.js";
import { renderFavorites } from "../features/style/favorites.js";
import { renderManualOutfit } from "../features/style/manual-builder.js";
import { renderSavedOutfits } from "../features/style/saved-outfits.js";
import { currentStyleMode } from "../features/style/style-screen.js";
import { renderWeeklyPlan } from "../features/style/weekly-plan.js";
import { renderSwap } from "../features/swap/swap.js";
import { renderWardrobe } from "../features/wardrobe/wardrobe.js";

// =====================================================
// Screens. Each screen has its own address (#wardrobe, #style…), so the
// browser's Back button and the Android back button work as expected.
// =====================================================
const SCREENS = ["wardrobe", "add", "style", "swap", "insights", "karma", "profile"];
let currentScreen = "wardrobe";

export const getCurrentScreen = () => currentScreen;

// The screen named in the address bar, e.g. weari.app/#swap
export function initialScreen() {
  const name = location.hash.replace("#", "");
  return SCREENS.includes(name) && name !== "add" ? name : "wardrobe";
}

function renderScreen(name) {
  if (name === "wardrobe") {
    renderWardrobe();
    renderSavedForLater();
  }
  if (name === "style") {
    renderStyleOccasions();
    renderManualOutfit();
    renderSavedOutfits();
    renderFavorites();
    renderWeeklyPlan();
    if (currentStyleMode === "chat") renderChat();
  }
  if (name === "swap") renderSwap();
  if (name === "insights") renderInsights();
  if (name === "karma") renderKarma();
  if (name === "profile") renderProfileScreen();
}

export function showScreen(name, { push = true } = {}) {
  if (!SCREENS.includes(name)) name = "wardrobe";
  currentScreen = name;
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== `screen-${name}`));
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.go === name;
    t.classList.toggle("active", active);
    if (active) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  document.body.dataset.screen = name;
  if (push && location.hash !== `#${name}`) history.pushState({ screen: name }, "", `#${name}`);
  window.scrollTo(0, 0);
  renderScreen(name);
}

// Re-draw the visible screen with fresh data (e.g. after a change synced from another device)
export function refreshCurrentScreen() {
  renderScreen(currentScreen);
}

document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (!go) return;
  closeSheet();
  showScreen(go.dataset.go);
});

window.addEventListener("popstate", () => {
  closeSheet();
  showScreen(initialScreen(), { push: false });
});
