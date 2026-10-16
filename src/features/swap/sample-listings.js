import { placeholderImage } from "../../core/placeholders.js";

// =====================================================
// Sample swap listings
// Shown to guests, and alongside real community listings so the
// feed never looks empty during a demo.
// =====================================================

export const SAMPLE_LISTINGS = [
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

export async function getSampleListings() {
  return SAMPLE_LISTINGS.map((l) => ({ ...l, photo: placeholderImage(l.category, l.color), sample: true }));
}
