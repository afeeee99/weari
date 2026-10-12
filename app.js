// =====================================================
// Weari — wardrobe app
// Everything is saved in the browser (IndexedDB), so
// no server or database is needed yet.
// =====================================================

// =====================================================
// Wardrobe Karma Configuration & Constants
// Keep all point values, levels, and badges in this constant so they are easy to change.
// =====================================================
const KARMA_CONFIG = {
  POINTS: {
    ADD_ITEM: 10,
    MARK_SWAPPABLE: 15,
    SEND_SWAP_REQUEST: 20,
    WEAR_IDLE_ITEM: 25, // not worn in 30 days or never worn before
    REWEAR_OUTFIT: 10,  // re-wearing an outfit instead of buying new
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

const KARMA_STORAGE_KEY = "weari-karma";

function getKarma() {
  try {
    const raw = localStorage.getItem(KARMA_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        points: Number(data.points) || 0,
        unlockedBadges: Array.isArray(data.unlockedBadges) ? data.unlockedBadges : [],
        lastActiveDate: data.lastActiveDate || null,
        streakDays: Number(data.streakDays) || 1,
      };
    }
  } catch {}
  return {
    points: 0,
    unlockedBadges: [],
    lastActiveDate: null,
    streakDays: 1,
  };
}

function saveKarma(data) {
  try {
    localStorage.setItem(KARMA_STORAGE_KEY, JSON.stringify(data));
  } catch {}
  updateKarmaChip();
}

function getLevelInfo(points) {
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
    pct = Math.min(100, Math.max(0, Math.round((points / next.minPoints) * 100)));
    progressText = `${points} / ${next.minPoints} pts to ${next.name}`;
  }
  return { current, next, pct, progressText };
}

function updateKarmaChip() {
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

function awardKarma(points, reason = "") {
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

function unlockBadge(badgeId) {
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

function updateKarmaStreak() {
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

// =====================================================
// Circular Impact Calculation Configuration
// Keep impact factors in this constant so they are easy to adjust later.
// =====================================================
const IMPACT_CONFIG = {
  // Estimated kg of CO2e avoided per item kept in active rotation or listed to swap
  CO2_PER_ITEM_KG: 6.5,
  // Estimated liters of clean water preserved per item kept in active rotation or listed to swap
  WATER_PER_ITEM_LITERS: 1800,
  // Calculates summary values for the impact display
  calculate(keptInUseCount, swappableCount) {
    const totalActive = keptInUseCount + swappableCount;
    const co2 = (totalActive * this.CO2_PER_ITEM_KG).toFixed(1);
    const water = Math.round(totalActive * this.WATER_PER_ITEM_LITERS).toLocaleString();
    return {
      totalActive,
      headline: `~${co2} kg CO₂e saved`,
      caption: `Estimated impact: ~${co2} kg CO₂e and ~${water}L of water preserved across your ${totalActive} active pieces.`,
    };
  },
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isWornInLast30Days(item) {
  if (!item || !item.lastWorn) return false;
  const time = new Date(item.lastWorn).getTime();
  if (isNaN(time)) return false;
  return Date.now() - time <= THIRTY_DAYS_MS;
}

function formatLastWorn(dateStr) {
  if (!dateStr) return "Never worn";
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return "Never worn";
  const diffDays = Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Worn today";
  if (diffDays === 1) return "Worn yesterday";
  if (diffDays < 30) return `Worn ${diffDays}d ago`;
  return `Worn on ${new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// ---------- The options you can pick from ----------
const CATEGORIES = ["top", "bottom", "dress", "shoes", "outerwear", "accessory"];

const COLORS = [
  { name: "black", hex: "#1c1b1a" },
  { name: "white", hex: "#ffffff" },
  { name: "grey", hex: "#9e9e9e" },
  { name: "beige", hex: "#e4d5b7" },
  { name: "brown", hex: "#7b5236" },
  { name: "red", hex: "#d64545" },
  { name: "pink", hex: "#f2a7c3" },
  { name: "orange", hex: "#f08a3c" },
  { name: "yellow", hex: "#f4d03f" },
  { name: "green", hex: "#4caf6d" },
  { name: "blue", hex: "#4a90e2" },
  { name: "navy", hex: "#22325c" },
  { name: "purple", hex: "#8e5cc4" },
  { name: "multi", hex: "conic-gradient(#d64545, #f4d03f, #4caf6d, #4a90e2, #8e5cc4, #d64545)" },
];

const OCCASIONS = ["casual", "work", "party", "wedding", "date night", "formal", "sport", "travel", "beach"];

// =====================================================
// Storage (IndexedDB = the browser's built-in database)
// =====================================================
const DB_NAME = "weari";
const STORE = "items";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbRun(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

const getAllItems = () => dbRun("readonly", (s) => s.getAll());
const saveItem = (item) => dbRun("readwrite", (s) => s.put(item));
const deleteItem = (id) => dbRun("readwrite", (s) => s.delete(id));

// =====================================================
// Photo: shrink it before saving so storage stays small
// =====================================================
function resizeImage(file, maxSize = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================
// Screens (switching between Wardrobe and Add item)
// =====================================================
const $ = (sel) => document.querySelector(sel);

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== `screen-${name}`));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.go === name));
  window.scrollTo(0, 0);
  if (name === "wardrobe") renderWardrobe();
  if (name === "style") {
    renderStyleOccasions();
    renderManualOutfit();
    renderSavedOutfits();
  }
  if (name === "swap") renderSwap();
  if (name === "insights") renderInsights();
  if (name === "karma") renderKarma();
}

document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (!go) return;
  closeSheet();
  showScreen(go.dataset.go);
});

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

// =====================================================
// Wardrobe screen
// =====================================================
let activeFilter = "all";

function colorHex(name) {
  return (COLORS.find((c) => c.name === name) || {}).hex || "#ccc";
}

function renderFilters(items) {
  const options = ["all", ...CATEGORIES, "swap"];
  $("#filters").innerHTML = options
    .map((opt) => {
      const label = opt === "swap" ? "Up for swap" : opt === "all" ? `All (${items.length})` : opt;
      return `<button class="chip ${opt === activeFilter ? "selected" : ""}" data-filter="${opt}">${label}</button>`;
    })
    .join("");
}

$("#filters").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  renderWardrobe();
});

async function renderWardrobe() {
  const items = (await getAllItems()).sort((a, b) => b.createdAt - a.createdAt);
  $("#item-count").textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "";

  $("#empty-state").hidden = items.length > 0;
  $("#filters").hidden = items.length === 0;
  renderFilters(items);
  renderProfileCard();

  const shown = items.filter((it) =>
    activeFilter === "all" ? true : activeFilter === "swap" ? it.swappable : it.category === activeFilter
  );

  $("#grid").innerHTML = shown
    .map(
      (it) => `
      <article class="card">
        <img src="${it.photo}" alt="${it.color} ${it.category}" loading="lazy" />
        ${it.swappable ? `<span class="swap-badge">Swap</span>` : ""}
        <button class="delete-btn" data-delete="${it.id}" aria-label="Delete item">×</button>
        <div class="card-body">
          <div class="card-top">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="card-cat">${describe(it)}</span>
          </div>
          <div class="tags">${it.occasions.map((o) => `<span class="tag">${o}</span>`).join("")}</div>
          <div class="card-wear-row">
            <button type="button" class="btn-worn" data-mark-worn="${it.id}">
              <span>✓ Mark as worn</span>
              ${it.wearCount ? `<span class="wear-count-tag">(${it.wearCount}×)</span>` : ""}
            </button>
            <span class="card-last-worn">${formatLastWorn(it.lastWorn)}</span>
          </div>
        </div>
      </article>`
    )
    .join("");

  if (items.length && !shown.length) {
    $("#grid").innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted)">Nothing here yet.</p>`;
  }
}

$("#grid").addEventListener("click", async (e) => {
  const markWornBtn = e.target.closest("[data-mark-worn]");
  if (markWornBtn) {
    const id = markWornBtn.dataset.markWorn;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      const wasIdle = !it.lastWorn || (Date.now() - new Date(it.lastWorn).getTime() > THIRTY_DAYS_MS);
      it.wearCount = (it.wearCount || 0) + 1;
      it.lastWorn = new Date().toISOString();
      await saveItem(it);
      renderWardrobe();
      toast(`Marked as worn (${it.wearCount} total) ✨`);
      updateKarmaStreak();
      if (wasIdle) {
        awardKarma(KARMA_CONFIG.POINTS.WEAR_IDLE_ITEM, "Rescued idle piece");
        unlockBadge("never_worn_rescuer");
      } else {
        awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore favorite piece");
      }
      unlockBadge("rewear_rookie");
    }
    return;
  }

  const btn = e.target.closest("[data-delete]");
  if (!btn) return;
  if (!confirm("Remove this item from your wardrobe?")) return;
  await deleteItem(btn.dataset.delete);
  renderWardrobe();
  toast("Item removed");
});

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

function buildAddForm() {
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

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const res = await fetch("/api/tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: smallPhotoDataUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success || !data.data) {
      const msg = "Couldn't auto-tag this one, please fill it in yourself";
      if (statusEl) statusEl.hidden = true;
      if (btnAutotag) {
        btnAutotag.disabled = false;
        btnAutotag.hidden = false;
        btnAutotag.innerHTML = `<span class="sparkle-icon">✨</span> Auto-tag with Gemini`;
      }
      if (hintEl) {
        hintEl.textContent = msg;
        hintEl.hidden = false;
      }
      toast(msg);
      return;
    }

    const { name, category, color, occasions, confidence } = data.data;

    if (statusEl) statusEl.hidden = true;
    if (btnAutotag) btnAutotag.hidden = true;
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="sparkle-icon">✨</span><span class="tag-badge-text">Tagged by Gemini</span>`;
      badgeEl.hidden = false;
    }

    // Confidence indicator: when low, show "Please double check these tags"
    if (confidence === "low") {
      if (hintEl) {
        hintEl.textContent = "Please double check these tags";
        hintEl.hidden = false;
      }
    } else {
      if (hintEl) hintEl.hidden = true;
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
    clearTimeout(timeoutId);
    if (controller.signal.aborted && activeTagController !== controller) {
      return;
    }
    console.error("Auto-tag failed or timed out:", err);
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

// Photo selection & Camera Scanning
function resizeDataUrl(dataUrl, maxSize = 512, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function handlePhotoSelected(source) {
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

// Camera Viewfinder Lifecycle
let cameraStream = null;
let currentFacingMode = "environment";
let capturedPhoto512 = null;

function resetCameraReviewUI() {
  const video = $("#camera-video");
  const frozenImg = $("#camera-frozen-img");
  const guide = $("#camera-guide");
  const captureControls = $("#camera-capture-controls");
  const reviewControls = $("#camera-review-controls");

  if (frozenImg) {
    frozenImg.src = "";
    frozenImg.hidden = true;
  }
  if (video) {
    video.hidden = false;
    if (cameraStream && video.paused) {
      video.play().catch(() => {});
    }
  }
  if (guide) guide.hidden = false;
  if (captureControls) captureControls.hidden = false;
  if (reviewControls) reviewControls.hidden = true;
  capturedPhoto512 = null;
}

function captureAndResizeCameraFrame(video, maxSize = 512, quality = 0.82) {
  const vWidth = video.videoWidth || 640;
  const vHeight = video.videoHeight || 480;
  const scale = Math.min(1, maxSize / Math.max(vWidth, vHeight));
  const targetW = Math.max(1, Math.round(vWidth * scale));
  const targetH = Math.max(1, Math.round(vHeight * scale));

  const canvas = $("#camera-canvas") || document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", quality);
}

async function startCameraScan() {
  const modal = $("#camera-modal");
  const video = $("#camera-video");
  const fallbackInput = $("#camera-fallback-file");

  resetCameraReviewUI();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Camera is unavailable on this device. Opening file picker instead.");
    fallbackInput?.click();
    return;
  }

  try {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
    } catch (constrainedErr) {
      console.warn("Retrying camera with general constraints...", constrainedErr);
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }

    if (video) {
      video.srcObject = cameraStream;
      await video.play().catch(() => {});
    }

    if (modal) modal.hidden = false;
    const flipBtn = $("#camera-flip");
    if (flipBtn) flipBtn.hidden = false;
  } catch (err) {
    console.warn("Camera getUserMedia blocked or unavailable:", err);
    stopCameraScan();
    toast("Camera is blocked or unavailable. Please choose a photo from files.");
    fallbackInput?.click();
  }
}

function stopCameraScan() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const video = $("#camera-video");
  if (video) {
    video.srcObject = null;
  }
  const modal = $("#camera-modal");
  if (modal) modal.hidden = true;
  resetCameraReviewUI();
}

$("#camera-close")?.addEventListener("click", stopCameraScan);
$("#camera-backdrop")?.addEventListener("click", stopCameraScan);

// Freeze photo, resize to 512px, show "Use photo" and "Retake"
$("#camera-snap")?.addEventListener("click", () => {
  const video = $("#camera-video");
  if (!video) return;

  try {
    const resized512 = captureAndResizeCameraFrame(video, 512, 0.82);
    capturedPhoto512 = resized512;

    // Freeze video stream visually
    video.pause();
    video.hidden = true;

    // Show frozen preview
    const frozenImg = $("#camera-frozen-img");
    if (frozenImg) {
      frozenImg.src = resized512;
      frozenImg.hidden = false;
    }

    // Hide guide box during review
    const guide = $("#camera-guide");
    if (guide) guide.hidden = true;

    // Switch buttons to review mode
    const captureControls = $("#camera-capture-controls");
    if (captureControls) captureControls.hidden = true;
    const reviewControls = $("#camera-review-controls");
    if (reviewControls) reviewControls.hidden = false;
  } catch (err) {
    console.error("Failed to capture frame:", err);
    toast("Could not capture photo. Please try again.");
  }
});

// Retake photo: resume live camera preview
$("#camera-retake")?.addEventListener("click", () => {
  resetCameraReviewUI();
});

// Use photo: stop camera stream and fill Add item form with the 512px photo
$("#camera-use-photo")?.addEventListener("click", () => {
  if (!capturedPhoto512) return;
  const photoToUse = capturedPhoto512;
  stopCameraScan();
  handlePhotoSelected(photoToUse);
});

$("#camera-flip")?.addEventListener("click", () => {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  startCameraScan();
});

$("#camera-fallback-file")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  stopCameraScan();
  handlePhotoSelected(file);
});

$("#btn-camera-scan")?.addEventListener("click", () => {
  startCameraScan();
});

$("#btn-rescan")?.addEventListener("click", () => {
  startCameraScan();
});

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
  activeFilter = "all";
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

// =====================================================
// Style me screen — Dual Modes: AI Stylist & Create your own
// =====================================================
let currentStyleMode = "ai";
let styleOccasion = null;
let lastOutfitIds = [];

// Saved Custom Outfits Storage
const SAVED_OUTFITS_KEY = "weari_saved_outfits";

function getSavedOutfits() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_OUTFITS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSavedOutfits(list) {
  try {
    localStorage.setItem(SAVED_OUTFITS_KEY, JSON.stringify(list));
  } catch {}
}

// Manual Outfit Slot State
const manualSlots = {
  top: null,
  "bottom-or-dress": null,
  shoes: null,
  outerwear: null,
  accessory: null,
};

let activePickerSlot = null;

// Style Mode Tabs Switcher
document.querySelectorAll("#style-mode-tabs [data-style-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentStyleMode = btn.dataset.styleMode;
    document.querySelectorAll("#style-mode-tabs [data-style-mode]").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    const aiView = $("#style-mode-ai");
    const manualView = $("#style-mode-manual");
    if (aiView) aiView.hidden = currentStyleMode !== "ai";
    if (manualView) {
      manualView.hidden = currentStyleMode !== "manual";
      if (currentStyleMode === "manual") {
        renderManualOutfit();
        renderSavedOutfits();
      }
    }
  });
});

function renderManualOutfit() {
  const slotKeys = ["top", "bottom-or-dress", "shoes", "outerwear", "accessory"];
  const slotLabels = {
    top: "Pick top",
    "bottom-or-dress": "Pick bottom or dress",
    shoes: "Pick shoes",
    outerwear: "Pick outerwear",
    accessory: "Pick accessory",
  };

  slotKeys.forEach((key) => {
    const bodyEl = $(`#slot-body-${key}`);
    if (!bodyEl) return;
    const item = manualSlots[key];

    if (!item) {
      bodyEl.innerHTML = `
        <button type="button" class="slot-pick-btn" data-slot-target="${key}">
          <span class="slot-plus">+</span>
          <span class="slot-text">${slotLabels[key]}</span>
        </button>`;
    } else {
      bodyEl.innerHTML = `
        <div class="slot-filled-card">
          <img src="${item.photo}" alt="${describe(item)}" />
          <button type="button" class="slot-remove-btn" data-remove-slot="${key}" title="Remove piece" aria-label="Remove piece">✕</button>
          <div class="slot-filled-overlay">
            <span class="slot-filled-name">${describe(item)}</span>
          </div>
        </div>`;
    }
  });
}

// Slot picker bottom sheet
async function openSlotPicker(slotKey) {
  activePickerSlot = slotKey;
  const sheet = $("#slot-picker-sheet");
  const backdrop = $("#slot-picker-backdrop");
  const title = $("#slot-picker-title");
  const sub = $("#slot-picker-sub");
  const grid = $("#slot-picker-grid");

  const slotFriendly = {
    top: "Top",
    "bottom-or-dress": "Bottom or Dress",
    shoes: "Shoes",
    outerwear: "Outerwear",
    accessory: "Accessory",
  };

  if (title) title.textContent = `Pick ${slotFriendly[slotKey] || "piece"}`;
  if (sub) sub.textContent = "Choose an item from your wardrobe";

  const allItems = await getAllItems();
  let matching = [];

  if (slotKey === "top") {
    matching = allItems.filter((it) => it.category === "top");
  } else if (slotKey === "bottom-or-dress") {
    matching = allItems.filter((it) => it.category === "bottom" || it.category === "dress");
  } else if (slotKey === "shoes") {
    matching = allItems.filter((it) => it.category === "shoes");
  } else if (slotKey === "outerwear") {
    matching = allItems.filter((it) => it.category === "outerwear");
  } else if (slotKey === "accessory") {
    matching = allItems.filter((it) => it.category === "accessory");
  }

  if (matching.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 24px 10px; color: var(--muted);">
        <p style="margin: 0 0 14px; font-size: 14px;">No ${slotFriendly[slotKey].toLowerCase()} in your wardrobe yet.</p>
        <button type="button" class="btn-primary" data-go="add" onclick="closeSlotPicker()">+ Add item</button>
      </div>`;
  } else {
    grid.innerHTML = matching
      .map(
        (it) => `
      <div class="slot-picker-card" data-pick-item-id="${it.id}">
        <img src="${it.photo}" alt="${describe(it)}" loading="lazy" />
        <span class="slot-picker-name">${describe(it)}</span>
        <span class="slot-picker-sub">${formatLastWorn(it.lastWorn)}</span>
      </div>`
      )
      .join("");
  }

  if (sheet) sheet.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function closeSlotPicker() {
  const sheet = $("#slot-picker-sheet");
  const backdrop = $("#slot-picker-backdrop");
  if (sheet) sheet.hidden = true;
  if (backdrop) backdrop.hidden = true;
  activePickerSlot = null;
}

$("#slot-picker-close")?.addEventListener("click", closeSlotPicker);
$("#slot-picker-cancel")?.addEventListener("click", closeSlotPicker);
$("#slot-picker-backdrop")?.addEventListener("click", closeSlotPicker);

$("#slot-picker-grid")?.addEventListener("click", async (e) => {
  const card = e.target.closest("[data-pick-item-id]");
  if (!card || !activePickerSlot) return;
  const id = card.dataset.pickItemId;
  const allItems = await getAllItems();
  const chosen = allItems.find((it) => it.id === id);
  if (chosen) {
    manualSlots[activePickerSlot] = chosen;
    renderManualOutfit();
    closeSlotPicker();
  }
});

// Slot interactions in Create your own
$("#style-mode-manual")?.addEventListener("click", (e) => {
  const pickBtn = e.target.closest("[data-slot-target]");
  if (pickBtn) {
    openSlotPicker(pickBtn.dataset.slotTarget);
    return;
  }

  const removeBtn = e.target.closest("[data-remove-slot]");
  if (removeBtn) {
    const key = removeBtn.dataset.removeSlot;
    manualSlots[key] = null;
    renderManualOutfit();
    return;
  }
});

$("#btn-clear-slots")?.addEventListener("click", () => {
  manualSlots.top = null;
  manualSlots["bottom-or-dress"] = null;
  manualSlots.shoes = null;
  manualSlots.outerwear = null;
  manualSlots.accessory = null;
  const reviewBox = $("#manual-review-box");
  if (reviewBox) reviewBox.hidden = true;
  renderManualOutfit();
  toast("Cleared slots");
});

// "✓ I wore this" button in Create your own
$("#btn-manual-wore")?.addEventListener("click", async () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your slots first!");
    return;
  }

  const nowIso = new Date().toISOString();
  for (const piece of activePieces) {
    piece.wearCount = (piece.wearCount || 0) + 1;
    piece.lastWorn = nowIso;
    await saveItem(piece);
  }

  updateKarmaStreak();
  awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Wore custom outfit");
  unlockBadge("rewear_rookie");

  toast(`Logged wear for all ${activePieces.length} pieces ✨`);
});

// "💾 Save" button in Create your own
$("#btn-manual-save")?.addEventListener("click", () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your slots before saving!");
    return;
  }

  const nameInput = $("#manual-outfit-name");
  const outfitName = (nameInput && nameInput.value.trim()) || "My Custom Look";

  const saved = getSavedOutfits();
  saved.unshift({
    id: String(Date.now()),
    name: outfitName,
    items: activePieces.map((it) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      color: it.color,
      photo: it.photo,
    })),
    createdAt: Date.now(),
  });
  saveSavedOutfits(saved);
  awardKarma(10, "Saved custom look");
  renderSavedOutfits();
  toast(`Saved outfit "${outfitName}"! ✨`);
});

// "✨ Ask Gemini to review my look" button
$("#btn-manual-review")?.addEventListener("click", async () => {
  const activePieces = Object.values(manualSlots).filter(Boolean);
  if (activePieces.length === 0) {
    toast("Pick pieces into your outfit slots first!");
    return;
  }

  const btn = $("#btn-manual-review");
  const reviewBox = $("#manual-review-box");
  const nameInput = $("#manual-outfit-name");
  const outfitName = (nameInput && nameInput.value.trim()) || "My Outfit";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="sparkle-icon">✨</span> Gemini is reviewing...`;
  }

  if (reviewBox) {
    reviewBox.hidden = false;
    reviewBox.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13.5px;">
        <span class="sparkle-icon">✨</span><span>Gemini is reviewing your look...</span>
      </div>`;
  }

  try {
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: activePieces.map((it) => ({
          name: it.name,
          category: it.category,
          color: it.color,
          role: it.category,
        })),
        outfitName,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success || !data.review) {
      const msg = "Our stylist is busy right now, but your outfit looks great! Tap to ask again.";
      if (reviewBox) {
        reviewBox.innerHTML = `
          <div class="review-header">✨ Stylist Review</div>
          <p class="review-text">${escapeHtml(msg)}</p>`;
      }
      toast("Stylist is busy right now");
      return;
    }

    if (reviewBox) {
      reviewBox.innerHTML = `
        <div class="review-header">✨ Stylist Review</div>
        <p class="review-text">"${escapeHtml(data.review)}"</p>`;
    }
  } catch (err) {
    const msg = "Our stylist is busy right now, but your outfit looks great! Tap to ask again.";
    if (reviewBox) {
      reviewBox.innerHTML = `
        <div class="review-header">✨ Stylist Review</div>
        <p class="review-text">${escapeHtml(msg)}</p>`;
    }
    toast("Stylist is busy right now");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="sparkle-icon">✨</span> Ask Gemini to review my look`;
    }
  }
});

// Render Saved Outfits List
function renderSavedOutfits() {
  const container = $("#saved-outfits-list");
  if (!container) return;
  const list = getSavedOutfits();

  if (list.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:var(--muted); margin:0;">No saved outfits yet. Assemble pieces above and tap Save.</p>`;
    return;
  }

  container.innerHTML = list
    .map(
      (outfit) => `
    <article class="saved-outfit-card" data-outfit-id="${outfit.id}">
      <div class="saved-outfit-header">
        <h4 class="saved-outfit-title">${escapeHtml(outfit.name)}</h4>
        <button type="button" class="btn-link-action" data-delete-outfit="${outfit.id}" title="Delete look">Delete</button>
      </div>
      <div class="saved-outfit-strip">
        ${outfit.items.map((it) => `<img class="saved-strip-img" src="${it.photo}" alt="${describe(it)}" title="${describe(it)}" />`).join("")}
      </div>
      <div class="saved-outfit-actions">
        <button type="button" class="btn-card-small primary" data-wear-saved="${outfit.id}">✓ I wore this</button>
        <button type="button" class="btn-card-small" data-load-saved="${outfit.id}">Load into slots</button>
      </div>
    </article>`
    )
    .join("");
}

$("#saved-outfits-list")?.addEventListener("click", async (e) => {
  const deleteBtn = e.target.closest("[data-delete-outfit]");
  if (deleteBtn) {
    const id = deleteBtn.dataset.deleteOutfit;
    const list = getSavedOutfits().filter((o) => o.id !== id);
    saveSavedOutfits(list);
    renderSavedOutfits();
    toast("Deleted saved look");
    return;
  }

  const wearBtn = e.target.closest("[data-wear-saved]");
  if (wearBtn) {
    const id = wearBtn.dataset.wearSaved;
    const outfit = getSavedOutfits().find((o) => o.id === id);
    if (!outfit) return;
    const nowIso = new Date().toISOString();
    const allItems = await getAllItems();
    for (const piece of outfit.items) {
      const it = allItems.find((x) => x.id === piece.id);
      if (it) {
        it.wearCount = (it.wearCount || 0) + 1;
        it.lastWorn = nowIso;
        await saveItem(it);
      }
    }
    updateKarmaStreak();
    awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore saved outfit");
    toast(`Logged wear for "${outfit.name}" ✨`);
    return;
  }

  const loadBtn = e.target.closest("[data-load-saved]");
  if (loadBtn) {
    const id = loadBtn.dataset.loadSaved;
    const outfit = getSavedOutfits().find((o) => o.id === id);
    if (!outfit) return;
    const allItems = await getAllItems();

    manualSlots.top = null;
    manualSlots["bottom-or-dress"] = null;
    manualSlots.shoes = null;
    manualSlots.outerwear = null;
    manualSlots.accessory = null;

    for (const piece of outfit.items) {
      const full = allItems.find((x) => x.id === piece.id);
      if (!full) continue;
      if (full.category === "top" && !manualSlots.top) manualSlots.top = full;
      else if ((full.category === "bottom" || full.category === "dress") && !manualSlots["bottom-or-dress"]) manualSlots["bottom-or-dress"] = full;
      else if (full.category === "shoes" && !manualSlots.shoes) manualSlots.shoes = full;
      else if (full.category === "outerwear" && !manualSlots.outerwear) manualSlots.outerwear = full;
      else if (full.category === "accessory" && !manualSlots.accessory) manualSlots.accessory = full;
    }

    const nameInput = $("#manual-outfit-name");
    if (nameInput) nameInput.value = outfit.name;
    renderManualOutfit();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast(`Loaded "${outfit.name}" into slots ✨`);
    return;
  }
});

async function renderStyleOccasions() {
  const items = await getAllItems();
  const countFor = (o) => items.filter((it) => it.occasions.includes(o)).length;

  $("#style-occasions").innerHTML = OCCASIONS.map((o) => {
    const n = countFor(o);
    return `<button type="button" class="chip ${o === styleOccasion ? "selected" : ""}" data-style-occasion="${o}">
      ${o}${n ? ` <span class="chip-count">${n}</span>` : ""}</button>`;
  }).join("");
}

$("#style-occasions").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-style-occasion]");
  if (!btn) return;
  styleOccasion = btn.dataset.styleOccasion;
  lastOutfitIds = [];
  document.querySelectorAll("[data-style-occasion]").forEach((b) => b.classList.toggle("selected", b === btn));
  $("#suggest-btn").disabled = false;
  $("#style-result").innerHTML = "";
});

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let currentSuggestedOutfit = [];
let priorityStyleItemId = null;

async function showSuggestion(forcedItemId = null) {
  if (forcedItemId) {
    priorityStyleItemId = forcedItemId;
  }
  if (!styleOccasion) return;

  const suggestBtn = $("#suggest-btn");
  const origBtnText = suggestBtn ? suggestBtn.textContent : "Suggest outfit";
  if (suggestBtn) {
    suggestBtn.disabled = true;
    suggestBtn.textContent = "Styling with Gemini...";
  }

  const box = $("#style-result");
  const tryAnotherBtn = $("#try-another");
  if (tryAnotherBtn) {
    tryAnotherBtn.disabled = true;
    tryAnotherBtn.textContent = "Styling with Gemini...";
  }

  if (!box.children.length) {
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">✨</div>
        <p>Gemini is styling a look for <strong>${styleOccasion}</strong>...</p>
      </div>`;
  }

  try {
    const items = await getAllItems();
    const result = await suggestOutfit(items, styleOccasion, lastOutfitIds, priorityStyleItemId);

    if (result.missing) {
      box.innerHTML = `
        <div class="notice">
          <div class="notice-icon">🧺</div>
          <p>${escapeHtml(result.missing)}</p>
          <button class="btn-secondary" data-go="add">Add item</button>
        </div>`;
      return;
    }

    currentSuggestedOutfit = result.outfit;
    lastOutfitIds = result.outfit.map((p) => p.item.id);
    box.innerHTML = `
      <h3 class="outfit-title">Your ${styleOccasion} look</h3>
      <div class="grid outfit-grid">
        ${result.outfit
          .map(
            ({ role, item }) => `
          <article class="card">
            <img src="${item.photo}" alt="${item.color} ${item.category}" />
            <div class="card-body">
              <div class="role">${role}</div>
              <div class="card-top">
                <span class="dot" style="background:${colorHex(item.color)}"></span>
                <span class="card-cat">${item.color} ${item.category}</span>
              </div>
              <span class="card-last-worn">${formatLastWorn(item.lastWorn)}</span>
            </div>
          </article>`
          )
          .join("")}
      </div>
      ${
        result.explanation
          ? `<div class="outfit-explanation"><p>${escapeHtml(result.explanation)}</p></div>`
          : ""
      }
      <button id="wore-outfit" class="btn-primary btn-block" style="margin-bottom: 8px;">✓ I wore this outfit</button>
      <button id="try-another" class="btn-secondary btn-block">↻ Try another</button>`;
    box.classList.remove("fade-in");
    void box.offsetWidth; // restart the fade animation
    box.classList.add("fade-in");
  } catch (err) {
    let msg = err.message || "Our stylist is busy, tap Try again";
    if (
      msg.includes("high demand") ||
      msg.includes("busy") ||
      msg.includes("503") ||
      msg.includes("Failed") ||
      msg.includes("unavailable") ||
      msg.includes("overloaded") ||
      msg.includes("API key") ||
      msg.includes("Internal")
    ) {
      msg = "Our stylist is busy, tap Try again";
    }
    box.innerHTML = `
      <div class="notice">
        <div class="notice-icon">🧺</div>
        <p>${escapeHtml(msg)}</p>
        <button id="try-another" class="btn-secondary">Try again</button>
      </div>`;
  } finally {
    if (suggestBtn) {
      suggestBtn.disabled = false;
      suggestBtn.textContent = origBtnText;
    }
  }
}

$("#suggest-btn").addEventListener("click", () => showSuggestion());
$("#style-result").addEventListener("click", async (e) => {
  if (e.target.closest("#try-another")) {
    showSuggestion();
    return;
  }

  const woreBtn = e.target.closest("#wore-outfit");
  if (woreBtn && currentSuggestedOutfit && currentSuggestedOutfit.length) {
    woreBtn.disabled = true;
    woreBtn.textContent = "✓ Outfit logged!";
    const nowIso = new Date().toISOString();
    const allItems = await getAllItems();
    const map = new Map(allItems.map((it) => [it.id, it]));
    let hadIdleItem = false;
    for (const piece of currentSuggestedOutfit) {
      const it = map.get(piece.item.id);
      if (it) {
        if (!it.lastWorn || (Date.now() - new Date(it.lastWorn).getTime() > THIRTY_DAYS_MS)) {
          hadIdleItem = true;
        }
        it.wearCount = (it.wearCount || 0) + 1;
        it.lastWorn = nowIso;
        await saveItem(it);
      }
    }
    toast(`Logged wear for all ${currentSuggestedOutfit.length} pieces ✨`);
    updateKarmaStreak();
    awardKarma(KARMA_CONFIG.POINTS.REWEAR_OUTFIT, "Re-wore outfit (+10)");
    unlockBadge("rewear_rookie");
    if (hadIdleItem) {
      awardKarma(KARMA_CONFIG.POINTS.WEAR_IDLE_ITEM, "Rescued idle piece (+25)");
      unlockBadge("never_worn_rescuer");
    }
  }
});

// =====================================================
// Swap screen (Rewear)
// (sample listings live in swap-data.js)
// =====================================================
const REQUESTS_KEY = "weari-swap-requests";
let swapTab = "feed";

// Swap requests are small, so they're kept in localStorage
function getRequests() {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY)) || [];
  } catch {
    return [];
  }
}
function saveRequests(list) {
  try {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(list));
  } catch {
    toast("Couldn't save — browser storage is full or blocked");
  }
}

const describe = (it) => (it && it.name ? it.name : `${it ? it.color : ""} ${it ? it.category : ""}`.trim());
const tagsHtml = (occasions) => `<div class="tags">${occasions.map((o) => `<span class="tag">${o}</span>`).join("")}</div>`;
const myItemCard = (it) => `
  <article class="card">
    <img src="${it.photo}" alt="${describe(it)}" loading="lazy" />
    <div class="card-body">
      <div class="card-top">
        <span class="dot" style="background:${colorHex(it.color)}"></span>
        <span class="card-cat">${describe(it)}</span>
      </div>
      ${tagsHtml(it.occasions)}
    </div>
  </article>`;

document.querySelector("#swap-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-swap-tab]");
  if (!btn) return;
  swapTab = btn.dataset.swapTab;
  renderSwap();
});

async function renderSwap() {
  const [listings, items] = await Promise.all([getSwapListings(), getAllItems()]);
  const requests = getRequests();
  const mine = items.filter((it) => it.swappable);

  // Tabs (with counts)
  const counts = { listings: mine.length, requests: requests.length };
  document.querySelectorAll("[data-swap-tab]").forEach((b) => {
    const tab = b.dataset.swapTab;
    b.classList.toggle("active", tab === swapTab);
    const label = { feed: "Feed", listings: "My listings", requests: "My requests" }[tab];
    b.innerHTML = counts[tab] ? `${label} <span class="seg-count">${counts[tab]}</span>` : label;
  });
  $("#swap-feed").hidden = swapTab !== "feed";
  $("#swap-listings").hidden = swapTab !== "listings";
  $("#swap-requests").hidden = swapTab !== "requests";

  // --- Feed ---
  const requested = new Set(requests.map((r) => r.listingId));
  $("#swap-feed").innerHTML = listings
    .map(
      (l) => `
      <article class="card">
        <img src="${l.photo}" alt="${l.title}" loading="lazy" />
        <span class="member-badge"><span class="avatar">${l.member[0]}</span>${l.member}</span>
        <div class="card-body">
          <div class="listing-title">${l.title}</div>
          <div class="card-top">
            <span class="dot" style="background:${colorHex(l.color)}"></span>
            <span class="card-meta">${describe(l)}</span>
          </div>
          ${tagsHtml(l.occasions)}
          ${
            requested.has(l.id)
              ? `<button class="btn-small done" disabled>✓ Requested</button>`
              : `<button class="btn-small" data-interested="${l.id}">I’m interested</button>`
          }
        </div>
      </article>`
    )
    .join("");

  // --- My listings ---
  $("#swap-listings").innerHTML = mine.length
    ? `<div class="grid">${mine.map(myItemCard).join("")}</div>`
    : `<div class="notice">
        <div class="notice-icon">🔁</div>
        <p>You haven’t listed anything yet.<br />When adding an item, switch on <strong>Available to swap</strong>.</p>
        <button class="btn-secondary" data-go="add">Add item</button>
      </div>`;

  // --- My requests ---
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const listingById = Object.fromEntries(listings.map((l) => [l.id, l]));
  $("#swap-requests").innerHTML = requests.length
    ? requests
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => {
          const theirs = listingById[r.listingId] || r.listing;
          const offered = byId[r.offeredItemId];
          return `
          <div class="request">
            <div class="request-pics">
              ${offered ? `<img src="${offered.photo}" alt="" />` : `<div class="pic-gone"></div>`}
              <span class="swap-arrow">⇄</span>
              ${theirs.photo ? `<img src="${theirs.photo}" alt="" />` : `<div class="pic-gone"></div>`}
            </div>
            <div class="request-info">
              <div class="request-text">Your <strong>${offered ? describe(offered) : "removed item"}</strong>
                for ${theirs.member}’s <strong>${theirs.title}</strong></div>
              <div class="request-meta">
                <span class="status">Pending</span>
                <span>${new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <button class="link-btn" data-cancel-request="${r.id}">Cancel</button>
              </div>
            </div>
          </div>`;
        })
        .join("")
    : `<div class="notice">
        <div class="notice-icon">💌</div>
        <p>No swap requests yet.<br />Tap <strong>I’m interested</strong> on something in the feed.</p>
        <button class="btn-secondary" data-swap-goto="feed">Browse the feed</button>
      </div>`;
}

document.querySelector("#screen-swap").addEventListener("click", (e) => {
  const goto = e.target.closest("[data-swap-goto]");
  if (goto) {
    swapTab = goto.dataset.swapGoto;
    renderSwap();
  }
  const interested = e.target.closest("[data-interested]");
  if (interested) openOfferSheet(interested.dataset.interested);

  const cancel = e.target.closest("[data-cancel-request]");
  if (cancel) {
    saveRequests(getRequests().filter((r) => r.id !== cancel.dataset.cancelRequest));
    renderSwap();
    toast("Request cancelled");
  }
});

// ---------- The "offer an item" pop-up ----------
function openSheet(html) {
  $("#sheet-content").innerHTML = html;
  $("#sheet").hidden = false;
  $("#sheet-backdrop").hidden = false;
  document.body.classList.add("no-scroll");
}
function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheet-backdrop").hidden = true;
  document.body.classList.remove("no-scroll");
}
$("#sheet-backdrop").addEventListener("click", closeSheet);

let offerFor = null; // the listing being requested
let offerChoice = null; // id of my item being offered

async function openOfferSheet(listingId) {
  const [listings, items] = await Promise.all([getSwapListings(), getAllItems()]);
  offerFor = listings.find((l) => l.id === listingId);
  offerChoice = null;
  const mine = items.filter((it) => it.swappable);

  const header = `
    <div class="sheet-header">
      <img src="${offerFor.photo}" alt="" />
      <div>
        <h3>Offer a swap</h3>
        <p>for ${offerFor.member}’s ${offerFor.title}</p>
      </div>
    </div>`;

  if (!mine.length) {
    openSheet(`${header}
      <div class="notice flat">
        <p>You don’t have any items available to swap yet.<br />Add one and switch on <strong>Available to swap</strong>.</p>
        <button class="btn-primary" data-go="add">Add item</button>
      </div>`);
    return;
  }

  openSheet(`${header}
    <p class="sheet-label">Pick one of your items to offer</p>
    <div class="offer-grid">
      ${mine
        .map(
          (it) => `
        <button class="offer-option" data-offer="${it.id}">
          <img src="${it.photo}" alt="${describe(it)}" />
          <span>${describe(it)}</span>
        </button>`
        )
        .join("")}
    </div>
    <button id="send-request" class="btn-primary btn-block" disabled>Send swap request</button>
    <button class="link-btn sheet-cancel" data-close-sheet>Cancel</button>`);
}

$("#sheet").addEventListener("click", (e) => {
  if (e.target.closest("[data-close-sheet]")) return closeSheet();

  const option = e.target.closest("[data-offer]");
  if (option) {
    offerChoice = option.dataset.offer;
    document.querySelectorAll("[data-offer]").forEach((b) => b.classList.toggle("selected", b === option));
    $("#send-request").disabled = false;
  }

  if (e.target.closest("#send-request") && offerChoice) {
    const { photo, ...listing } = offerFor; // keep a small copy of the listing
    saveRequests([
      ...getRequests(),
      {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        listingId: offerFor.id,
        listing,
        offeredItemId: offerChoice,
        status: "pending",
        createdAt: Date.now(),
      },
    ]);
    awardKarma(KARMA_CONFIG.POINTS.SEND_SWAP_REQUEST, "Sent swap request");
    unlockBadge("first_swap_request");
    openSheet(`
      <div class="success">
        <div class="success-icon">🎉</div>
        <h3>Swap request sent!</h3>
        <p>Your offer for ${offerFor.member}’s ${offerFor.title} is saved in <strong>My requests</strong>.</p>
        <button class="btn-primary btn-block" data-close-sheet>Done</button>
      </div>`);
    renderSwap();
  }
});

// =====================================================
// Insights screen
// =====================================================
async function renderInsights() {
  const items = await getAllItems();

  // 1. Swap nudge (simple rules, not AI)
  const neverWorn = items.filter((it) => !isWornInLast30Days(it));
  const nudgeEl = $("#insights-nudge");
  if (items.length === 0) {
    nudgeEl.innerHTML = `<p>Your wardrobe is empty. Add pieces to begin tracking wears and swaps.</p>`;
  } else if (neverWorn.length === 0) {
    nudgeEl.innerHTML = `<p>Every piece in your wardrobe was worn in the last 30 days! Outstanding rotation.</p>`;
  } else if (neverWorn.length === 1) {
    nudgeEl.innerHTML = `<p>You have 1 piece you haven’t worn in 30 days. Could someone else love it?</p>`;
  } else {
    nudgeEl.innerHTML = `<p>You have ${neverWorn.length} pieces you haven’t worn in 30 days. Could someone else love them?</p>`;
  }

  // 2. Circular impact
  const keptInUse = items.filter((it) => (it.wearCount || 0) > 0).length;
  const listedToSwap = items.filter((it) => it.swappable).length;
  const impact = IMPACT_CONFIG.calculate(keptInUse, listedToSwap);

  $("#impact-counts").textContent = `${keptInUse} item${keptInUse === 1 ? "" : "s"} kept in use · ${listedToSwap} item${listedToSwap === 1 ? "" : "s"} listed to swap`;
  $("#impact-headline").textContent = impact.headline;
  $("#impact-detail").textContent = impact.caption;

  // 3. Wardrobe usage (worn in last 30 days)
  const worn30Days = items.filter(isWornInLast30Days);
  const percent = items.length ? Math.round((worn30Days.length / items.length) * 100) : 0;

  $("#usage-percent").textContent = `${percent}%`;
  $("#usage-fraction").textContent = `${worn30Days.length} of ${items.length} pieces`;
  $("#usage-bar-fill").style.width = `${percent}%`;

  const circ = 2 * Math.PI * 42; // ~263.89
  const ringProgress = $("#usage-ring-progress");
  ringProgress.style.strokeDasharray = `${circ}`;
  ringProgress.style.strokeDashoffset = `${circ - (circ * percent) / 100}`;

  if (items.length === 0) {
    $("#usage-desc").textContent = "Add clothes to your wardrobe to see your rotation analytics.";
  } else if (percent >= 70) {
    $("#usage-desc").textContent = "High rotation! You regularly wear most of your collection.";
  } else if (percent >= 35) {
    $("#usage-desc").textContent = "Steady rotation. Try styling idle pieces for upcoming occasions.";
  } else {
    $("#usage-desc").textContent = "Great opportunity to rotate more pieces or list idle favorites on Rewear.";
  }

  // 4. Most worn items (top 3)
  const mostWorn = items
    .filter((it) => (it.wearCount || 0) > 0)
    .sort((a, b) => (b.wearCount || 0) - (a.wearCount || 0))
    .slice(0, 3);

  const mostWornList = $("#most-worn-list");
  if (!mostWorn.length) {
    mostWornList.innerHTML = `<p class="empty-hint">No wears logged yet. Tap "Mark as worn" on any item or log an outfit in Style me.</p>`;
  } else {
    mostWornList.innerHTML = mostWorn
      .map(
        (it) => `
      <article class="card">
        <img src="${it.photo}" alt="${describe(it)}" loading="lazy" />
        <div class="card-body">
          <div class="card-top">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="card-cat">${describe(it)}</span>
          </div>
          ${tagsHtml(it.occasions)}
          <div class="card-wear-row">
            <span class="wear-stat-pill"><strong>${it.wearCount}</strong> wear${it.wearCount === 1 ? "" : "s"}</span>
            <span class="card-last-worn">${formatLastWorn(it.lastWorn)}</span>
          </div>
        </div>
      </article>`
      )
      .join("");
  }

  // 5. Never worn / Inactive items (not worn in 30 days or ever)
  const neverWornList = $("#never-worn-list");
  if (!neverWorn.length) {
    neverWornList.innerHTML = `<p class="empty-hint">None! Every single item in your wardrobe has been worn within the last 30 days.</p>`;
  } else {
    neverWornList.innerHTML = neverWorn
      .map(
        (it) => `
      <article class="card">
        <img src="${it.photo}" alt="${describe(it)}" loading="lazy" />
        ${it.swappable ? `<span class="swap-badge">Swap</span>` : ""}
        <div class="card-body">
          <div class="card-top">
            <span class="dot" style="background:${colorHex(it.color)}"></span>
            <span class="card-cat">${describe(it)}</span>
          </div>
          ${tagsHtml(it.occasions)}
          <span class="card-last-worn">${formatLastWorn(it.lastWorn)}</span>
          <div class="insights-card-actions">
            <button type="button" class="btn-small ${it.swappable ? "done" : ""}" data-list-swap="${it.id}">
              ${it.swappable ? "✓ Listed on Rewear" : "List on Rewear"}
            </button>
            <button type="button" class="btn-small btn-secondary" data-style-item="${it.id}">
              Style it
            </button>
          </div>
        </div>
      </article>`
      )
      .join("");
  }
}

$("#screen-insights").addEventListener("click", async (e) => {
  const swapBtn = e.target.closest("[data-list-swap]");
  if (swapBtn) {
    const id = swapBtn.dataset.listSwap;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      const wasSwappable = it.swappable;
      it.swappable = true;
      await saveItem(it);
      renderInsights();
      toast("Listed on Rewear ✨");
      if (!wasSwappable) {
        awardKarma(KARMA_CONFIG.POINTS.MARK_SWAPPABLE, "Listed on Rewear");
      }
    }
    return;
  }

  const styleBtn = e.target.closest("[data-style-item]");
  if (styleBtn) {
    const id = styleBtn.dataset.styleItem;
    const items = await getAllItems();
    const it = items.find((x) => x.id === id);
    if (it) {
      styleOccasion = (it.occasions && it.occasions[0]) || "casual";
      showScreen("style");
      renderStyleOccasions();
      showSuggestion(it.id);
      toast(`Styling an outfit with your ${it.color} ${it.category}`);
    }
  }
});

// =====================================================
// Karma screen
// =====================================================
async function renderKarma() {
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

// =====================================================
// Onboarding Flow, Profile Completion, and Settings
// =====================================================
const ONBOARDING_COMPLETED_KEY = "weari_onboarding_completed";
const ONBOARDING_ANSWERS_KEY = "weari_onboarding_answers";
const PROFILE_KEY = "weari_user_profile";
const PROFILE_DISMISSED_KEY = "weari_profile_dismissed";

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
    const raw = localStorage.getItem(ONBOARDING_ANSWERS_KEY);
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
    localStorage.setItem(ONBOARDING_ANSWERS_KEY, JSON.stringify(obAnswers));
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

function openOnboarding(step = 0) {
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
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
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

// Demo Wardrobe Loader
const DEMO_WARDROBE_ITEMS = [
  {
    name: "Linen button-down shirt",
    category: "top",
    color: "white",
    occasions: ["casual", "work", "travel"],
    swappable: true,
  },
  {
    name: "High-waist tailored trousers",
    category: "bottom",
    color: "beige",
    occasions: ["work", "casual", "date night"],
    swappable: false,
  },
  {
    name: "Wool camel coat",
    category: "outerwear",
    color: "brown",
    occasions: ["work", "formal", "travel"],
    swappable: true,
  },
  {
    name: "Classic leather loafers",
    category: "shoes",
    color: "black",
    occasions: ["work", "casual", "formal"],
    swappable: false,
  },
  {
    name: "Silk slip dress",
    category: "dress",
    color: "green",
    occasions: ["party", "wedding", "date night"],
    swappable: true,
  },
  {
    name: "Woven straw tote",
    category: "accessory",
    color: "brown",
    occasions: ["casual", "travel"],
    swappable: false,
  },
];

async function loadDemoWardrobe() {
  for (const it of DEMO_WARDROBE_ITEMS) {
    const id = "demo_" + Math.random().toString(36).slice(2, 9);
    const photo = typeof placeholderImage === "function"
      ? placeholderImage(it.category, it.color)
      : "";
    await saveItem({
      id,
      name: it.name,
      category: it.category,
      color: it.color,
      occasions: it.occasions,
      swappable: it.swappable,
      photo,
      createdAt: Date.now(),
    });
  }
  await renderWardrobe();
  await updateStarterChecklist();
  toast("Demo wardrobe loaded ✨");
}

$("#ob-btn-load-demo")?.addEventListener("click", async () => {
  await loadDemoWardrobe();
});

$("#ob-btn-first-look")?.addEventListener("click", () => {
  completeOnboarding();
  showScreen("style");
});

// =====================================================
// Profile Completion Card
// =====================================================
function renderProfileCard() {
  const card = $("#profile-card");
  if (!card) return;

  const storedProfile = localStorage.getItem(PROFILE_KEY);
  const isDismissed = localStorage.getItem(PROFILE_DISMISSED_KEY);

  if (storedProfile) {
    card.hidden = false;
    $("#profile-card-body").hidden = true;
    $("#profile-card-completed").hidden = false;
    return;
  }

  if (isDismissed) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  $("#profile-card-body").hidden = false;
  $("#profile-card-completed").hidden = true;
}

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
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  awardKarma(25, "Completed style profile");

  $("#profile-card-body").hidden = true;
  $("#profile-card-completed").hidden = false;
  toast("Profile saved (+25 Karma) ✨");
});

$("#btn-edit-profile")?.addEventListener("click", () => {
  $("#profile-card-body").hidden = false;
  $("#profile-card-completed").hidden = true;
});

$("#btn-skip-profile")?.addEventListener("click", () => {
  localStorage.setItem(PROFILE_DISMISSED_KEY, "true");
  const card = $("#profile-card");
  if (card) card.hidden = true;
});

$("#btn-profile-dismiss")?.addEventListener("click", () => {
  localStorage.setItem(PROFILE_DISMISSED_KEY, "true");
  const card = $("#profile-card");
  if (card) card.hidden = true;
});

// =====================================================
// Settings Modal
// =====================================================
function openSettings() {
  const answers = JSON.parse(localStorage.getItem(ONBOARDING_ANSWERS_KEY) || "{}");
  const summaryEl = $("#settings-profile-summary");
  if (summaryEl) {
    const hasAny = answers.goal || (answers.styles && answers.styles.length) || (answers.occasions && answers.occasions.length) || answers.shopping;
    if (hasAny) {
      summaryEl.innerHTML = `
        <div class="settings-profile-row">
          <span class="settings-profile-label">Goal</span>
          <span class="settings-profile-value">${answers.goal || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Style</span>
          <span class="settings-profile-value">${(answers.styles && answers.styles.join(", ")) || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Dressing for</span>
          <span class="settings-profile-value">${(answers.occasions && answers.occasions.join(", ")) || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Shopping habit</span>
          <span class="settings-profile-value">${answers.shopping || "Not set"}</span>
        </div>
      `;
    } else {
      summaryEl.innerHTML = `<p class="settings-empty-profile">No style answers saved yet.</p>`;
    }
  }

  $("#settings-modal").hidden = false;
  $("#settings-backdrop").hidden = false;
}

function closeSettings() {
  $("#settings-modal").hidden = true;
  $("#settings-backdrop").hidden = true;
}

$("#btn-settings")?.addEventListener("click", openSettings);
$("#settings-close")?.addEventListener("click", closeSettings);
$("#settings-backdrop")?.addEventListener("click", closeSettings);

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

// ---------- Start ----------
buildAddForm();
updateKarmaStreak();
updateKarmaChip();
renderKarma();
showScreen("wardrobe");

// Show onboarding on first time open
if (!localStorage.getItem(ONBOARDING_COMPLETED_KEY)) {
  openOnboarding(0);
}

