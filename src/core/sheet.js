import { $ } from "./dom.js";

// =====================================================
// The shared pop-up panel. Slides up from the bottom on phones and
// shows as a centered dialog on larger screens (see styles/layout.css).
// Any button with data-close-sheet closes it.
// =====================================================
export function openSheet(html) {
  $("#sheet-content").innerHTML = html;
  $("#sheet").hidden = false;
  $("#sheet-backdrop").hidden = false;
  $("#sheet").scrollTop = 0;
  document.body.classList.add("no-scroll");
}

export function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheet-backdrop").hidden = true;
  document.body.classList.remove("no-scroll");
}

export const isSheetOpen = () => !$("#sheet").hidden;

$("#sheet-backdrop").addEventListener("click", closeSheet);
$("#sheet").addEventListener("click", (e) => {
  if (e.target.closest("[data-close-sheet]")) closeSheet();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isSheetOpen()) closeSheet();
});
