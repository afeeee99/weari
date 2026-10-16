// =====================================================
// Weari stylist — powered by Gemini API
// =====================================================

function getOnboardingPreferences() {
  try {
    const raw = localStorage.getItem("weari_onboarding_answers");
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      goal: data.goal || null,
      styles: Array.isArray(data.styles) ? data.styles : [],
      occasions: Array.isArray(data.occasions) ? data.occasions : [],
    };
  } catch {
    return null;
  }
}

async function suggestOutfit(items, occasion, previousIds = [], mustIncludeItemId = null) {
  if (!items || items.length === 0) {
    return { missing: "Your wardrobe is empty. Add pieces first to get an outfit suggestion." };
  }

  // Filter items matching the requested occasion, or all items as graceful fallback
  const occasionItems = items.filter((it) => Array.isArray(it.occasions) && it.occasions.includes(occasion));
  const pool = occasionItems.length >= 2 ? occasionItems : items;

  let mustItem = null;
  if (mustIncludeItemId) {
    mustItem = items.find((x) => x.id === mustIncludeItemId) || null;
  }

  const dresses = pool.filter((it) => it.category === "dress");
  const tops = pool.filter((it) => it.category === "top");
  const bottoms = pool.filter((it) => it.category === "bottom");
  const shoes = pool.filter((it) => it.category === "shoes");
  const outerwears = pool.filter((it) => it.category === "outerwear");
  const accessories = pool.filter((it) => it.category === "accessory");

  // Fallback category lookup in all items if pool is missing a core role
  const allShoes = items.filter((it) => it.category === "shoes");
  const allTops = items.filter((it) => it.category === "top");
  const allBottoms = items.filter((it) => it.category === "bottom");
  const allDresses = items.filter((it) => it.category === "dress");

  const outfit = [];

  // If mustItem is specified, place it first
  if (mustItem) {
    const roleName = mustItem.category === "top" ? "Top"
      : mustItem.category === "bottom" ? "Bottom"
      : mustItem.category === "dress" ? "Main piece"
      : mustItem.category === "shoes" ? "Footwear"
      : mustItem.category.charAt(0).toUpperCase() + mustItem.category.slice(1);
    outfit.push({ role: roleName, item: mustItem });
  }

  const isRoleFilled = (cat) => outfit.some((p) => p.item.category === cat);

  // Strategy A: Dress + shoes
  if ((dresses.length > 0 || (mustItem && mustItem.category === "dress")) && (!mustItem || mustItem.category === "dress")) {
    if (!isRoleFilled("dress")) {
      const dress = dresses.find((d) => !previousIds.includes(d.id)) || dresses[0];
      outfit.push({ role: "Main piece", item: dress });
    }
  } else {
    // Strategy B: Top + Bottom
    if (!isRoleFilled("top")) {
      const top = (tops.find((t) => !previousIds.includes(t.id)) || tops[0] || allTops[0]);
      if (top) outfit.push({ role: "Top", item: top });
    }
    if (!isRoleFilled("bottom")) {
      const btm = (bottoms.find((b) => !previousIds.includes(b.id)) || bottoms[0] || allBottoms[0]);
      if (btm) outfit.push({ role: "Bottom", item: btm });
    }
  }

  // Add shoes
  if (!isRoleFilled("shoes")) {
    const shoe = (shoes.find((s) => !previousIds.includes(s.id)) || shoes[0] || allShoes[0]);
    if (shoe) outfit.push({ role: "Footwear", item: shoe });
  }

  // Optionally add outerwear or accessory if available and fits
  if (occasion === "formal" || occasion === "work" || occasion === "travel") {
    if (!isRoleFilled("outerwear")) {
      const outer = outerwears.find((o) => !previousIds.includes(o.id)) || outerwears[0];
      if (outer) outfit.push({ role: "Outerwear", item: outer });
    }
  }
  if (!isRoleFilled("accessory") && accessories.length) {
    const acc = accessories.find((a) => !previousIds.includes(a.id)) || accessories[0];
    if (acc) outfit.push({ role: "Accessory", item: acc });
  }

  if (outfit.length < 2) {
    return {
      missing: `Add more pieces (like tops, bottoms, or shoes) tagged '${occasion}' to build complete looks.`,
    };
  }

  return {
    outfit,
    explanation: `A balanced, stylish combination tailored for ${occasion}, prioritizing your rotation and conscious rewears.`,
    repeated: false,
  };
}
