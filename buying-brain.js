// =====================================================
// Buying Brain — "Should I buy this?" rules
//
// Looks at what you already own in the same category/color and how often
// you actually wear it, then gives a verdict:
//   "skip"        – you already own something similar; wear that instead
//   "swap_first"  – you have plenty in this category; try the Swap feed first
//   "buy"         – a real gap you'd actually wear
//
// Gemini gets this verdict as a starting point and makes the final call as
// your stylist. Mock mode (and any unclear Gemini answer) uses it directly.
// =====================================================

const IDLE_DAYS = 30;
const RARELY_WORN = 3; // fewer wears than this = rarely worn

const plural = (category) => ({ shoes: 'shoes', accessory: 'accessories', dress: 'dresses', outerwear: 'outerwear pieces' })[category] || `${category}s`;

export function buyingBrain(candidate, wardrobe) {
  const sameCategory = wardrobe.filter((it) => it.category === candidate.category);
  const similar = sameCategory.filter((it) => it.color === candidate.color);
  const isIdle = (it) => it.wears < RARELY_WORN || it.daysSinceWorn === null || it.daysSinceWorn > IDLE_DAYS;
  const avgWears = sameCategory.length ? sameCategory.reduce((sum, it) => sum + it.wears, 0) / sameCategory.length : 0;

  let verdict;
  let reason;
  if (similar.length) {
    const idle = similar.filter(isIdle);
    verdict = 'skip';
    reason = idle.length
      ? `You own ${similar.length} similar ${candidate.color} ${similar.length > 1 ? plural(candidate.category) : candidate.category}, and ${idle.length} of them rarely get worn.`
      : `You already own a ${candidate.color} ${candidate.category} you wear often.`;
  } else if (sameCategory.length >= 3) {
    verdict = 'swap_first';
    reason = `You have ${sameCategory.length} ${plural(candidate.category)} already (worn ${avgWears.toFixed(1)} times on average), so try a swap before buying.`;
  } else if (sameCategory.length === 0 || avgWears >= RARELY_WORN) {
    verdict = 'buy';
    reason = sameCategory.length
      ? `You wear your ${plural(candidate.category)} a lot (${avgWears.toFixed(1)} times on average) and only own ${sameCategory.length}.`
      : `You don't own any ${candidate.category} yet, so this fills a real gap.`;
  } else {
    verdict = 'swap_first';
    reason = `Your ${plural(candidate.category)} are rarely worn (${avgWears.toFixed(1)} times on average), so try a swap first.`;
  }

  return {
    verdict,
    reason,
    similarIds: similar.map((it) => it.id),
    sameCategoryCount: sameCategory.length,
    avgWears: Number(avgWears.toFixed(1)),
  };
}
