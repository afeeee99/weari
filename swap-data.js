// =====================================================
// Weari swap feed — SAMPLE DATA
//
// THIS IS THE FILE TO REPLACE WITH REAL DATA LATER.
// The app only calls getSwapListings() and expects a list of
// listings shaped like the ones below. When there is a backend,
// change getSwapListings() to fetch from it, e.g.:
//
//   async function getSwapListings() {
//     const res = await fetch("/api/listings");
//     return res.json();
//   }
// =====================================================

const SAMPLE_LISTINGS = [
  { id: "l1", member: "Maya",  title: "Linen button-down shirt", category: "top",       color: "white",  occasions: ["casual", "work", "travel"] },
  { id: "l2", member: "Priya", title: "Silk slip dress",         category: "dress",     color: "green",  occasions: ["party", "wedding", "date night"] },
  { id: "l3", member: "Sofia", title: "High-waist wide-leg trousers", category: "bottom", color: "beige", occasions: ["work", "formal"] },
  { id: "l4", member: "Amara", title: "Cropped denim jacket",    category: "outerwear", color: "blue",   occasions: ["casual", "travel"] },
  { id: "l5", member: "Lena",  title: "Strappy block heels",     category: "shoes",     color: "black",  occasions: ["party", "wedding", "formal"] },
  { id: "l6", member: "Hana",  title: "Woven straw tote",        category: "accessory", color: "brown",  occasions: ["beach", "casual", "travel"] },
  { id: "l7", member: "Chloe", title: "Pleated midi skirt",      category: "bottom",    color: "pink",   occasions: ["work", "date night", "wedding"] },
  { id: "l8", member: "Zara",  title: "Wool camel coat",         category: "outerwear", color: "brown",  occasions: ["work", "formal"] },
  { id: "l9", member: "Maya",  title: "Ribbed knit tank",        category: "top",       color: "red",    occasions: ["casual", "party"] },
];

async function getSwapListings() {
  return SAMPLE_LISTINGS.map((l) => ({ ...l, photo: placeholderImage(l.category, l.color) }));
}

// ---------- Placeholder "photos": a simple drawing of the garment ----------
const PLACEHOLDER_COLORS = {
  white: "#f4f1ec", black: "#2b2a29", grey: "#a3a3a3", beige: "#dccaa6", brown: "#9a6a45",
  red: "#d65a5a", pink: "#f0a9c4", orange: "#f0934f", yellow: "#f2d35b", green: "#5fae7c",
  blue: "#6c9fd8", navy: "#2e4170", purple: "#9a72c9", multi: "#c9a0dc",
};

const GARMENT_SHAPES = {
  top: "M38 22 L50 18 Q60 26 70 18 L82 22 L96 40 L84 48 L80 42 L80 98 L40 98 L40 42 L36 48 L24 40 Z",
  bottom: "M40 18 L80 18 L84 100 L66 100 L60 50 L54 100 L36 100 Z",
  dress: "M48 14 L72 14 L70 36 L90 104 L30 104 L50 36 Z",
  shoes: "M22 56 Q22 42 34 42 L48 44 Q58 58 78 60 L96 64 Q100 72 96 78 L26 78 Q20 74 22 56 Z",
  outerwear: "M44 12 L60 34 L76 12 L92 20 L104 78 L92 80 L86 48 L88 110 L32 110 L34 48 L28 80 L16 78 L28 20 Z M60 34 L60 110",
  accessory: "M30 46 L90 46 L84 100 L36 100 Z",
};

function placeholderImage(category, color) {
  const fill = PLACEHOLDER_COLORS[color] || "#cccccc";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160">
    <rect width="120" height="160" fill="#f1ede7"/>
    <g transform="translate(0 20)">
      ${category === "accessory" ? `<path d="M46 46 Q46 22 60 22 Q74 22 74 46" fill="none" stroke="${fill}" stroke-width="5"/>` : ""}
      <path d="${GARMENT_SHAPES[category]}" fill="${fill}"
        stroke="rgba(0,0,0,0.18)" stroke-width="2" stroke-linejoin="round"/>
    </g>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
