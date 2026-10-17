import { COLLAGE_COLORS } from "../../core/collage.js";
import { $, toast } from "../../core/dom.js";
import { describeHtml, escapeHtml } from "../../core/format.js";
import { kv } from "../../core/kv.js";
import { getAllItems, saveItem } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { renderInsights } from "../insights/insights.js";
import { KARMA_CONFIG, awardKarma, updateKarmaStreak } from "../karma/karma.js";
import { renderWardrobe } from "../wardrobe/wardrobe.js";
import { getFavoriteOutfits } from "./favorites.js";
import { labelDisplay } from "./labels.js";
import { getSavedOutfits } from "./saved-outfits.js";

// =====================================================
// Weekly plan: a 7-day week grid or a month calendar. Tap a day to open it.
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

export function getWeeklyPlan() {
  try {
    const raw = kv.getItem(WEEKLY_PLAN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveWeeklyPlan(plan) {
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

// Week / Month view of the plan (kept in memory only, no storage key)
let planView = "week";
let planMonthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let openPlanDay = null; // { key, date } while the day sheet is open

const PLAN_KEY_BY_JS_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function planLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Monday of the week containing `d`, at local midnight
function planWeekStart(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

// A date shows its weekday's outfit if it falls in this week, or any week when repeating
function planDateIsPlannable(date) {
  if (isPlanRepeatWeekly()) return true;
  const start = planWeekStart(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

function planThumbHtml(outfit) {
  const items = (outfit.items || []).slice(0, 4);
  if (!items.length) return "";
  if (items.length === 1) {
    return `<img class="plan-cell-img" src="${escapeHtml(items[0].photo)}" alt="${describeHtml(items[0])}" />`;
  }
  return `<div class="plan-cell-collage">${items.map((it) => `<img src="${escapeHtml(it.photo)}" alt="" />`).join("")}</div>`;
}

export function renderWeeklyPlan() {
  const strip = $("#plan-days-strip");
  if (!strip) return;

  const plan = getWeeklyPlan();
  const isRepeat = isPlanRepeatWeekly();
  const repeatCheckbox = $("#plan-repeat-checkbox");
  if (repeatCheckbox) repeatCheckbox.checked = isRepeat;

  document.querySelectorAll("#plan-view-toggle [data-plan-view]").forEach((b) => b.classList.toggle("active", b.dataset.planView === planView));
  const monthNav = $("#plan-month-nav");
  if (monthNav) monthNav.hidden = planView !== "month";

  const today = new Date();
  const currentTodayKey = PLAN_KEY_BY_JS_DAY[today.getDay()];
  const todayDateStr = today.toISOString().slice(0, 10);

  if (planView === "week") {
    strip.className = "plan-days-strip plan-week-grid";
    const weekStart = planWeekStart(today);
    strip.innerHTML = PLAN_DAYS.map((day, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const assigned = plan[day.key] || null;
      const isToday = day.key === currentTodayKey;
      const isWornToday = assigned && assigned.lastWornDate === todayDateStr;
      return `
        <button type="button" class="plan-cell ${isToday ? "today" : ""} ${isWornToday ? "worn" : ""}"
          data-plan-open-day="${day.key}" data-plan-open-date="${planLocalDateStr(date)}"
          aria-label="${day.name}${assigned ? `: ${escapeHtml(assigned.name)}` : ", nothing planned"}">
          <span class="plan-cell-letter">${day.name[0]}</span>
          <span class="plan-cell-date">${date.getDate()}</span>
          <span class="plan-cell-thumb collage-${COLLAGE_COLORS[i % COLLAGE_COLORS.length]}">${assigned ? planThumbHtml(assigned) : `<span class="plan-cell-empty">+</span>`}</span>
          ${isWornToday ? `<span class="plan-cell-worn">✓</span>` : ""}
        </button>`;
    }).join("");
  } else {
    strip.className = "plan-days-strip plan-month-grid";
    const label = $("#plan-month-label");
    if (label) label.textContent = planMonthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const year = planMonthCursor.getFullYear();
    const month = planMonthCursor.getMonth();
    const leading = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = planLocalDateStr(today);

    let html = PLAN_DAYS.map((d) => `<span class="plan-month-head">${d.name[0]}</span>`).join("");
    for (let i = 0; i < leading; i++) html += `<span class="plan-month-blank"></span>`;
    for (let n = 1; n <= daysInMonth; n++) {
      const date = new Date(year, month, n);
      const key = PLAN_KEY_BY_JS_DAY[date.getDay()];
      const dateStr = planLocalDateStr(date);
      const hasPlan = Boolean(plan[key]) && planDateIsPlannable(date);
      html += `
        <button type="button" class="plan-month-day ${dateStr === todayStr ? "today" : ""}"
          data-plan-open-day="${key}" data-plan-open-date="${dateStr}">
          <span>${n}</span>
          ${hasPlan ? `<span class="plan-month-dot" aria-label="Outfit planned"></span>` : ""}
        </button>`;
    }
    strip.innerHTML = html;
  }

  if (openPlanDay) renderPlanDaySheet();
}

function renderPlanDaySheet() {
  const body = $("#plan-day-body");
  if (!body || !openPlanDay) return;
  const { key, date } = openPlanDay;
  const [y, m, d] = date.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const day = PLAN_DAYS.find((x) => x.key === key);
  const plan = getWeeklyPlan();
  const assigned = plan[key] || null;
  const plannable = planDateIsPlannable(dateObj);
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const isWornToday = assigned && assigned.lastWornDate === todayDateStr;

  const title = $("#plan-day-title");
  if (title) title.textContent = day ? day.name : "Day";
  const sub = $("#plan-day-sub");
  if (sub) sub.textContent = dateObj.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  if (!plannable) {
    body.innerHTML = `
      <p class="plan-day-note">Your plan covers this week only. Turn on <strong>Repeat weekly</strong> to plan outfits for this day.</p>`;
    return;
  }

  body.innerHTML = assigned
    ? `
      <div class="plan-assigned-box">
        <div class="plan-assigned-title">${escapeHtml(assigned.name)} ${isWornToday ? `<span class="plan-day-worn-tag">✓ Worn</span>` : ""}</div>
        <div class="plan-assigned-strip">
          ${(assigned.items || []).map((it) => `<img class="plan-assigned-img" src="${escapeHtml(it.photo)}" alt="${describeHtml(it)}" title="${describeHtml(it)}" />`).join("")}
        </div>
      </div>
      <div class="plan-day-actions">
        <button type="button" class="btn-primary" data-plan-wear="${key}">
          ${isWornToday ? "✓ Worn today" : "Mark as worn"}
        </button>
        <div class="plan-day-actions-row">
          <button type="button" class="btn-link-action" style="flex:1;" data-plan-move="${key}">Move</button>
          <button type="button" class="btn-danger-link" style="flex:1;" data-plan-clear="${key}">Clear</button>
        </div>
      </div>`
    : `
      <button type="button" class="plan-empty-slot" data-plan-assign-day="${key}">
        <span style="font-size:24px; line-height:1; color:var(--muted);">+</span>
        <strong style="font-size:13.5px; color:var(--text);">Assign outfit</strong>
        <small style="font-size:11.5px; color:var(--muted);">Choose from saved</small>
      </button>`;
}

function openPlanDaySheet(key, date) {
  openPlanDay = { key, date };
  renderPlanDaySheet();
  $("#plan-day-sheet").hidden = false;
  $("#plan-day-backdrop").hidden = false;
}

function closePlanDaySheet() {
  openPlanDay = null;
  $("#plan-day-sheet").hidden = true;
  $("#plan-day-backdrop").hidden = true;
}

$("#plan-day-close")?.addEventListener("click", closePlanDaySheet);
$("#plan-day-backdrop")?.addEventListener("click", closePlanDaySheet);

$("#plan-view-toggle")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-plan-view]");
  if (!btn || btn.dataset.planView === planView) return;
  planView = btn.dataset.planView;
  if (planView === "month") planMonthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  renderWeeklyPlan();
});

$("#plan-month-nav")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-plan-month-step]");
  if (!btn) return;
  planMonthCursor = new Date(planMonthCursor.getFullYear(), planMonthCursor.getMonth() + Number(btn.dataset.planMonthStep), 1);
  renderWeeklyPlan();
});

// Plan repeat weekly checkbox change listener
$("#plan-repeat-checkbox")?.addEventListener("change", (e) => {
  try {
    kv.setItem(PLAN_REPEAT_KEY, String(e.target.checked));
  } catch {}
  toast(e.target.checked ? "Plan set to repeat weekly 🔁" : "Repeat weekly disabled");
  renderWeeklyPlan();
});

// Plan days strip click delegation
let pendingPlanDayKey = null;

async function handlePlanClick(e) {
  const openBtn = e.target.closest("[data-plan-open-day]");
  if (openBtn) {
    openPlanDaySheet(openBtn.dataset.planOpenDay, openBtn.dataset.planOpenDate);
    return;
  }

  const assignBtn = e.target.closest("[data-plan-assign-day]");
  if (assignBtn) {
    const dayKey = assignBtn.dataset.planAssignDay;
    closePlanDaySheet();
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
    closePlanDaySheet();
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
}

$("#plan-days-strip")?.addEventListener("click", handlePlanClick);
$("#plan-day-body")?.addEventListener("click", handlePlanClick);

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
            <small style="color:var(--muted); font-size:11.5px;">${(look.items || []).length} pieces ${look.label ? `· ${escapeHtml(labelDisplay(look.label))}` : ""}</small>
          </div>
          <div class="plan-picker-strip">
            ${(look.items || []).slice(0, 4).map((it) => `<img class="plan-picker-thumb" src="${escapeHtml(it.photo)}" alt="" />`).join("")}
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