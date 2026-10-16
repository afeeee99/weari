import { $ } from "../../core/dom.js";
import { ONBOARDING_ANSWERS_KEY } from "../onboarding/onboarding.js";
import { kv } from "../../core/kv.js";

// =====================================================
// Settings Modal
// =====================================================
function openSettings() {
  const answers = JSON.parse(kv.getItem(ONBOARDING_ANSWERS_KEY) || "{}");
  const summaryEl = $("#settings-profile-summary");
  if (summaryEl) {
    const hasAny = answers.goal || (answers.styles && answers.styles.length) || (answers.occasions && answers.occasions.length) || answers.shopping;
    if (hasAny) {
      summaryEl.innerHTML = `
        <div class="settings-profile-row">
          <span class="settings-profile-label">Goal</span>
          <span class="settings-profile-value">${answers.goal || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Style</span>
          <span class="settings-profile-value">${(answers.styles && answers.styles.join(", ")) || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Dressing for</span>
          <span class="settings-profile-value">${(answers.occasions && answers.occasions.join(", ")) || "Not set"}</span>
        </div>
        <div class="settings-profile-row">
          <span class="settings-profile-label">Shopping habit</span>
          <span class="settings-profile-value">${answers.shopping || "Not set"}</span>
        </div>
      `;
    } else {
      summaryEl.innerHTML = `<p class="settings-empty-profile">No style answers saved yet.</p>`;
    }
  }

  $("#settings-modal").hidden = false;
  $("#settings-backdrop").hidden = false;
}

export function closeSettings() {
  $("#settings-modal").hidden = true;
  $("#settings-backdrop").hidden = true;
}

$("#btn-settings")?.addEventListener("click", openSettings);
$("#btn-profile-settings")?.addEventListener("click", openSettings);
$("#settings-close")?.addEventListener("click", closeSettings);
$("#settings-backdrop")?.addEventListener("click", closeSettings);
