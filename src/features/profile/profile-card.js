import { $, toast } from "../../core/dom.js";
import { awardKarma } from "../karma/karma.js";
import { PROFILE_DISMISSED_KEY, PROFILE_KEY } from "../onboarding/onboarding.js";
import { kv } from "../../core/kv.js";

// =====================================================
// Profile Completion Card (Wardrobe screen)
// Starts as one compact line; "Start" opens the optional questions.
// =====================================================
let expanded = false;

export function renderProfileCard() {
  const card = $("#profile-card");
  if (!card) return;

  const storedProfile = kv.getItem(PROFILE_KEY);
  const isDismissed = kv.getItem(PROFILE_DISMISSED_KEY);

  if (storedProfile) {
    // Once done, only show the confirmation while the person is editing it
    card.hidden = !expanded;
    card.classList.remove("collapsed");
    $("#profile-card-body").hidden = true;
    $("#profile-card-completed").hidden = false;
    return;
  }

  if (isDismissed) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  card.classList.toggle("collapsed", !expanded);
  $("#profile-card-body").hidden = !expanded;
  $("#profile-card-completed").hidden = true;
}

$("#btn-profile-start")?.addEventListener("click", () => {
  expanded = true;
  renderProfileCard();
});

// Profile pills selection handler
document.querySelectorAll(".profile-pill-group")?.forEach((group) => {
  group.addEventListener("click", (e) => {
    const pill = e.target.closest(".profile-pill");
    if (!pill) return;
    const isAlreadySelected = pill.classList.contains("selected");
    group.querySelectorAll(".profile-pill").forEach((p) => p.classList.remove("selected"));
    if (!isAlreadySelected) {
      pill.classList.add("selected");
    }
  });
});

$("#btn-save-profile")?.addEventListener("click", () => {
  const age = $("#profile-pills-age .profile-pill.selected")?.dataset.val || null;
  const closet = $("#profile-pills-closet .profile-pill.selected")?.dataset.val || null;
  const sustainability = $("#profile-pills-sustainability .profile-pill.selected")?.dataset.val || null;
  const pieces = $("#profile-pills-pieces .profile-pill.selected")?.dataset.val || null;
  const budget = $("#profile-pills-budget .profile-pill.selected")?.dataset.val || null;

  const profile = { age, closet, sustainability, pieces, budget, completedAt: Date.now() };
  kv.setItem(PROFILE_KEY, JSON.stringify(profile));
  awardKarma(25, "Completed style profile");

  $("#profile-card-body").hidden = true;
  $("#profile-card-completed").hidden = false;
  toast("Profile saved (+25 Karma) ✨");
});

$("#btn-edit-profile")?.addEventListener("click", () => {
  expanded = true;
  $("#profile-card-body").hidden = false;
  $("#profile-card-completed").hidden = true;
});

$("#btn-skip-profile")?.addEventListener("click", () => {
  kv.setItem(PROFILE_DISMISSED_KEY, "true");
  const card = $("#profile-card");
  if (card) card.hidden = true;
});

$("#btn-profile-dismiss")?.addEventListener("click", () => {
  kv.setItem(PROFILE_DISMISSED_KEY, "true");
  const card = $("#profile-card");
  if (card) card.hidden = true;
});
