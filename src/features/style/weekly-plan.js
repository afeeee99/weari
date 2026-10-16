import { $, toast } from "../../core/dom.js";
import { describeHtml, escapeHtml } from "../../core/format.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { renderInsights } from "../insights/insights.js";
import { KARMA_CONFIG, awardKarma, updateKarmaStreak } from "../karma/karma.js";
import { getFavoriteOutfits } from "./favorites.js";
import { getSavedOutfits } from "./saved-outfits.js";
import { renderWardrobe } from "../wardrobe/wardrobe.js";
import { kv } from "../../core/kv.js";

// =====================================================
// PART 4: Weekly Plan Logic
// =====================================================
export const WEEKLY_PLAN_KEY = "weari_weekly_plan";
export const PLAN_REPEAT_KEY = "weari_plan_repeat_weekly";

const PLAN_DAYS = [
  { key: "mon", name: "Monday" },
  { key: "tue", name: "Tuesday" },
  { key: "wed", name: "Wednesday" },
  { key: "thu", name: "Thursday" },
  { key: "fri", name: "Friday" },
  { key: "sat", name: "Saturday" },
  { key: "sun", name: "Sunday" },
];

function getWeeklyPlan() {
  try {
    const raw = kv.getItem(WEEKLY_PLAN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveWeeklyPlan(plan) {
  try {
    kv.setItem(WEEKLY_PLAN_KEY, JSON.stringify(plan));
  } catch {}
}

function isPlanRepeatWeekly() {
  try {
    return kv.getItem(PLAN_REPEAT_KEY) === "true";
  } catch {
    return false;
  }
}

export function renderWeeklyPlan() {
  const strip = $("#plan-days-strip");
  if (!strip) return;

  const plan = getWeeklyPlan();
  const isRepeat = isPlanRepeatWeekly();
  const repeatCheckbox = $("#plan-repeat-checkbox");
  if (repeatCheckbox) repeatCheckbox.checked = isRepeat;

  // Determine current day of week (0 is Sunday, 1 is Monday, etc.)
  const dayIdx = new Date().getDay();
  const dayKeyMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const currentTodayKey = dayKeyMap[dayIdx];
  const todayDateStr = new Date().toISOString().slice(0, 10);

  strip.innerHTML = PLAN_DAYS.map((day) => {
    const isToday = day.key === currentTodayKey;
    const assigned = plan[day.key] || null;
    const isWornToday = assigned && assigned.lastWornDate === todayDateStr;

    return `
      <div class="plan-day-card ${isToday ? "today" : ""} ${isWornToday ? "worn" : ""}" data-day-key="${day.key}">
        <div class="plan-day-header">
          <h4 class="plan-day-name">${day.name} ${isToday ? `<span class="plan-day-badge-today">Today</span>` : ""}</h4>
          ${isWornToday ? `<span style="font-size:11px; font-weight:600; color:#2f8f5b;">✓ Worn</span>` : ""}
        </div>

        <div class="plan-outfit-preview">
          ${
            assigned
              ? `
            <div class="plan-assigned-box">
              <div class="plan-assigned-title">${escapeHtml(assigned.name)}</div>
              <div class="plan-assigned-strip">
                ${(assigned.items || []).map((it) => `<img class="plan-assigned-img" src="${it.photo}" alt="${describeHtml(it)}" title="${describeHtml(it)}" />`).join("")}
              </div>
            </div>`
              : `
            <button type="button" class="plan-empty-slot" data-plan-assign-day="${day.key}">
              <span style="font-size:24px; line-height:1; color:var(--muted);">+</span>
              <strong style="font-size:13.5px; color:var(--text);">Assign outfit</strong>
              <small style="font-size:11.5px; color:var(--muted);">Choose from saved</small>
            </button>`
          }
        </div>

        ${
          assigned
            ? `
          <div class="plan-day-actions">
            <button type="button" class="btn-primary" style="padding:9px 14px; font-size:13px;" data-plan-wear="${day.key}">
              ${isWornToday ? "✓ Worn today" : "Mark as worn"}
            </button>
            <div class="plan-day-actions-row">
              <button type="button" class="btn-link-action" style="flex:1;" data-plan-move="${day.key}">Move</button>
              <button type="button" class="btn-danger-link" style="flex:1;" data-plan-clear="${day.key}">Clear</button>
            </div>
          </div>`
            : ""
        }
      </div>`;
  }).join("");
}

// Plan repeat weekly checkbox change listener
$("#plan-repeat-checkbox")?.addEventListener("change", (e) => {
  try {
    kv.setItem(PLAN_REPEAT_KEY, String(e.target.checked));
  } catch {}
  toast(e.target.checked ? "Plan set to repeat weekly 🔁" : "Repeat weekly disabled");
});

// Plan days strip click delegation
let pendingPlanDayKey = null;

$("#plan-days-strip")?.addEventListener("click", async (e) => {
  const assignBtn = e.target.closest("[data-plan-assign-day]");
  if (assignBtn) {
    const dayKey = assignBtn.dataset.planAssignDay;
    openPlanPicker(dayKey);
    return;
  }

  const clearBtn = e.target.closest("[data-plan-clear]");
  if (clearBtn) {
    const dayKey = clearBtn.dataset.planClear;
    const plan = getWeeklyPlan();
    delete plan[dayKey];
    saveWeeklyPlan(plan);
    renderWeeklyPlan();
    toast("Outfit cleared from day");
    return;
  }

  const moveBtn = e.target.closest("[data-plan-move]");
  if (moveBtn) {
    const dayKey = moveBtn.dataset.planMove;
    openPlanMoveSheet(dayKey);
    return;
  }

  const wearBtn = e.target.closest("[data-plan-wear]");
  if (wearBtn) {
    const dayKey = wearBtn.dataset.planWear;
    const plan = getWeeklyPlan();
    const outfit = plan[dayKey];
    if (!outfit) return;

    const allItems = await getAllItems();
    const map = new Map(allItems.map((it) => [it.id, it]));
    const nowIso = new Date().toISOString();

    for (const piece of outfit.items || []) {
      const it = map.get(piece.id);
      if (it) {
        it.wearCount = (it.wearCount || 0) + 1;
        it.lastWorn = nowIso;
        await saveItem(it);
      }
    }

    outfit.lastWornDate = new Date().toISOString().slice(0, 10);
    saveWeeklyPlan(plan);
    updateKarmaStreak();
    recordPurchaseAvoided(1);
    awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Wore planned outfit");
    toast(`Logged wear for planned outfit ✨`);
    renderWeeklyPlan();
    renderWardrobe();
    renderInsights();
    return;
  }
});

function openPlanPicker(dayKey) {
  pendingPlanDayKey = dayKey;
  const day = PLAN_DAYS.find((d) => d.key === dayKey);
  const titleEl = $("#plan-picker-title");
  if (titleEl && day) titleEl.textContent = `Assign to ${day.name}`;

  const container = $("#plan-picker-list");
  const saved = getSavedOutfits();
  const favs = getFavoriteOutfits();

  // Combine unique looks
  const combinedMap = new Map();
  for (const f of favs) combinedMap.set(f.id, f);
  for (const s of saved) if (!combinedMap.has(s.id)) combinedMap.set(s.id, s);
  const allLooks = Array.from(combinedMap.values());

  if (container) {
    if (allLooks.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:24px 10px; color:var(--muted);">
          <p style="margin:0 0 10px; font-size:14px;">No saved or favorite outfits found yet.</p>
          <small>Create an outfit in "Create" or "AI Stylist" first, then assign it here.</small>
        </div>`;
    } else {
      container.innerHTML = allLooks.map((look) => `
        <div class="plan-picker-card" data-pick-look-id="${look.id}">
          <div class="plan-picker-info">
            <span class="plan-picker-name">${escapeHtml(look.name)}</span>
            <small style="color:var(--muted); font-size:11.5px;">${(look.items || []).length} pieces ${look.label ? `· ${look.label}` : ""}</small>
          </div>
          <div class="plan-picker-strip">
            ${(look.items || []).slice(0, 4).map((it) => `<img class="plan-picker-thumb" src="${it.photo}" alt="" />`).join("")}
          </div>
        </div>`).join("");
    }
  }

  const sheet = $("#plan-picker-sheet");
  const backdrop = $("#plan-picker-backdrop");
  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function closePlanPicker() {
  const sheet = $("#plan-picker-sheet");
  const backdrop = $("#plan-picker-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  pendingPlanDayKey = null;
}

$("#plan-picker-close")?.addEventListener("click", closePlanPicker);
$("#plan-picker-backdrop")?.addEventListener("click", closePlanPicker);
$("#plan-picker-cancel")?.addEventListener("click", closePlanPicker);

$("#plan-picker-list")?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-pick-look-id]");
  if (!card || !pendingPlanDayKey) return;
  const lookId = card.dataset.pickLookId;

  const saved = getSavedOutfits();
  const favs = getFavoriteOutfits();
  const look = favs.find((f) => f.id === lookId) || saved.find((s) => s.id === lookId);
  if (!look) return;

  const plan = getWeeklyPlan();
  plan[pendingPlanDayKey] = {
    id: look.id,
    name: look.name,
    items: look.items,
    label: look.label || "",
  };
  saveWeeklyPlan(plan);
  const day = PLAN_DAYS.find((d) => d.key === pendingPlanDayKey);
  closePlanPicker();
  renderWeeklyPlan();
  toast(`Assigned to ${day ? day.name : "day"} ✨`);
});

// Move outfit to another day sheet logic
let pendingMoveSourceDayKey = null;

function openPlanMoveSheet(dayKey) {
  pendingMoveSourceDayKey = dayKey;
  const plan = getWeeklyPlan();
  const currentOutfit = plan[dayKey];
  if (!currentOutfit) return;

  const titleEl = $("#plan-move-title");
  if (titleEl) titleEl.textContent = `Move "${currentOutfit.name}"`;

  const container = $("#plan-move-days-list");
  if (container) {
    container.innerHTML = PLAN_DAYS.filter((d) => d.key !== dayKey)
      .map((d) => {
        const hasExisting = Boolean(plan[d.key]);
        return `
          <button type="button" class="plan-move-day-btn" data-target-move-day="${d.key}">
            <span>${d.name}</span>
            <span class="plan-move-day-tag">${hasExisting ? `(swaps with ${escapeHtml(plan[d.key].name)})` : "Empty slot"}</span>
          </button>
        `;
      })
      .join("");
  }

  const sheet = $("#plan-move-sheet");
  const backdrop = $("#plan-move-backdrop");
  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function closePlanMoveSheet() {
  const sheet = $("#plan-move-sheet");
  const backdrop = $("#plan-move-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  pendingMoveSourceDayKey = null;
}

$("#plan-move-close")?.addEventListener("click", closePlanMoveSheet);
$("#plan-move-backdrop")?.addEventListener("click", closePlanMoveSheet);
$("#plan-move-cancel")?.addEventListener("click", closePlanMoveSheet);

$("#plan-move-days-list")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-target-move-day]");
  if (!btn || !pendingMoveSourceDayKey) return;
  const targetDayKey = btn.dataset.targetMoveDay;
  const plan = getWeeklyPlan();
  const movingOutfit = plan[pendingMoveSourceDayKey];
  if (!movingOutfit) return;

  const targetDayObj = PLAN_DAYS.find((d) => d.key === targetDayKey);
  const existingInTarget = plan[targetDayKey] || null;

  plan[targetDayKey] = movingOutfit;
  if (existingInTarget) {
    plan[pendingMoveSourceDayKey] = existingInTarget;
  } else {
    delete plan[pendingMoveSourceDayKey];
  }

  saveWeeklyPlan(plan);
  closePlanMoveSheet();
  renderWeeklyPlan();
  toast(`Outfit moved to ${targetDayObj ? targetDayObj.name : "day"} ✨`);
});
