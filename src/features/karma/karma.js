import { renderKarma } from "./karma-screen.js";
import { kv } from "../../core/kv.js";

// =====================================================
// Wardrobe Karma Configuration & Constants
// Keep all point values, levels, and badges in this constant so they are easy to change.
// =====================================================
export const KARMA_CONFIG = {
  POINTS: {
    ADD_ITEM: 10,
    MARK_SWAPPABLE: 15,
    SEND_SWAP_REQUEST: 20,
    WEAR_IDLE_ITEM: 25, // not worn in 30 days or never worn before
    REWEAR_OUTFIT: 10,  // re-wearing an outfit instead of buying new
    SKIP_PURCHASE: 15,  // chose not to buy after a purchase check in Chat
  },
  LEVELS: [
    { name: "Closet Curious", minPoints: 0, icon: "🌱" },
    { name: "Thrift Thinker", minPoints: 50, icon: "🌿" },
    { name: "Swap Starter", minPoints: 120, icon: "🔁" },
    { name: "Wardrobe Hero", minPoints: 220, icon: "⭐" },
    { name: "Planet Stylist", minPoints: 350, icon: "🌍" },
    { name: "Circular Legend", minPoints: 500, icon: "👑" },
  ],
  BADGES: [
    {
      id: "first_item",
      name: "First Item",
      description: "Added your first piece to your digital wardrobe",
      icon: "👗",
    },
    {
      id: "ten_items",
      name: "10 Items Added",
      description: "Curated 10 or more pieces in your closet",
      icon: "✨",
    },
    {
      id: "first_swap_request",
      name: "First Swap Request",
      description: "Sent your first swap request on Rewear",
      icon: "🤝",
    },
    {
      id: "rewear_rookie",
      name: "Rewear Rookie",
      description: "Re-wore an outfit instead of shopping new",
      icon: "🔄",
    },
    {
      id: "seven_day_streak",
      name: "7 Day Streak",
      description: "7 consecutive days of wardrobe engagement",
      icon: "🔥",
    },
    {
      id: "never_worn_rescuer",
      name: "Never-Worn Rescuer",
      description: "Wore or listed an item untouched for 30+ days",
      icon: "🛟",
    },
  ],
};

export const KARMA_STORAGE_KEY = "weari-karma";

export function extractKarma(rawVal) {
  if (rawVal === null || rawVal === undefined) return null;
  let parsed = rawVal;
  if (typeof rawVal === "string") {
    try {
      parsed = JSON.parse(rawVal);
    } catch {
      const num = Number(rawVal);
      if (!isNaN(num)) return { points: num, unlockedBadges: [], streakDays: 1, lastActiveDate: null };
      return null;
    }
  }
  if (typeof parsed === "number") {
    return { points: parsed, unlockedBadges: [], streakDays: 1, lastActiveDate: null };
  }
  if (parsed && typeof parsed === "object") {
    const points = Number(parsed.points ?? parsed.karma ?? parsed.score ?? parsed.value ?? 0) || 0;
    const unlockedBadges = Array.isArray(parsed.unlockedBadges)
      ? parsed.unlockedBadges
      : Array.isArray(parsed.badges)
      ? parsed.badges
      : [];
    const streakDays = Number(parsed.streakDays ?? parsed.streak ?? 1) || 1;
    const lastActiveDate = parsed.lastActiveDate || parsed.last_active_date || null;
    return { points, unlockedBadges, streakDays, lastActiveDate };
  }
  return null;
}

export function getKarma() {
  try {
    const raw = kv.getItem(KARMA_STORAGE_KEY);
    if (raw) {
      const parsed = extractKarma(raw);
      if (parsed) return parsed;
    }
    for (const k of ["weari_karma", "karma", "weari-karma-points", "weari_karma_points", "weariKarma"]) {
      const legacyRaw = kv.getItem(k);
      if (legacyRaw) {
        const parsed = extractKarma(legacyRaw);
        if (parsed) return parsed;
      }
    }
  } catch {}
  return {
    points: 0,
    unlockedBadges: [],
    lastActiveDate: null,
    streakDays: 1,
  };
}

export function saveKarma(data) {
  try {
    kv.setItem(KARMA_STORAGE_KEY, JSON.stringify(data));
  } catch {}
  updateKarmaChip();
}

export function getLevelInfo(points) {
  const levels = KARMA_CONFIG.LEVELS;
  let currentLevelIdx = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (points >= levels[i].minPoints) {
      currentLevelIdx = i;
      break;
    }
  }
  const current = levels[currentLevelIdx];
  const next = levels[currentLevelIdx + 1] || null;
  let pct = 100;
  let progressText = "Max level reached!";
  if (next) {
    const range = next.minPoints - current.minPoints;
    const progress = Math.max(0, points - current.minPoints);
    pct = range > 0 ? Math.min(100, Math.max(0, Math.round((progress / range) * 100))) : 0;
    progressText = `${points} / ${next.minPoints} pts to ${next.name}`;
  }
  return { current, next, pct, progressText };
}

export function updateKarmaChip() {
  const karma = getKarma();
  const chipEl = document.querySelector("#karma-chip-points");
  if (chipEl) {
    chipEl.textContent = karma.points;
  }
}

let karmaPopupTimer = null;
function showKarmaPopup(points, reason = "") {
  const popup = document.querySelector("#karma-popup");
  if (!popup) return;
  popup.textContent = `+${points} Karma! ${reason ? `· ${reason}` : ""}`;
  popup.hidden = false;
  popup.style.animation = "none";
  void popup.offsetWidth;
  popup.style.animation = "";
  clearTimeout(karmaPopupTimer);
  karmaPopupTimer = setTimeout(() => {
    popup.hidden = true;
  }, 2200);
}

function showCelebration(title, desc, icon = "🎉", tag = "Unlocked!") {
  const modal = document.querySelector("#celebration-modal");
  if (!modal) return;
  const titleEl = document.querySelector("#celebration-title");
  const descEl = document.querySelector("#celebration-desc");
  const iconEl = document.querySelector("#celebration-icon");
  const tagEl = document.querySelector("#celebration-tag");
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (iconEl) iconEl.textContent = icon;
  if (tagEl) tagEl.textContent = tag;
  modal.hidden = false;
}

export function awardKarma(points, reason = "") {
  if (!points) return;
  const karma = getKarma();
  const prevLevel = getLevelInfo(karma.points).current;

  karma.points += points;
  saveKarma(karma);
  showKarmaPopup(points, reason);

  const newLevel = getLevelInfo(karma.points).current;
  if (newLevel.name !== prevLevel.name) {
    setTimeout(() => {
      showCelebration(
        newLevel.name,
        `Congratulations! You've advanced to ${newLevel.name}. Keep taking conscious wardrobe actions.`,
        newLevel.icon || "🎉",
        "Level Up!"
      );
    }, 450);
  }

  const karmaScreen = document.querySelector("#screen-karma");
  if (karmaScreen && !karmaScreen.hidden) {
    renderKarma();
  }
}

export function unlockBadge(badgeId) {
  const karma = getKarma();
  if (karma.unlockedBadges.includes(badgeId)) return;
  const badge = KARMA_CONFIG.BADGES.find((b) => b.id === badgeId);
  if (!badge) return;

  karma.unlockedBadges.push(badgeId);
  saveKarma(karma);

  setTimeout(() => {
    showCelebration(
      badge.name,
      badge.description,
      badge.icon || "🏆",
      "Badge Unlocked!"
    );
  }, 500);

  const karmaScreen = document.querySelector("#screen-karma");
  if (karmaScreen && !karmaScreen.hidden) {
    renderKarma();
  }
}

export function updateKarmaStreak() {
  const karma = getKarma();
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!karma.lastActiveDate) {
    karma.lastActiveDate = todayStr;
    karma.streakDays = 1;
    saveKarma(karma);
    return;
  }
  if (karma.lastActiveDate === todayStr) {
    return;
  }
  const lastDate = new Date(karma.lastActiveDate);
  const todayDate = new Date(todayStr);
  const diffDays = Math.round((todayDate - lastDate) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) {
    karma.streakDays = (karma.streakDays || 1) + 1;
  } else if (diffDays > 1) {
    karma.streakDays = 1;
  }
  karma.lastActiveDate = todayStr;
  if (karma.streakDays >= 7) {
    unlockBadge("seven_day_streak");
  }
  saveKarma(karma);
}
