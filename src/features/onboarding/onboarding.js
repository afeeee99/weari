import { $, toast } from "../../core/dom.js";
import { showScreen } from "../../core/router.js";
import { getAllItems } from "../../data/items-db.js";
import { startCameraScan } from "../camera/camera.js";
import { loadDemoWardrobe } from "../demo/demo-wardrobe.js";
import { closeSettings } from "../settings/settings.js";
import { kv } from "../../core/kv.js";

// =====================================================
// Onboarding Flow, Profile Completion, and Settings
// =====================================================
export const ONBOARDING_COMPLETED_KEY = "weari_onboarding_completed";
export const ONBOARDING_ANSWERS_KEY = "weari_onboarding_answers";
export const PROFILE_KEY = "weari_user_profile";
export const PROFILE_DISMISSED_KEY = "weari_profile_dismissed";

let currentObStep = 0;
let returningToOnboarding = false;
const obAnswers = {
  goal: null,
  styles: [],
  occasions: [],
  shopping: null,
};

function loadStoredObAnswers() {
  try {
    const raw = kv.getItem(ONBOARDING_ANSWERS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.goal) obAnswers.goal = data.goal;
      if (Array.isArray(data.styles)) obAnswers.styles = data.styles;
      if (Array.isArray(data.occasions)) obAnswers.occasions = data.occasions;
      if (data.shopping) obAnswers.shopping = data.shopping;
    }
  } catch {}
}

function saveObAnswers() {
  try {
    kv.setItem(ONBOARDING_ANSWERS_KEY, JSON.stringify(obAnswers));
  } catch {}
}

async function updateStarterChecklist() {
  const items = await getAllItems();
  const hasTop = items.some((i) => i.category === "top");
  const hasBottom = items.some((i) => i.category === "bottom");
  const hasLayer = items.some((i) => i.category === "dress" || i.category === "outerwear");
  const hasShoes = items.some((i) => i.category === "shoes");
  const hasFavorite = items.length >= 5 || items.some((i) => i.category === "accessory");

  $("#ob-check-top")?.classList.toggle("checked", hasTop);
  $("#ob-check-bottom")?.classList.toggle("checked", hasBottom);
  $("#ob-check-layer")?.classList.toggle("checked", hasLayer);
  $("#ob-check-shoes")?.classList.toggle("checked", hasShoes);
  $("#ob-check-favorite")?.classList.toggle("checked", hasFavorite);

  const isReady = items.length >= 5 || (hasTop && hasBottom && hasLayer && hasShoes);
  const readyPanel = $("#ob-ready-panel");
  if (readyPanel) readyPanel.hidden = !isReady;
}

export function openOnboarding(step = 0) {
  loadStoredObAnswers();
  currentObStep = step;
  const overlay = $("#onboarding-overlay");
  if (overlay) {
    overlay.hidden = false;
    overlay.scrollTop = 0;
  }
  renderOnboardingStep();
}

function closeOnboarding() {
  const overlay = $("#onboarding-overlay");
  if (overlay) overlay.hidden = true;
}

function completeOnboarding() {
  kv.setItem(ONBOARDING_COMPLETED_KEY, "true");
  closeOnboarding();
}

function renderOnboardingStep() {
  const steps = [
    $("#ob-step-welcome"),
    $("#ob-step-1"),
    $("#ob-step-2"),
    $("#ob-step-3"),
    $("#ob-step-4"),
    $("#ob-step-5"),
  ];

  steps.forEach((el, idx) => {
    if (el) el.hidden = idx !== currentObStep;
  });

  const backBtn = $("#ob-btn-back");
  const progressWrap = $("#ob-progress-wrap");
  const progressFill = $("#ob-progress-fill");
  const stepLabel = $("#ob-step-label");
  const skipBtn = $("#ob-btn-skip-top");

  if (currentObStep === 0) {
    if (backBtn) backBtn.hidden = true;
    if (progressWrap) progressWrap.hidden = true;
    if (skipBtn) skipBtn.hidden = true;
  } else if (currentObStep >= 1 && currentObStep <= 4) {
    if (backBtn) backBtn.hidden = false;
    if (progressWrap) progressWrap.hidden = false;
    if (skipBtn) skipBtn.hidden = false;

    const pct = Math.round((currentObStep / 4) * 100);
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (stepLabel) stepLabel.textContent = `Question ${currentObStep} of 4`;
  } else if (currentObStep === 5) {
    if (backBtn) backBtn.hidden = false;
    if (progressWrap) progressWrap.hidden = true;
    if (skipBtn) skipBtn.hidden = false;
    updateStarterChecklist();
  }

  // Restore options selection state
  if (currentObStep === 1) {
    document.querySelectorAll("#ob-options-goal .ob-option-card").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.val === obAnswers.goal);
    });
    const nextBtn = $("#ob-btn-next-1");
    if (nextBtn) nextBtn.disabled = !obAnswers.goal;
  } else if (currentObStep === 2) {
    document.querySelectorAll("#ob-options-styles .ob-option-card").forEach((btn) => {
      btn.classList.toggle("selected", obAnswers.styles.includes(btn.dataset.val));
    });
    const nextBtn = $("#ob-btn-next-2");
    if (nextBtn) nextBtn.disabled = obAnswers.styles.length === 0;
  } else if (currentObStep === 3) {
    document.querySelectorAll("#ob-options-occasions .ob-option-card").forEach((btn) => {
      btn.classList.toggle("selected", obAnswers.occasions.includes(btn.dataset.val));
    });
    const nextBtn = $("#ob-btn-next-3");
    if (nextBtn) nextBtn.disabled = obAnswers.occasions.length === 0;
  } else if (currentObStep === 4) {
    document.querySelectorAll("#ob-options-shopping .ob-option-card").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.val === obAnswers.shopping);
    });
    const nextBtn = $("#ob-btn-next-4");
    if (nextBtn) nextBtn.disabled = !obAnswers.shopping;
  }
}

// Onboarding Event Listeners
$("#ob-btn-get-started")?.addEventListener("click", () => {
  currentObStep = 1;
  renderOnboardingStep();
});

$("#ob-btn-welcome-skip")?.addEventListener("click", () => {
  completeOnboarding();
  showScreen("wardrobe");
});

$("#ob-btn-skip-top")?.addEventListener("click", () => {
  completeOnboarding();
  showScreen("wardrobe");
});

$("#ob-btn-back")?.addEventListener("click", () => {
  if (currentObStep > 0) {
    currentObStep--;
    renderOnboardingStep();
  }
});

// Quiz 1: What brings you to Weari
$("#ob-options-goal")?.addEventListener("click", (e) => {
  const card = e.target.closest(".ob-option-card");
  if (!card) return;
  obAnswers.goal = card.dataset.val;
  saveObAnswers();
  document.querySelectorAll("#ob-options-goal .ob-option-card").forEach((b) => {
    b.classList.toggle("selected", b === card);
  });
  const nextBtn = $("#ob-btn-next-1");
  if (nextBtn) nextBtn.disabled = false;
});

$("#ob-btn-next-1")?.addEventListener("click", () => {
  currentObStep = 2;
  renderOnboardingStep();
});

// Quiz 2: What is your style (up to 3)
$("#ob-options-styles")?.addEventListener("click", (e) => {
  const card = e.target.closest(".ob-option-card");
  if (!card) return;
  const val = card.dataset.val;
  if (obAnswers.styles.includes(val)) {
    obAnswers.styles = obAnswers.styles.filter((s) => s !== val);
    card.classList.remove("selected");
  } else {
    if (obAnswers.styles.length >= 3) {
      toast("Please choose up to 3 styles");
      return;
    }
    obAnswers.styles.push(val);
    card.classList.add("selected");
  }
  saveObAnswers();
  const nextBtn = $("#ob-btn-next-2");
  if (nextBtn) nextBtn.disabled = obAnswers.styles.length === 0;
});

$("#ob-btn-next-2")?.addEventListener("click", () => {
  currentObStep = 3;
  renderOnboardingStep();
});

// Quiz 3: What do you dress for (choose any)
$("#ob-options-occasions")?.addEventListener("click", (e) => {
  const card = e.target.closest(".ob-option-card");
  if (!card) return;
  const val = card.dataset.val;
  if (obAnswers.occasions.includes(val)) {
    obAnswers.occasions = obAnswers.occasions.filter((o) => o !== val);
    card.classList.remove("selected");
  } else {
    obAnswers.occasions.push(val);
    card.classList.add("selected");
  }
  saveObAnswers();
  const nextBtn = $("#ob-btn-next-3");
  if (nextBtn) nextBtn.disabled = obAnswers.occasions.length === 0;
});

$("#ob-btn-next-3")?.addEventListener("click", () => {
  currentObStep = 4;
  renderOnboardingStep();
});

// Quiz 4: How do you shop
$("#ob-options-shopping")?.addEventListener("click", (e) => {
  const card = e.target.closest(".ob-option-card");
  if (!card) return;
  obAnswers.shopping = card.dataset.val;
  saveObAnswers();
  document.querySelectorAll("#ob-options-shopping .ob-option-card").forEach((b) => {
    b.classList.toggle("selected", b === card);
  });
  const nextBtn = $("#ob-btn-next-4");
  if (nextBtn) nextBtn.disabled = false;
});

$("#ob-btn-next-4")?.addEventListener("click", () => {
  currentObStep = 5;
  renderOnboardingStep();
});

// Starter Closet Actions
$("#ob-btn-starter-camera")?.addEventListener("click", () => {
  returningToOnboarding = true;
  closeOnboarding();
  showScreen("add");
  startCameraScan();
});

$("#ob-btn-starter-upload")?.addEventListener("click", () => {
  returningToOnboarding = true;
  closeOnboarding();
  showScreen("add");
  $("#photo-input")?.click();
});

$("#ob-btn-load-demo")?.addEventListener("click", async () => {
  await loadDemoWardrobe();
});

$("#ob-btn-first-look")?.addEventListener("click", () => {
  completeOnboarding();
  showScreen("style");
});

$("#btn-replay-onboarding")?.addEventListener("click", () => {
  closeSettings();
  openOnboarding(0);
});

// Re-check onboarding starter closet if returning
document.addEventListener("item-saved", async () => {
  if (returningToOnboarding) {
    returningToOnboarding = false;
    openOnboarding(5);
  }
});
