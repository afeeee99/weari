import { escapeHtml } from "./format.js";

// =====================================================
// Collage tiles: 1 to 4 photos scattered on a soft colored card.
// Used by the Closet, Favorites, the Swap deck, the weekly plan and Friends.
// Colors come from the onboarding palette (styles/features/collage.css).
// =====================================================
export const CLOSET_TILE_NAMES = {
  top: "Tops", bottom: "Bottoms", dress: "Dresses", shoes: "Shoes", outerwear: "Outerwear", accessory: "Accessories",
};
export const COLLAGE_COLORS = ["sage", "pink", "cognac", "cream"];

// Where 1 to 4 photos sit on a tile: left %, top %, width %, rotation
const COLLAGE_LAYOUTS = [
  [[14, 12, 72, -4]],
  [[6, 10, 54, -7], [42, 30, 54, 6]],
  [[4, 6, 50, -8], [46, 10, 50, 7], [22, 44, 52, -3]],
  [[4, 4, 48, -8], [48, 6, 46, 7], [6, 48, 46, 5], [50, 50, 46, -6]],
];

export const collageColor = (index) => COLLAGE_COLORS[index % COLLAGE_COLORS.length];

export function collageTileHtml(photos, colorIndex = 0) {
  const shown = photos.filter(Boolean).slice(0, 4);
  const layout = COLLAGE_LAYOUTS[Math.max(0, shown.length - 1)];
  return `
    <div class="collage-tile collage-${collageColor(colorIndex)}">
      ${shown
        .map((src, i) => {
          const [left, top, width, rot] = layout[i];
          return `<img src="${escapeHtml(src)}" alt="" loading="lazy" style="left:${left}%;top:${top}%;width:${width}%;transform:rotate(${rot}deg)" />`;
        })
        .join("")}
    </div>`;
}
