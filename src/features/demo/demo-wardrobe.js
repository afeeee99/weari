import { toast } from "../../core/dom.js";
import { placeholderImage } from "../../core/placeholders.js";
import { saveItem } from "../../data/items-db.js";
import { renderInsights } from "../insights/insights.js";
import { renderProfileScreen } from "../profile/profile-screen.js";
import { closeSettings } from "../settings/settings.js";
import { renderFavorites } from "../style/favorites.js";
import { getSavedOutfits, renderSavedOutfits, saveSavedOutfits } from "../style/saved-outfits.js";
import { renderWeeklyPlan } from "../style/weekly-plan.js";
import { renderWardrobe } from "../wardrobe/wardrobe.js";

// =====================================================
// PART 1: Demo Wardrobe & Reset App
// =====================================================
function getDemoWardrobeItems() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return [
    {
      id: "demo_top_1",
      name: "Classic linen button-down",
      category: "top",
      color: "white",
      occasions: ["casual", "work"],
      photo: placeholderImage("top", "white"),
      swappable: false,
      wearCount: 8,
      lastWorn: new Date(now).toISOString(),
      createdAt: now - 30 * dayMs,
    },
    {
      id: "demo_top_2",
      name: "Ribbed stretch tank",
      category: "top",
      color: "black",
      occasions: ["casual", "party"],
      photo: placeholderImage("top", "black"),
      swappable: false,
      wearCount: 14,
      lastWorn: new Date(now - 1 * dayMs).toISOString(),
      createdAt: now - 35 * dayMs,
    },
    {
      id: "demo_top_3",
      name: "Breton striped crewneck",
      category: "top",
      color: "navy",
      occasions: ["casual", "travel"],
      photo: placeholderImage("top", "navy"),
      swappable: false,
      wearCount: 6,
      lastWorn: new Date(now - 5 * dayMs).toISOString(),
      createdAt: now - 28 * dayMs,
    },
    {
      id: "demo_top_4",
      name: "Relaxed cotton boyfriend tee",
      category: "top",
      color: "grey",
      occasions: ["casual"],
      photo: placeholderImage("top", "grey"),
      swappable: false,
      wearCount: 11,
      lastWorn: new Date(now - 3 * dayMs).toISOString(),
      createdAt: now - 32 * dayMs,
    },
    {
      id: "demo_bottom_1",
      name: "High-waist wide trousers",
      category: "bottom",
      color: "beige",
      occasions: ["work", "formal"],
      photo: placeholderImage("bottom", "beige"),
      swappable: false,
      wearCount: 9,
      lastWorn: new Date(now - 2 * dayMs).toISOString(),
      createdAt: now - 40 * dayMs,
    },
    {
      id: "demo_bottom_2",
      name: "Straight-leg vintage jeans",
      category: "bottom",
      color: "blue",
      occasions: ["casual", "travel"],
      photo: placeholderImage("bottom", "blue"),
      swappable: false,
      wearCount: 15,
      lastWorn: new Date(now - 4 * dayMs).toISOString(),
      createdAt: now - 45 * dayMs,
    },
    {
      id: "demo_bottom_3",
      name: "Pleated satin midi skirt",
      category: "bottom",
      color: "brown",
      occasions: ["work", "date night"],
      photo: placeholderImage("bottom", "brown"),
      swappable: true,
      wearCount: 2,
      lastWorn: new Date(now - 35 * dayMs).toISOString(),
      createdAt: now - 50 * dayMs,
    },
    {
      id: "demo_dress_1",
      name: "Emerald silk slip dress",
      category: "dress",
      color: "green",
      occasions: ["party", "wedding", "date night"],
      photo: placeholderImage("dress", "green"),
      swappable: true,
      wearCount: 1,
      lastWorn: new Date(now - 45 * dayMs).toISOString(),
      createdAt: now - 55 * dayMs,
    },
    {
      id: "demo_dress_2",
      name: "Tiered linen sundress",
      category: "dress",
      color: "yellow",
      occasions: ["casual", "travel"],
      photo: placeholderImage("dress", "yellow"),
      swappable: false,
      wearCount: 4,
      lastWorn: new Date(now - 18 * dayMs).toISOString(),
      createdAt: now - 25 * dayMs,
    },
    {
      id: "demo_shoes_1",
      name: "Low-profile court sneakers",
      category: "shoes",
      color: "white",
      occasions: ["casual", "travel"],
      photo: placeholderImage("shoes", "white"),
      swappable: false,
      wearCount: 22,
      lastWorn: new Date(now - 1 * dayMs).toISOString(),
      createdAt: now - 60 * dayMs,
    },
    {
      id: "demo_shoes_2",
      name: "Strappy block heel sandals",
      category: "shoes",
      color: "black",
      occasions: ["party", "wedding", "formal"],
      photo: placeholderImage("shoes", "black", "heel"),
      swappable: true,
      wearCount: 0,
      lastWorn: null,
      createdAt: now - 65 * dayMs,
    },
    {
      id: "demo_outer_1",
      name: "Boxy wash trucker jacket",
      category: "outerwear",
      color: "blue",
      occasions: ["casual", "travel"],
      photo: placeholderImage("outerwear", "blue"),
      swappable: false,
      wearCount: 5,
      lastWorn: new Date(now - 12 * dayMs).toISOString(),
      createdAt: now - 35 * dayMs,
    },
    {
      id: "demo_outer_2",
      name: "Wool camel tailored trench",
      category: "outerwear",
      color: "brown",
      occasions: ["work", "formal"],
      photo: placeholderImage("outerwear", "brown"),
      swappable: true,
      wearCount: 3,
      lastWorn: new Date(now - 40 * dayMs).toISOString(),
      createdAt: now - 70 * dayMs,
    },
    {
      id: "demo_acc_1",
      name: "Woven raffia market tote",
      category: "accessory",
      color: "beige",
      occasions: ["casual", "travel", "beach"],
      photo: placeholderImage("accessory", "beige", "bag"),
      swappable: false,
      wearCount: 7,
      lastWorn: new Date(now - 8 * dayMs).toISOString(),
      createdAt: now - 20 * dayMs,
    },
    {
      id: "demo_acc_2",
      name: "Slim leather belt",
      category: "accessory",
      color: "brown",
      occasions: ["work", "casual", "date night"],
      photo: placeholderImage("accessory", "brown", "belt"),
      swappable: false,
      wearCount: 10,
      lastWorn: new Date(now - 6 * dayMs).toISOString(),
      createdAt: now - 22 * dayMs,
    },
  ];
}

export async function loadDemoWardrobe() {
  const demoItems = getDemoWardrobeItems();
  for (const item of demoItems) {
    await saveItem(item);
  }
  const saved = getSavedOutfits();
  if (!saved.length) {
    const demoOutfits = [
      {
        id: "demo_outfit_work",
        name: "Monday Office Chic",
        occasion: "work",
        createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
        items: [demoItems[0], demoItems[4], demoItems[9]],
      },
      {
        id: "demo_outfit_weekend",
        name: "Casual Saturday Stroll",
        occasion: "casual",
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        items: [demoItems[3], demoItems[5], demoItems[9], demoItems[11]],
      },
    ];
    saveSavedOutfits(demoOutfits);
  }
  closeSettings();
  renderWardrobe();
  renderProfileScreen();
  renderInsights();
  renderSavedOutfits();
  renderFavorites();
  renderWeeklyPlan();
  toast(`Loaded ${demoItems.length} demo wardrobe pieces ✨`);
}
