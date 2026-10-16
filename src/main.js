// =====================================================
// Weari — app entry point
// Loads every screen (each file wires up its own buttons when it loads),
// then starts the app. Data is saved on this device; when Firebase is
// configured and the user signs in, it also syncs to their account.
// =====================================================
import "./styles/index.css";

import { initialScreen, showScreen } from "./core/router.js";
import { migrateAllData } from "./data/migrate.js";
import { buildAddForm } from "./features/add-item/add-item.js";
import { renderKarma } from "./features/karma/karma-screen.js";
import { updateKarmaChip, updateKarmaStreak } from "./features/karma/karma.js";
import { ONBOARDING_COMPLETED_KEY, openOnboarding } from "./features/onboarding/onboarding.js";
import { startAccount } from "./features/account/account.js";
import { kv } from "./core/kv.js";

// Screens and panels (importing them is enough: they register their own event listeners)
import "./features/wardrobe/wardrobe.js";
import "./features/wardrobe/item-detail.js";
import "./features/camera/camera.js";
import "./features/buying-brain/buying-brain.js";
import "./features/style/style-screen.js";
import "./features/style/chat.js";
import "./features/style/ai-stylist.js";
import "./features/style/manual-builder.js";
import "./features/style/saved-outfits.js";
import "./features/style/favorites.js";
import "./features/style/weekly-plan.js";
import "./features/swap/swap.js";
import "./features/rewear/rewear.js";
import "./features/friends/friends.js";
import "./features/style/labels.js";
import "./features/insights/insights.js";
import "./features/profile/profile-card.js";
import "./features/profile/profile-screen.js";
import "./features/settings/settings.js";
import "./features/settings/reset.js";

// ---------- Start ----------
(async () => {
  buildAddForm();
  await migrateAllData();
  updateKarmaStreak();
  updateKarmaChip();
  renderKarma();
  showScreen(initialScreen(), { push: false });

  // Show onboarding on first time open
  if (!kv.getItem(ONBOARDING_COMPLETED_KEY)) {
    openOnboarding(0);
  }

  // Firebase (sign-in + cloud sync) loads after the app is on screen, and only if configured
  startAccount();
})();
