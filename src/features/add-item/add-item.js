import { STYLIST_BREAK_MSG, callApi } from "../../core/api.js";
import { CATEGORIES, COLORS, OCCASIONS } from "../../core/constants.js";
import { $, toast } from "../../core/dom.js";
import { resizeDataUrl, resizeImage } from "../../core/images.js";
import { showScreen } from "../../core/router.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { startCameraScan } from "../camera/camera.js";
import { KARMA_CONFIG, awardKarma, unlockBadge } from "../karma/karma.js";
import { wardrobeState } from "../wardrobe/wardrobe.js";

// =====================================================
// Add item screen
// =====================================================
const form = {
  photo: null,
  name: "",
  category: null,
  color: null,
  occasions: new Set(),
};

export function buildAddForm() {
  $("#category-chips").innerHTML = CATEGORIES.map(
    (c) => `<button type="button" class="chip" data-category="${c}">${c}</button>`
  ).join("");

  $("#color-swatches").innerHTML = COLORS.map(
    (c) => `<button type="button" class="swatch" data-color="${c.name}" title="${c.name}" aria-label="${c.name}" style="background:${c.hex}"></button>`
  ).join("");

  $("#occasion-chips").innerHTML = OCCASIONS.map(
    (o) => `<button type="button" class="chip" data-occasion="${o}">${o}</button>`
  ).join("");
}

// Auto-tagging with Gemini Vision (called only when user taps "Auto-tag with Gemini")
let activeTagController = null;
let pendingSmallPhoto = null;

const TAG_SOURCE_LABELS = {
  gemini: "Tagged by Gemini",
  mock: "Auto-tagged (test mode, not real Gemini)",
  rules: "Auto-tagged (basic rules)",
};

async function autoTagPhoto(smallPhotoDataUrl) {
  if (activeTagController) {
    activeTagController.abort();
  }
  const controller = new AbortController();
  activeTagController = controller;

  const btnAutotag = $("#btn-autotag");
  const statusEl = $("#autotag-status");
  const badgeEl = $("#gemini-tag-badge");
  const hintEl = $("#autotag-hint");

  if (hintEl) hintEl.hidden = true;
  if (badgeEl) badgeEl.hidden = true;
  if (btnAutotag) {
    btnAutotag.disabled = true;
    btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Gemini is looking...`;
  }
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.innerHTML = `<span class="sparkle-icon">✨</span><span>Gemini is looking...</span>`;
  }

  let data;
  try {
    const res = await callApi("/api/tag", { image: smallPhotoDataUrl }, { timeoutMs: 15000, signal: controller.signal });
    data = { source: res.source, data: res.tags };
  } catch (err) {
    if (activeTagController !== controller) return; // a newer photo replaced this one
    console.warn("Gemini auto-tag unavailable, using basic rules:", err.message);
    // Basic rules: keep what the user already picked, otherwise sensible defaults
    const autoCategory = form.category || "top";
    const autoColor = form.color || "black";
    const autoOccasions = form.occasions.size ? Array.from(form.occasions) : ["casual"];
    data = {
      source: "rules",
      data: {
        name: `${autoColor.charAt(0).toUpperCase() + autoColor.slice(1)} ${autoCategory}`,
        category: autoCategory,
        color: autoColor,
        occasions: autoOccasions,
      },
    };
  }

  try {
    const { name, category, color, occasions } = data.data;

    if (statusEl) statusEl.hidden = true;
    if (btnAutotag) btnAutotag.hidden = true;
    if (badgeEl) {
      const label = TAG_SOURCE_LABELS[data.source] || TAG_SOURCE_LABELS.rules;
      badgeEl.innerHTML = `<span class="sparkle-icon">✨</span><span class="tag-badge-text">${label}</span>`;
      badgeEl.hidden = false;
    }

    // If Gemini couldn't help, say so plainly
    if (hintEl) {
      hintEl.textContent = data.source === "rules" ? STYLIST_BREAK_MSG : "";
      hintEl.hidden = data.source !== "rules";
    }

    // Fill only the fields the user hasn't already filled in
    const nameInput = $("#item-name-input");
    const currentTypedName = (nameInput && nameInput.value.trim()) || form.name;
    if (!currentTypedName && name) {
      form.name = name;
      if (nameInput) nameInput.value = name;
    }

    // Pre-fill category only if user has not chosen one yet
    if (!form.category && category && CATEGORIES.includes(category)) {
      form.category = category;
      document.querySelectorAll("[data-category]").forEach((b) =>
        b.classList.toggle("selected", b.dataset.category === category)
      );
    }

    // Pre-fill color only if user has not chosen one yet
    if (!form.color && color && COLORS.some((c) => c.name === color)) {
      form.color = color;
      document.querySelectorAll("[data-color]").forEach((b) =>
        b.classList.toggle("selected", b.dataset.color === color)
      );
    }

    // Pre-fill occasions only if user has not selected any yet
    if (form.occasions.size === 0 && Array.isArray(occasions) && occasions.length > 0) {
      form.occasions = new Set(occasions.filter((o) => OCCASIONS.includes(o)));
      document.querySelectorAll("[data-occasion]").forEach((b) =>
        b.classList.toggle("selected", form.occasions.has(b.dataset.occasion))
      );
    }
  } catch (err) {
    console.error("Auto-tag failed:", err);
    if (statusEl) statusEl.hidden = true;
    if (btnAutotag) {
      btnAutotag.disabled = false;
      btnAutotag.hidden = false;
      btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Auto-tag with Gemini`;
    }
    const msg = "Couldn't auto-tag this one, please fill it in yourself";
    if (hintEl) {
      hintEl.textContent = msg;
      hintEl.hidden = false;
    }
    toast(msg);
  } finally {
    if (activeTagController === controller) {
      activeTagController = null;
    }
  }
}

// Hook up "✨ Auto-tag with Gemini" button
$("#btn-autotag")?.addEventListener("click", () => {
  if (!pendingSmallPhoto) return;
  autoTagPhoto(pendingSmallPhoto);
});

// Pick one category
$("#category-chips").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-category]");
  if (!btn) return;
  form.category = btn.dataset.category;
  document.querySelectorAll("[data-category]").forEach((b) => b.classList.toggle("selected", b === btn));
});

// Pick one color
$("#color-swatches").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-color]");
  if (!btn) return;
  form.color = btn.dataset.color;
  document.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("selected", b === btn));
});

// Pick any number of occasions
$("#occasion-chips").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-occasion]");
  if (!btn) return;
  const o = btn.dataset.occasion;
  form.occasions.has(o) ? form.occasions.delete(o) : form.occasions.add(o);
  btn.classList.toggle("selected");
});

// Item name manual input
$("#item-name-input")?.addEventListener("input", (e) => {
  form.name = e.target.value.trim();
});

export async function handlePhotoSelected(source) {
  try {
    if (activeTagController) {
      activeTagController.abort();
      activeTagController = null;
    }

    if (source instanceof File || source instanceof Blob) {
      form.photo = await resizeImage(source, 900, 0.82);
      pendingSmallPhoto = await resizeImage(source, 512, 0.7);
    } else if (typeof source === "string") {
      form.photo = source;
      pendingSmallPhoto = await resizeDataUrl(source, 512, 0.7);
    }

    $("#photo-preview").src = form.photo;
    $("#photo-preview").hidden = false;
    $("#photo-placeholder").hidden = true;

    const photoRow = $("#photo-row");
    if (photoRow) photoRow.classList.add("has-photo");
    const photoAside = $("#photo-aside");
    if (photoAside) photoAside.hidden = false;

    const btnAutotag = $("#btn-autotag");
    if (btnAutotag) {
      btnAutotag.hidden = false;
      btnAutotag.disabled = false;
      btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Auto-tag with Gemini`;
    }
    const tagBadge = $("#gemini-tag-badge");
    if (tagBadge) tagBadge.hidden = true;
    const tagStatus = $("#autotag-status");
    if (tagStatus) tagStatus.hidden = true;
    const tagHint = $("#autotag-hint");
    if (tagHint) tagHint.hidden = true;
  } catch (err) {
    showError(err.message || "Could not read that photo");
  }
}

// File upload
$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  handlePhotoSelected(file);
});

function showError(msg) {
  const el = $("#form-error");
  el.textContent = msg;
  el.hidden = !msg;
}

function resetForm() {
  if (activeTagController) {
    activeTagController.abort();
    activeTagController = null;
  }
  pendingSmallPhoto = null;
  form.photo = null;
  form.name = "";
  form.category = null;
  form.color = null;
  form.occasions.clear();
  $("#add-form").reset();
  const nameInput = $("#item-name-input");
  if (nameInput) nameInput.value = "";
  const photoRow = $("#photo-row");
  if (photoRow) photoRow.classList.remove("has-photo");
  const photoAside = $("#photo-aside");
  if (photoAside) photoAside.hidden = true;
  const btnAutotag = $("#btn-autotag");
  if (btnAutotag) {
    btnAutotag.hidden = false;
    btnAutotag.disabled = false;
    btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Auto-tag with Gemini`;
  }
  const tagBadge = $("#gemini-tag-badge");
  if (tagBadge) tagBadge.hidden = true;
  const tagStatus = $("#autotag-status");
  if (tagStatus) tagStatus.hidden = true;
  const tagHint = $("#autotag-hint");
  if (tagHint) tagHint.hidden = true;
  $("#photo-preview").hidden = true;
  $("#photo-placeholder").hidden = false;
  document.querySelectorAll("#screen-add .selected").forEach((el) => el.classList.remove("selected"));
  showError("");
}

// Save
$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.photo) return showError("Please add a photo.");
  if (!form.category) return showError("Please pick a category.");
  if (!form.color) return showError("Please pick a color.");

  const isSwappable = $("#swap-input").checked;
  const nameInput = $("#item-name-input");
  const itemName = (nameInput && nameInput.value.trim()) || form.name || "";

  await saveItem({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: itemName,
    photo: form.photo,
    category: form.category,
    color: form.color,
    occasions: [...form.occasions],
    swappable: isSwappable,
    createdAt: Date.now(),
  });

  awardKarma(KARMA_CONFIG.POINTS.ADD_ITEM, "Added new piece");
  unlockBadge("first_item");
  const allItems = await getAllItems();
  if (allItems.length >= 10) unlockBadge("ten_items");

  if (isSwappable) {
    awardKarma(KARMA_CONFIG.POINTS.MARK_SWAPPABLE, "Available to swap");
  }

  resetForm();
  wardrobeState.filter = "all";
  showScreen("wardrobe");

  // Show "Scan another" banner so user can add many items rapidly
  const quickBanner = $("#quick-add-banner");
  if (quickBanner) quickBanner.hidden = false;

  document.dispatchEvent(new CustomEvent("item-saved"));

  toast("Added to your wardrobe ✨");
});

// "Scan another" button click handler
$("#btn-scan-another")?.addEventListener("click", () => {
  const quickBanner = $("#quick-add-banner");
  if (quickBanner) quickBanner.hidden = true;
  resetForm();
  showScreen("add");
  startCameraScan();
});
