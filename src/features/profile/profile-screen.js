import { $, toast } from "../../core/dom.js";
import { escapeHtml } from "../../core/format.js";
import { getAllItems } from "../../data/items-db.js";
import { getPurchasesAvoidedCount } from "../insights/impact.js";
import { getKarma, getLevelInfo } from "../karma/karma.js";
import { PROFILE_KEY, openOnboarding } from "../onboarding/onboarding.js";
import { getSavedOutfits } from "../style/saved-outfits.js";
import { getAllSentRequestsCount } from "../swap/swap.js";
import { getSignedInUser, renderAccountUI } from "../account/account.js";
import { kv } from "../../core/kv.js";

// =====================================================
// PART 2: Profile Screen Logic
// =====================================================
export const PROFILE_FIRST_NAME_KEY = "weari_profile_first_name";
export const PROFILE_EMAIL_KEY = "weari_profile_email";
export const WEARI_PLUS_WAITLIST_KEY = "weari_plus_waitlist";

// The name typed on the Profile screen, else the first name from the signed-in account
function getProfileFirstName() {
  return kv.getItem(PROFILE_FIRST_NAME_KEY) || (getSignedInUser()?.displayName || "").split(" ")[0] || "";
}

function getProfileEmail() {
  return kv.getItem(PROFILE_EMAIL_KEY) || getSignedInUser()?.email || "";
}

export async function renderProfileScreen() {
  renderAccountUI();
  const name = getProfileFirstName();
  const email = getProfileEmail();

  // 1. Avatar initial
  const initialEl = $("#profile-avatar-initial");
  if (initialEl) {
    initialEl.textContent = (name.trim().charAt(0) || "W").toUpperCase();
  }

  // 2. Editable first name & email inputs
  const nameInput = $("#profile-first-name");
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = name;
  }
  const emailInput = $("#profile-email");
  if (emailInput && document.activeElement !== emailInput) {
    emailInput.value = email;
  }

  // 3. Karma level and progress bar
  const karma = getKarma();
  const levelInfo = getLevelInfo(karma.points);
  const karmaIconEl = $("#profile-karma-icon");
  const karmaLevelNameEl = $("#profile-karma-level-name");
  const karmaPointsEl = $("#profile-karma-points");
  const karmaFillEl = $("#profile-karma-fill");
  const karmaMetaTextEl = $("#profile-karma-meta-text");
  const karmaMetaPctEl = $("#profile-karma-meta-pct");

  if (karmaIconEl) karmaIconEl.textContent = levelInfo.current.icon || "🌱";
  if (karmaLevelNameEl) karmaLevelNameEl.textContent = levelInfo.current.name;
  if (karmaPointsEl) karmaPointsEl.textContent = karma.points;
  if (karmaFillEl) karmaFillEl.style.width = `${levelInfo.pct}%`;
  if (karmaMetaTextEl) karmaMetaTextEl.textContent = levelInfo.progressText;
  if (karmaMetaPctEl) karmaMetaPctEl.textContent = `${levelInfo.pct}%`;

  // 4. My style card (from onboarding answers)
  const answersBox = $("#profile-style-answers");
  if (answersBox) {
    let ob = null;
    try {
      const raw = kv.getItem("weari_onboarding_answers") || kv.getItem(PROFILE_KEY);
      if (raw) ob = JSON.parse(raw);
    } catch {}

    if (ob && (ob.goal || ob.styles || ob.occasions || ob.shopping || ob.closet || ob.pieces)) {
      const rows = [];
      if (ob.goal) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Style goal</span><span class="profile-style-val">${escapeHtml(ob.goal)}</span></div>`);
      if (ob.styles && ob.styles.length) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Vibe / Aesthetics</span><span class="profile-style-val">${escapeHtml(ob.styles.join(", "))}</span></div>`);
      if (ob.occasions && ob.occasions.length) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Frequent occasions</span><span class="profile-style-val">${escapeHtml(ob.occasions.join(", "))}</span></div>`);
      if (ob.shopping) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Shopping habit</span><span class="profile-style-val">${escapeHtml(ob.shopping)}</span></div>`);
      if (ob.closet) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Closet state</span><span class="profile-style-val">${escapeHtml(ob.closet)}</span></div>`);
      if (ob.pieces) rows.push(`<div class="profile-style-row"><span class="profile-style-label">Current closet size</span><span class="profile-style-val">${escapeHtml(ob.pieces)}</span></div>`);
      answersBox.innerHTML = rows.join("");
    } else {
      answersBox.innerHTML = `
        <p class="profile-style-empty">No style answers yet. Tap Edit to personalize your profile.</p>`;
    }
  }

  // 5. My impact row (4 metrics)
  const [items, outfits] = await Promise.all([getAllItems(), getSavedOutfits()]);
  const purchasesAvoided = getPurchasesAvoidedCount();

  const impactPiecesEl = $("#profile-impact-pieces");
  const impactOutfitsEl = $("#profile-impact-outfits");
  const impactRequestsEl = $("#profile-impact-requests");
  const impactAvoidedEl = $("#profile-impact-avoided");

  if (impactPiecesEl) impactPiecesEl.textContent = items.length;
  if (impactOutfitsEl) impactOutfitsEl.textContent = outfits.length;
  if (impactRequestsEl) impactRequestsEl.textContent = getAllSentRequestsCount();
  if (impactAvoidedEl) impactAvoidedEl.textContent = purchasesAvoided;

  // 6. Weari Plus waitlist state
  const isWaitlist = kv.getItem(WEARI_PLUS_WAITLIST_KEY) === "true";
  const btnWaitlist = $("#btn-join-waitlist");
  const waitlistConfirmed = $("#waitlist-confirmed");
  if (btnWaitlist && waitlistConfirmed) {
    btnWaitlist.hidden = isWaitlist;
    waitlistConfirmed.hidden = !isWaitlist;
  }
}

// Profile input listeners
$("#profile-first-name")?.addEventListener("input", (e) => {
  const val = e.target.value;
  try { kv.setItem(PROFILE_FIRST_NAME_KEY, val); } catch {}
  const initialEl = $("#profile-avatar-initial");
  if (initialEl) initialEl.textContent = (val.trim().charAt(0) || "W").toUpperCase();
});

$("#profile-email")?.addEventListener("input", (e) => {
  try { kv.setItem(PROFILE_EMAIL_KEY, e.target.value.trim()); } catch {}
});

$("#btn-join-waitlist")?.addEventListener("click", () => {
  try { kv.setItem(WEARI_PLUS_WAITLIST_KEY, "true"); } catch {}
  const btnWaitlist = $("#btn-join-waitlist");
  const waitlistConfirmed = $("#waitlist-confirmed");
  if (btnWaitlist) btnWaitlist.hidden = true;
  if (waitlistConfirmed) waitlistConfirmed.hidden = false;
  toast("You're on the list! We'll notify you when Weari Plus launches ✨");
});

$("#btn-edit-my-style")?.addEventListener("click", () => {
  openOnboarding(0);
});

$("#btn-profile-replay-ob")?.addEventListener("click", () => {
  openOnboarding(0);
});
