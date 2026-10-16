import { $ } from "../../core/dom.js";
import { getAllItems } from "../../data/items-db.js";
import { KARMA_CONFIG, getKarma, getLevelInfo, unlockBadge, updateKarmaStreak } from "./karma.js";

// =====================================================
// Karma screen
// =====================================================
export async function renderKarma() {
  const karma = getKarma();
  const items = await getAllItems();
  updateKarmaStreak();

  // Evaluate automatic milestones based on current closet state
  if (items.length >= 1) unlockBadge("first_item");
  if (items.length >= 10) unlockBadge("ten_items");

  // Hero points
  const totalPointsEl = $("#karma-total-points");
  if (totalPointsEl) totalPointsEl.textContent = karma.points;

  // Level & Progress bar
  const levelInfo = getLevelInfo(karma.points);
  const levelNameEl = $("#level-name");
  const levelIconEl = $("#level-icon");
  const levelFillEl = $("#level-bar-fill");
  const levelTextEl = $("#level-progress-text");
  const levelPctEl = $("#level-progress-pct");

  if (levelNameEl) levelNameEl.textContent = levelInfo.current.name;
  if (levelIconEl) levelIconEl.textContent = levelInfo.current.icon || "🌱";
  if (levelFillEl) levelFillEl.style.width = `${levelInfo.pct}%`;
  if (levelTextEl) levelTextEl.textContent = levelInfo.progressText;
  if (levelPctEl) levelPctEl.textContent = `${levelInfo.pct}%`;

  // Streak counter
  const streakDaysEl = $("#streak-days");
  if (streakDaysEl) streakDaysEl.textContent = karma.streakDays || 1;

  // Badges grid
  const unlockedSet = new Set(karma.unlockedBadges);
  const badgesGridEl = $("#badges-grid");
  if (badgesGridEl) {
    badgesGridEl.innerHTML = KARMA_CONFIG.BADGES.map((b) => {
      const isUnlocked = unlockedSet.has(b.id);
      return `
        <div class="badge-card ${isUnlocked ? "unlocked" : "locked"}">
          <div class="badge-icon-wrap">${b.icon}</div>
          <h4 class="badge-name">${b.name}</h4>
          <p class="badge-desc">${b.description}</p>
          <span class="badge-status">${isUnlocked ? "✓ Unlocked" : "🔒 Locked"}</span>
        </div>`;
    }).join("");
  }
}

// Celebration modal close handlers
const celebrationModal = $("#celebration-modal");
if (celebrationModal) {
  celebrationModal.addEventListener("click", (e) => {
    if (e.target.id === "celebration-close" || e.target.id === "celebration-backdrop") {
      celebrationModal.hidden = true;
    }
  });
}
