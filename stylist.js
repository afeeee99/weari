// =====================================================
// Weari stylist — picks an outfit from your wardrobe.
//
// THIS IS THE FILE TO SWAP FOR A REAL AI MODEL LATER.
// The rest of the app only calls suggestOutfit() and
// expects the same shape back, so as long as a new version
// keeps that contract, nothing else needs to change.
//
//   suggestOutfit(items, occasion, previousIds)
//     items        – every item in the wardrobe
//     occasion     – e.g. "work"
//     previousIds  – ids of the last outfit shown (to avoid repeats)
//
//   returns (a Promise of) one of:
//     { outfit: [{ role: "Top", item }, ...] }
//     { missing: "Add a bottom tagged 'work' to get a suggestion." }
// =====================================================

async function suggestOutfit(items, occasion, previousIds = []) {
  const matching = items.filter((it) => it.occasions.includes(occasion));
  const of = (cat) => matching.filter((it) => it.category === cat);

  const tops = of("top");
  const bottoms = of("bottom");
  const dresses = of("dress");
  const shoes = of("shoes");
  const outerwear = of("outerwear");
  const accessories = of("accessory");

  // ---- Is there enough to make an outfit? ----
  const tag = `tagged ‘${occasion}’`;
  if (!dresses.length && !(tops.length && bottoms.length)) {
    if (tops.length) return { missing: `Add a bottom ${tag} (or a dress) to get a suggestion.` };
    if (bottoms.length) return { missing: `Add a top ${tag} (or a dress) to get a suggestion.` };
    return { missing: `Add a dress, or a top and a bottom, ${tag} to get a suggestion.` };
  }

  // ---- Build one random outfit ----
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function buildOne() {
    const outfit = [];
    // Choose between "top + bottom" and "dress", weighted by how many options each has
    const pairCount = tops.length * bottoms.length;
    const useDress = dresses.length && Math.random() < dresses.length / (dresses.length + pairCount);

    if (useDress) {
      outfit.push({ role: "Dress", item: pick(dresses) });
    } else {
      outfit.push({ role: "Top", item: pick(tops) });
      outfit.push({ role: "Bottom", item: pick(bottoms) });
    }
    if (shoes.length) outfit.push({ role: "Shoes", item: pick(shoes) });
    // Extras "if they fit": include sometimes, so suggestions vary
    if (outerwear.length && Math.random() < 0.5) outfit.push({ role: "Outerwear", item: pick(outerwear) });
    if (accessories.length && Math.random() < 0.6) outfit.push({ role: "Accessory", item: pick(accessories) });
    return outfit;
  }

  // ---- Try to make it different from the last one ----
  const sameAsBefore = (outfit) => {
    const ids = outfit.map((p) => p.item.id).sort().join();
    return ids === [...previousIds].sort().join();
  };

  let outfit = buildOne();
  for (let tries = 0; tries < 30 && sameAsBefore(outfit); tries++) outfit = buildOne();

  return { outfit, repeated: sameAsBefore(outfit) };
}
