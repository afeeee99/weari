import { confirmDialog } from "../../core/dialog.js";
import { kv, withoutSync } from "../../core/kv.js";
import { BACKUP_ITEMS_KEY, LEGACY_ITEM_STORAGE_KEYS, LEGACY_KARMA_KEYS, LEGACY_OUTFIT_KEYS, LEGACY_REQUEST_KEYS, LEGACY_WEAR_COUNT_KEYS, clearAllItems } from "../../data/items-db.js";
import { getSignedInUser, wipeCloudData } from "../account/account.js";
import { loadDemoWardrobe } from "../demo/demo-wardrobe.js";
import { COMPLETED_SWAPS_KEY, PURCHASES_AVOIDED_KEY } from "../insights/impact.js";
import { KARMA_STORAGE_KEY } from "../karma/karma.js";
import { ONBOARDING_ANSWERS_KEY, ONBOARDING_COMPLETED_KEY, PROFILE_DISMISSED_KEY, PROFILE_KEY } from "../onboarding/onboarding.js";
import { PROFILE_EMAIL_KEY, PROFILE_FIRST_NAME_KEY, WEARI_PLUS_WAITLIST_KEY } from "../profile/profile-screen.js";
import { FAVORITES_STORAGE_KEY } from "../style/favorites.js";
import { SAVED_OUTFITS_KEY } from "../style/saved-outfits.js";
import { PLAN_REPEAT_KEY, WEEKLY_PLAN_KEY } from "../style/weekly-plan.js";
import { REQUESTS_KEY } from "../swap/swap.js";
import { FRIEND_SHARES_KEY } from "../friends/friends.js";
import { EARNINGS_KEY, LISTINGS_KEY } from "../rewear/rewear.js";
import { CUSTOM_LABELS_KEY } from "../style/labels.js";

// Every storage key Weari has ever used (current + legacy). Keys are not renamed;
// we just make sure Reset clears all of them.
function getAllWeariStorageKeys() {
  const known = [
    BACKUP_ITEMS_KEY, KARMA_STORAGE_KEY, COMPLETED_SWAPS_KEY, PURCHASES_AVOIDED_KEY,
    SAVED_OUTFITS_KEY, REQUESTS_KEY, ONBOARDING_COMPLETED_KEY, ONBOARDING_ANSWERS_KEY,
    PROFILE_KEY, PROFILE_DISMISSED_KEY, PROFILE_FIRST_NAME_KEY, PROFILE_EMAIL_KEY,
    WEARI_PLUS_WAITLIST_KEY, FAVORITES_STORAGE_KEY, WEEKLY_PLAN_KEY, PLAN_REPEAT_KEY,
    CUSTOM_LABELS_KEY, LISTINGS_KEY, EARNINGS_KEY, FRIEND_SHARES_KEY,
    "weari-favorite-outfits",
    ...LEGACY_ITEM_STORAGE_KEYS, ...LEGACY_WEAR_COUNT_KEYS, ...LEGACY_OUTFIT_KEYS,
    ...LEGACY_KARMA_KEYS, ...LEGACY_REQUEST_KEYS,
  ];
  const keys = new Set();
  // Include both the dash and underscore spelling of every key
  known.forEach((k) => {
    keys.add(k);
    keys.add(k.replace(/_/g, "-"));
    keys.add(k.replace(/-/g, "_"));
  });
  // Catch anything else saved under a "weari" name
  for (let i = 0; i < kv.length; i++) {
    const k = kv.key(i);
    if (k && /^weari/i.test(k)) keys.add(k);
  }
  return [...keys];
}

// Remove everything Weari keeps on this device (wardrobe, photos, outfits, karma, settings).
// Used by Reset app and by Sign out. The cloud copy is not touched here.
export async function clearDeviceData() {
  await clearAllItems();
  withoutSync(() => getAllWeariStorageKeys().forEach((k) => kv.removeItem(k)));
}

async function resetApp() {
  const user = getSignedInUser();
  const ok = await confirmDialog({
    title: "Reset all data?",
    message: user
      ? "This permanently deletes your wardrobe, photos, outfits, plans, swaps, karma and profile, on this device and in your Weari account."
      : "This permanently clears your wardrobe, photos, outfits, plans, swaps, karma and profile on this device.",
    confirmLabel: "Reset everything",
    danger: true,
  });
  if (!ok) return;
  if (user) {
    try {
      await wipeCloudData();
    } catch (err) {
      console.warn("Cloud reset failed:", err);
    }
  }
  await clearDeviceData();
  // Reload so nothing still held in memory gets saved back
  location.reload();
}

// Event bindings for demo and reset buttons
document.addEventListener("click", (e) => {
  if (e.target.closest("#btn-load-demo-wardrobe") || e.target.closest("#btn-settings-load-demo") || e.target.closest("#btn-profile-load-demo")) {
    loadDemoWardrobe();
  }
  if (e.target.closest("#btn-settings-reset-app") || e.target.closest("#btn-profile-reset-app")) {
    resetApp();
  }
});
