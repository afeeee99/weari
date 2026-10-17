import { $, toast } from "../../core/dom.js";
import { escapeHtml } from "../../core/format.js";
import { kv } from "../../core/kv.js";
import { getFavoriteOutfits, renderFavLabelPresets, renderFavorites, saveFavoriteOutfits } from "./favorites.js";
import { getSavedOutfits, renderSavedOutfits, saveSavedOutfits } from "./saved-outfits.js";
import { getWeeklyPlan, saveWeeklyPlan } from "./weekly-plan.js";

// =====================================================
// Outfit labels: built-in ones (Work, Gym, Weekend) plus my own with an emoji.
// Outfits store the label name as a plain string, so built-in and older
// labels keep working unchanged.
// =====================================================
export const CUSTOM_LABELS_KEY = "weari_custom_labels";
export const BUILTIN_LABELS = ["Work", "Gym", "Weekend"];
const LABEL_EMOJI_PICKS = ["🏋️", "🥂", "✈️", "☕", "🎉", "🌴", "💼", "🏡"];

// The label picked in each place (shared so a rename or delete can update them all)
export const labelState = {
  manual: "", // Create your own: outfit being built
  stylist: "", // Stylist: current suggestion
  savedFilter: "all", // Saved outfits filter chip
  favFilter: "all", // Favorites filter chip
  sheetSelected: "", // label pop-up
};

export function getCustomLabels() {
  try {
    const list = JSON.parse(kv.getItem(CUSTOM_LABELS_KEY) || "[]");
    if (Array.isArray(list)) return list.filter((l) => l && l.id && l.name);
  } catch {}
  return [];
}

function saveCustomLabels(list) {
  try {
    kv.setItem(CUSTOM_LABELS_KEY, JSON.stringify(list));
  } catch {}
}

function findCustomLabel(name) {
  const n = String(name || "").toLowerCase();
  return getCustomLabels().find((l) => l.name.toLowerCase() === n) || null;
}

// "Brunch" -> "🥂 Brunch" for labels with an emoji
export function labelDisplay(name) {
  const custom = findCustomLabel(name);
  return custom && custom.emoji ? `${custom.emoji} ${custom.name}` : String(name || "");
}

// Chip row: [All] + built-in + my labels + other labels found on outfits + [+ New label]
export function labelChipsHtml({ selected = "", attr, withAll = false, extra = [], chipClass = "chip" }) {
  const seen = new Set();
  const names = [];
  const add = (n) => {
    const v = String(n || "").trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      names.push(v);
    }
  };
  BUILTIN_LABELS.forEach(add);
  getCustomLabels().forEach((l) => add(l.name));
  extra.forEach(add);

  const sel = String(selected || "").toLowerCase();
  const chip = (value, text) =>
    `<button type="button" class="${chipClass} label-chip ${sel === value.toLowerCase() ? "selected" : ""}" ${attr}="${escapeHtml(value)}">${escapeHtml(text)}</button>`;

  return (
    (withAll ? chip("all", "All") : "") +
    names.map((n) => chip(n, labelDisplay(n))).join("") +
    `<button type="button" class="${chipClass} label-chip label-chip-new" data-open-label-manager>+ New label</button>`
  );
}

// Tap the same chip again to clear it
const toggle = (current, value) => (current.toLowerCase() === value.toLowerCase() ? "" : value);

// ---------- Create your own: label for the outfit being built ----------
export function renderManualLabelChips() {
  const box = $("#manual-label-chips");
  if (!box) return;
  box.innerHTML = labelChipsHtml({
    selected: labelState.manual,
    attr: "data-manual-label",
    extra: labelState.manual ? [labelState.manual] : [],
  });
}

$("#manual-label-chips")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-label-manager]")) return openLabelManager();
  const chip = e.target.closest("[data-manual-label]");
  if (!chip) return;
  labelState.manual = toggle(labelState.manual, chip.dataset.manualLabel);
  renderManualLabelChips();
});

// ---------- Stylist: label for the suggested look ----------
export function renderStylistLabelChips() {
  const box = $("#stylist-label-chips");
  if (!box) return;
  box.innerHTML = labelChipsHtml({
    selected: labelState.stylist,
    attr: "data-stylist-label",
    extra: labelState.stylist ? [labelState.stylist] : [],
  });
}

// Used by the Stylist result's click handler
export function handleStylistLabelClick(e) {
  if (e.target.closest("#stylist-label-chips [data-open-label-manager]")) {
    openLabelManager();
    return true;
  }
  const chip = e.target.closest("[data-stylist-label]");
  if (!chip) return false;
  labelState.stylist = toggle(labelState.stylist, chip.dataset.stylistLabel);
  renderStylistLabelChips();
  return true;
}

// Re-render everything that shows labels
function refreshLabelViews() {
  renderManualLabelChips();
  renderStylistLabelChips();
  renderSavedOutfits();
  renderFavorites(labelState.favFilter);
  if (!$("#fav-label-sheet")?.hidden) renderFavLabelPresets();
  renderLabelManager();
}

// Rename or clear a label on every stored outfit (saved, favorites, weekly plan)
function relabelOutfits(oldName, newName) {
  const old = oldName.toLowerCase();
  const match = (o) => o && (o.label || "").toLowerCase() === old;
  // Only write a list back when one of its outfits actually changed
  const update = (list) => {
    let changed = 0;
    list.forEach((o) => {
      if (match(o)) {
        o.label = newName;
        changed++;
      }
    });
    return changed;
  };

  const saved = getSavedOutfits();
  if (update(saved)) saveSavedOutfits(saved);
  const favs = getFavoriteOutfits();
  if (update(favs)) saveFavoriteOutfits(favs);
  const plan = getWeeklyPlan();
  if (update(Object.values(plan))) saveWeeklyPlan(plan);

  if (labelState.favFilter.toLowerCase() === old) labelState.favFilter = newName || "all";
  if (labelState.savedFilter.toLowerCase() === old) labelState.savedFilter = newName || "all";
  for (const key of ["manual", "stylist", "sheetSelected"]) {
    if (labelState[key].toLowerCase() === old) labelState[key] = newName;
  }
}

function countOutfitsWithLabel(name) {
  const n = name.toLowerCase();
  return [...getSavedOutfits(), ...getFavoriteOutfits()].filter((o) => (o.label || "").toLowerCase() === n).length;
}

// ---------- Label manager sheet (create, rename, delete) ----------
let labelRenamingId = null;
let labelConfirmAction = null;

export function openLabelManager() {
  resetLabelForm();
  hideLabelConfirm();
  renderLabelManager();
  $("#label-manager-sheet").hidden = false;
  $("#label-manager-backdrop").hidden = false;
  $("#label-name-input")?.focus();
}

function closeLabelManager() {
  $("#label-manager-sheet").hidden = true;
  $("#label-manager-backdrop").hidden = true;
  resetLabelForm();
  hideLabelConfirm();
}

function renderLabelManager() {
  const picks = $("#label-emoji-picks");
  if (picks && !picks.childElementCount) {
    picks.innerHTML = LABEL_EMOJI_PICKS.map((em) => `<button type="button" class="label-emoji-pick" data-emoji-pick="${em}">${em}</button>`).join("");
  }
  const listEl = $("#label-list");
  if (!listEl) return;
  const labels = getCustomLabels();
  listEl.innerHTML = labels.length
    ? `<span class="field-label">My labels</span>` +
      labels
        .map(
          (l) => `
        <div class="label-row">
          <span class="label-row-name">${escapeHtml(l.emoji || "🏷️")} ${escapeHtml(l.name)}</span>
          <button type="button" class="btn-link-action" data-label-rename="${escapeHtml(l.id)}">Rename</button>
          <button type="button" class="btn-danger-link" data-label-delete="${escapeHtml(l.id)}">Delete</button>
        </div>`
        )
        .join("")
    : `<p class="label-empty">No labels of your own yet. Built-in labels: ${BUILTIN_LABELS.join(", ")}.</p>`;
}

function resetLabelForm() {
  labelRenamingId = null;
  $("#label-emoji-input").value = "";
  $("#label-name-input").value = "";
  $("#label-form-title").textContent = "New label";
  $("#label-form-submit").textContent = "Add label";
  $("#label-form-cancel").hidden = true;
  showLabelError("");
}

function showLabelError(msg) {
  const el = $("#label-form-error");
  el.textContent = msg;
  el.hidden = !msg;
}

function showLabelConfirm(text, okText, action) {
  labelConfirmAction = action;
  $("#label-confirm-text").textContent = text;
  $("#label-confirm-ok").textContent = okText;
  $("#label-confirm").hidden = false;
}

function hideLabelConfirm() {
  labelConfirmAction = null;
  $("#label-confirm").hidden = true;
}

$("#label-manager-close")?.addEventListener("click", closeLabelManager);
$("#label-manager-backdrop")?.addEventListener("click", closeLabelManager);
$("#label-form-cancel")?.addEventListener("click", resetLabelForm);
$("#label-confirm-cancel")?.addEventListener("click", hideLabelConfirm);
$("#label-confirm-ok")?.addEventListener("click", () => {
  const action = labelConfirmAction;
  hideLabelConfirm();
  if (action) action();
});

$("#label-emoji-picks")?.addEventListener("click", (e) => {
  const pick = e.target.closest("[data-emoji-pick]");
  if (pick) $("#label-emoji-input").value = pick.dataset.emojiPick;
});

$("#label-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#label-name-input").value.trim().replace(/\s+/g, " ");
  const emoji = $("#label-emoji-input").value.trim() || "🏷️";
  if (!name) return showLabelError("Give your label a short name.");
  if (name.toLowerCase() === "all") return showLabelError("Pick a different name.");

  const labels = getCustomLabels();
  const clash =
    BUILTIN_LABELS.some((b) => b.toLowerCase() === name.toLowerCase()) ||
    labels.some((l) => l.id !== labelRenamingId && l.name.toLowerCase() === name.toLowerCase());
  if (clash) return showLabelError(`You already have a "${name}" label.`);
  showLabelError("");

  if (!labelRenamingId) {
    labels.push({ id: "label_" + Date.now(), name, emoji, createdAt: Date.now() });
    saveCustomLabels(labels);
    resetLabelForm();
    refreshLabelViews();
    toast(`Added label ${emoji} ${name}`);
    return;
  }

  const target = labels.find((l) => l.id === labelRenamingId);
  if (!target) return resetLabelForm();
  const oldName = target.name;
  const used = countOutfitsWithLabel(oldName);
  showLabelConfirm(
    `Rename "${target.emoji} ${oldName}" to "${emoji} ${name}"?${used ? ` ${used} outfit${used === 1 ? "" : "s"} will move to the new name.` : ""}`,
    "Rename",
    () => {
      const fresh = getCustomLabels();
      const t = fresh.find((l) => l.id === target.id);
      if (!t) return;
      t.name = name;
      t.emoji = emoji;
      saveCustomLabels(fresh);
      if (oldName !== name) relabelOutfits(oldName, name);
      resetLabelForm();
      refreshLabelViews();
      toast(`Renamed to ${emoji} ${name}`);
    }
  );
});

$("#label-list")?.addEventListener("click", (e) => {
  const renameBtn = e.target.closest("[data-label-rename]");
  if (renameBtn) {
    const l = getCustomLabels().find((x) => x.id === renameBtn.dataset.labelRename);
    if (!l) return;
    hideLabelConfirm();
    labelRenamingId = l.id;
    $("#label-emoji-input").value = l.emoji || "";
    $("#label-name-input").value = l.name;
    $("#label-form-title").textContent = `Rename ${l.name}`;
    $("#label-form-submit").textContent = "Save name";
    $("#label-form-cancel").hidden = false;
    showLabelError("");
    $("#label-name-input").focus();
    return;
  }

  const deleteBtn = e.target.closest("[data-label-delete]");
  if (deleteBtn) {
    const l = getCustomLabels().find((x) => x.id === deleteBtn.dataset.labelDelete);
    if (!l) return;
    const used = countOutfitsWithLabel(l.name);
    showLabelConfirm(
      `Delete "${l.emoji} ${l.name}"?${used ? ` ${used} outfit${used === 1 ? "" : "s"} will lose this label (the outfits stay).` : ""}`,
      "Delete",
      () => {
        saveCustomLabels(getCustomLabels().filter((x) => x.id !== l.id));
        relabelOutfits(l.name, "");
        if (labelRenamingId === l.id) resetLabelForm();
        refreshLabelViews();
        toast(`Deleted label ${l.name}`);
      }
    );
  }
});
