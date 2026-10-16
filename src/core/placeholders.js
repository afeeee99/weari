import { COLORS } from "./constants.js";

export function colorHex(name) {
  return (COLORS.find((c) => c.name === name) || {}).hex || "#ccc";
}

// Simple original flat-color drawings for items without a photo (demo pieces, fallbacks).
// `kind` picks a variant shape: "heel" for dressy shoes, "bag" or "belt" for accessories.
const PLACEHOLDER_SHAPES = {
  top: '<path d="M70 50 L100 40 Q120 56 140 40 L170 50 L196 84 L172 98 L162 86 L162 176 L78 176 L78 86 L68 98 L44 84 Z"/>',
  bottom: '<path d="M80 36 L160 36 L172 184 L132 184 L120 88 L108 184 L68 184 Z"/>',
  dress: '<path d="M96 34 L144 34 L140 70 L176 186 L64 186 L100 70 Z"/>',
  outerwear: '<path d="M66 46 L100 36 L120 96 L140 36 L174 46 L198 168 L172 172 L166 112 L166 186 L74 186 L74 112 L68 172 L42 168 Z"/><path d="M120 96 L120 186" stroke="rgba(0,0,0,.18)" stroke-width="4" fill="none"/>',
  shoes: '<path d="M40 150 L40 118 Q60 104 92 112 L120 128 Q170 132 196 148 L200 168 L40 168 Z"/><rect x="40" y="160" width="160" height="10" rx="4" fill="rgba(0,0,0,.18)"/>',
  heel: '<path d="M50 132 Q90 112 130 136 Q160 150 196 150 L196 162 L132 162 Q100 150 72 162 L64 196 L54 196 L52 160 Z"/><path d="M110 126 L126 112 M140 142 L150 124" stroke="rgba(0,0,0,.25)" stroke-width="5" fill="none"/>',
  bag: '<path d="M88 92 Q88 50 120 50 Q152 50 152 92" stroke="currentColor" stroke-width="10" fill="none"/><path d="M60 92 L180 92 L168 184 L72 184 Z"/>',
  belt: '<rect x="30" y="104" width="180" height="32" rx="6"/><rect x="98" y="96" width="44" height="48" rx="6" fill="none" stroke="#c9a54a" stroke-width="8"/>',
  accessory: '<circle cx="120" cy="120" r="54"/><circle cx="120" cy="120" r="24" fill="#f4f1ec"/>',
};

export function placeholderImage(category, color, kind) {
  const fill = colorHex(color);
  const outline = ["white", "beige"].includes(color) ? "#cfc6b8" : "none";
  const shape = PLACEHOLDER_SHAPES[kind] || PLACEHOLDER_SHAPES[category] || PLACEHOLDER_SHAPES.accessory;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="#f4f1ec"/><g fill="${fill}" color="${fill}" stroke="${outline}" stroke-width="2" stroke-linejoin="round">${shape}</g></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
