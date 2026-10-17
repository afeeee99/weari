import { escapeHtml } from "./format.js";

// =====================================================
// In-app confirm dialog. Used instead of window.confirm(), which looks
// out of place and is often blocked inside mobile app WebViews.
//   if (await confirmDialog({ title: "Remove item?", confirmLabel: "Remove", danger: true })) { ... }
// =====================================================
let root = null;

function ensureRoot() {
  if (root) return root;
  root = document.createElement("div");
  root.className = "dialog-root";
  root.hidden = true;
  document.body.appendChild(root);
  return root;
}

export function confirmDialog({ title, message = "", confirmLabel = "OK", cancelLabel = "Cancel", danger = false }) {
  const el = ensureRoot();
  el.innerHTML = `
    <div class="dialog-backdrop" data-dialog="cancel"></div>
    <div class="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
      <h3 id="dialog-title" class="dialog-title">${escapeHtml(title)}</h3>
      ${message ? `<p class="dialog-message">${escapeHtml(message)}</p>` : ""}
      <div class="dialog-actions">
        <button type="button" class="btn-secondary" data-dialog="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="${danger ? "btn-danger" : "btn-primary"}" data-dialog="ok">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;
  el.hidden = false;
  const okBtn = el.querySelector('[data-dialog="ok"]');
  okBtn.focus();

  return new Promise((resolve) => {
    const finish = (result) => {
      el.hidden = true;
      el.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onClick = (e) => {
      const action = e.target.closest("[data-dialog]")?.dataset.dialog;
      if (action) finish(action === "ok");
    };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
    };
    el.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
  });
}
