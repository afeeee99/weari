import { getRequests } from "../swap/swap.js";
import { kv } from "../../core/kv.js";

// =====================================================
// Circular Impact Calculation Configuration
// Figures for environmental savings per completed swap and avoided purchase.
// NOTE: Official environmental methodology source needs adding.
// =====================================================
export const IMPACT_CONFIG = {
  // Estimated environmental savings per completed garment swap
  // (Source needs adding: Lifecycle assessment data for garment lifetime extension vs new garment manufacturing)
  SWAP: {
    CO2_KG: 6.5,        // kg CO2e avoided per completed swap
    WATER_LITERS: 1800,  // liters of clean water preserved per completed swap
  },
  // Estimated environmental savings per purchase avoided by rewearing existing wardrobe pieces
  // (Source needs adding: Average footprint of manufacturing and transporting a new fashion item)
  PURCHASE_AVOIDED: {
    CO2_KG: 8.2,        // kg CO2e avoided per purchase avoided
    WATER_LITERS: 2400,  // liters of clean water preserved per purchase avoided
  },
  // Calculates estimated impact figures based strictly on completed swaps and purchases avoided (not items simply worn)
  calculate(completedSwaps, purchasesAvoided) {
    const swaps = Number(completedSwaps) || 0;
    const avoided = Number(purchasesAvoided) || 0;
    const totalCount = swaps + avoided;
    const co2 = (swaps * this.SWAP.CO2_KG + avoided * this.PURCHASE_AVOIDED.CO2_KG).toFixed(1);
    const water = Math.round(swaps * this.SWAP.WATER_LITERS + avoided * this.PURCHASE_AVOIDED.WATER_LITERS).toLocaleString();
    return {
      completedSwaps: swaps,
      purchasesAvoided: avoided,
      totalCount,
      headline: `Estimated ~${co2} kg CO₂e saved`,
      caption: `Estimated impact: ~${co2} kg CO₂e and ~${water}L water preserved across ${swaps} completed swap${swaps === 1 ? "" : "s"} and ${avoided} purchase${avoided === 1 ? "" : "s"} avoided.`,
      estimateNote: "How we estimate this: Calculations reflect estimated lifecycle carbon and water savings from completed garment swaps and new retail purchases avoided by rewearing.",
    };
  },
};

export const COMPLETED_SWAPS_KEY = "weari-completed-swaps";
export const PURCHASES_AVOIDED_KEY = "weari-purchases-avoided";

export function getCompletedSwapsCount() {
  let count = 0;
  try {
    const requests = getRequests();
    const completedReqs = requests.filter((r) => r && (r.status === "completed" || r.status === "accepted" || r.completed));
    count = Math.max(count, completedReqs.length);
  } catch {}
  try {
    const raw = kv.getItem(COMPLETED_SWAPS_KEY);
    if (raw) {
      const num = Number(raw);
      if (!isNaN(num)) count = Math.max(count, num);
    }
    for (const k of ["weari_completed_swaps", "completed_swaps", "completedSwaps"]) {
      const leg = kv.getItem(k);
      if (leg) {
        const num = Number(leg);
        if (!isNaN(num)) count = Math.max(count, num);
      }
    }
  } catch {}
  return count;
}

export function recordCompletedSwap(qty = 1) {
  try {
    const current = getCompletedSwapsCount();
    const updated = current + qty;
    kv.setItem(COMPLETED_SWAPS_KEY, String(updated));
    return updated;
  } catch {
    return 0;
  }
}

export function getPurchasesAvoidedCount() {
  let count = 0;
  try {
    const raw = kv.getItem(PURCHASES_AVOIDED_KEY);
    if (raw) {
      const num = Number(raw);
      if (!isNaN(num)) count = Math.max(count, num);
    }
    for (const k of ["weari_purchases_avoided", "purchases_avoided", "purchasesAvoided"]) {
      const leg = kv.getItem(k);
      if (leg) {
        const num = Number(leg);
        if (!isNaN(num)) count = Math.max(count, num);
      }
    }
  } catch {}
  return count;
}

export function recordPurchaseAvoided(qty = 1) {
  try {
    const current = getPurchasesAvoidedCount();
    const updated = current + qty;
    kv.setItem(PURCHASES_AVOIDED_KEY, String(updated));
    return updated;
  } catch {
    return 0;
  }
}
