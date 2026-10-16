import { callApi } from "../../core/api.js";
import { OCCASIONS } from "../../core/constants.js";
import { $, toast } from "../../core/dom.js";
import { describe, escapeHtml, plainText } from "../../core/format.js";
import { resizeImage } from "../../core/images.js";
import { getAllItems } from "../../data/items-db.js";
import { recordPurchaseAvoided } from "../insights/impact.js";
import { KARMA_CONFIG, awardKarma } from "../karma/karma.js";
import { logOutfitWorn } from "./ai-stylist.js";
import { getOnboardingPreferences } from "./basic-stylist.js";
import { promptFavoriteOutfit } from "./favorites.js";
import { currentStyleMode } from "./style-screen.js";

// =====================================================
// Style me — Chat with the stylist (talks to POST /api/chat)
// =====================================================
const CHAT_BREAK_MSG = "The stylist needs a short break, please try again soon.";
const CHAT_CHIP_TEXT = {
  vibe: "What’s the vibe today?",
  screenshot: "Style me from this screenshot",
  buy: "Should I buy this?",
};
const chatMessages = []; // { role: "user" | "stylist", text, image?, result?, error? } — kept in memory only
let chatPendingImage = null; // 512px photo waiting to be sent
let chatChipAwaitingPhoto = null; // chip text to send once a photo is picked
let chatBusy = false;
let chatItemsById = new Map(); // wardrobe lookup for outfit cards in replies

// Wardrobe as compact text for the chat: "id | category | color | occasions | wears | days since worn"
function wardrobeAsChatText(items) {
  const now = Date.now();
  return items
    .map((it) => {
      const days = it.lastWorn ? Math.max(0, Math.floor((now - new Date(it.lastWorn).getTime()) / 86400000)) : "-";
      return [it.id, it.category, it.color, (it.occasions || []).join(", "), it.wearCount || 0, Number.isFinite(days) ? days : "-"]
        .map(plainText)
        .join(" | ");
    })
    .join("\n");
}

function chatBubbleHtml(msg, index) {
  if (msg.role === "user") {
    return `
      <div class="chat-row user">
        <div class="chat-bubble user">
          ${msg.image ? `<img class="chat-bubble-img" src="${msg.image}" alt="Attached photo" />` : ""}
          ${msg.text ? `<p>${escapeHtml(msg.text)}</p>` : ""}
        </div>
      </div>`;
  }
  return `
    <div class="chat-row stylist">
      <div class="chat-avatar">✨</div>
      <div class="chat-bubble stylist ${msg.error ? "error" : ""}">
        <p>${escapeHtml(msg.text)}</p>
        ${msg.result ? chatResultHtml(msg, index) : ""}
      </div>
    </div>`;
}

// Extra content under a stylist reply (outfit cards, swap offer, verdict) — filled in by renderChatResult
function chatResultHtml(msg, index) {
  return renderChatResult(msg, index);
}

export async function renderChat() {
  const log = $("#chat-log");
  if (!log) return;
  if (!chatMessages.length) {
    log.innerHTML = `
      <div class="chat-row stylist">
        <div class="chat-avatar">✨</div>
        <div class="chat-bubble stylist">
          <p>Hi! I’m your Weari stylist. Ask me what to wear, send a screenshot of a look you love, or check something before you buy it.</p>
        </div>
      </div>`;
  } else {
    chatItemsById = new Map((await getAllItems()).map((it) => [String(it.id), it]));
    log.innerHTML = chatMessages.map(chatBubbleHtml).join("");
    log.lastElementChild?.classList.add("is-new"); // only the newest bubble animates in
  }
  if (chatBusy) {
    log.insertAdjacentHTML(
      "beforeend",
      `<div class="chat-row stylist"><div class="chat-avatar">✨</div><div class="chat-bubble stylist typing"><span></span><span></span><span></span></div></div>`
    );
  }
  const last = log.lastElementChild;
  if (last && currentStyleMode === "chat") last.scrollIntoView({ block: "nearest" });
}

function setChatAttachment(dataUrl) {
  chatPendingImage = dataUrl;
  $("#chat-attachment").hidden = !dataUrl;
  $("#chat-attachment-img").src = dataUrl || "";
}

async function sendChat(text) {
  text = String(text || "").trim();
  if (chatBusy || (!text && !chatPendingImage)) return;

  const history = chatMessages.slice(-4).map((m) => ({ role: m.role, text: m.text }));
  const image = chatPendingImage;
  chatMessages.push({ role: "user", text, image });
  setChatAttachment(null);
  $("#chat-input").value = "";
  chatBusy = true;
  $("#chat-send").disabled = true;
  renderChat();

  try {
    const items = await getAllItems();
    const res = await callApi(
      "/api/chat",
      {
        message: text,
        history,
        image: image || undefined,
        wardrobe: wardrobeAsChatText(items),
        // getOnboardingPreferences() returns only goal, styles and occasions — never age, budget or other answers
        preferences: getOnboardingPreferences() || {},
      },
      { timeoutMs: 30000 }
    );
    chatMessages.push({ role: "stylist", text: res.reply, result: res });
  } catch (err) {
    console.warn("Chat stylist unavailable:", err.message);
    chatMessages.push({ role: "stylist", text: CHAT_BREAK_MSG, error: true });
  } finally {
    chatBusy = false;
    $("#chat-send").disabled = false;
    renderChat();
  }
}

$("#chat-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  chatChipAwaitingPhoto = null;
  sendChat($("#chat-input").value);
});

// Attach: camera or upload (photos are shrunk to 512px before sending)
function toggleChatAttachMenu(open) {
  const menu = $("#chat-attach-menu");
  menu.hidden = open === undefined ? !menu.hidden : !open;
  $("#chat-attach-btn").setAttribute("aria-expanded", String(!menu.hidden));
}
$("#chat-attach-btn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleChatAttachMenu();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".chat-attach-wrap")) $("#chat-attach-menu") && toggleChatAttachMenu(false);
});
$("#chat-attach-menu")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-chat-attach]");
  if (!btn) return;
  toggleChatAttachMenu(false);
  $(btn.dataset.chatAttach === "camera" ? "#chat-file-camera" : "#chat-file-upload").click();
});
["#chat-file-camera", "#chat-file-upload"].forEach((sel) => {
  $(sel)?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      setChatAttachment(await resizeImage(file, 512, 0.7));
      if (chatChipAwaitingPhoto) {
        const text = $("#chat-input").value || chatChipAwaitingPhoto;
        chatChipAwaitingPhoto = null;
        sendChat(text);
      }
    } catch {
      toast("Couldn't read that photo");
    }
  });
});
$("#chat-attachment-remove")?.addEventListener("click", () => setChatAttachment(null));

// Chips: the vibe question sends right away; the other two ask for a photo first
$("#chat-chips")?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-chat-chip]");
  if (!chip) return;
  const text = CHAT_CHIP_TEXT[chip.dataset.chatChip];
  if (chip.dataset.chatChip === "vibe" || chatPendingImage) {
    sendChat(text);
    return;
  }
  // Ask for a photo; if they cancel, the text stays in the box so they can describe it instead
  chatChipAwaitingPhoto = text;
  $("#chat-input").value = text;
  $("#chat-file-upload").click();
});

// "I'll skip it" after a purchase check (Chat and Buying Brain): karma + a purchase avoided
export function skipPurchase() {
  recordPurchaseAvoided(1);
  awardKarma(KARMA_CONFIG.POINTS.SKIP_PURCHASE, `Skipped a purchase (+${KARMA_CONFIG.POINTS.SKIP_PURCHASE})`);
  toast("Nice! That's one purchase avoided 🌱");
}

// ---------- What appears under a stylist reply ----------
const VERDICT_LABELS = {
  skip: { icon: "🙅", text: "Skip it — you already have this covered" },
  swap_first: { icon: "🔁", text: "Swap first — try the Swap feed before buying" },
  buy: { icon: "🛍️", text: "Worth buying — it fills a real gap" },
};

function renderChatResult(msg, index) {
  const r = msg.result;
  const pieces = (r.outfit_item_ids || []).map((id) => chatItemsById.get(String(id))).filter(Boolean);
  const isOutfit = (r.kind === "outfit" || r.kind === "reference_match") && pieces.length;
  let html = "";

  if (pieces.length) {
    html += `<div class="chat-cards">${pieces
      .map(
        (it) => `
        <div class="chat-card">
          <img src="${it.photo}" alt="${escapeHtml(describe(it))}" />
          <span>${escapeHtml(it.name || describe(it))}</span>
        </div>`
      )
      .join("")}</div>`;
  }

  if (isOutfit) {
    html += `<div class="chat-actions">
      <button type="button" class="chat-action" data-chat-fav="${index}">♥ Favorite</button>
      <button type="button" class="chat-action" data-chat-wore="${index}" ${msg.wore ? "disabled" : ""}>${msg.wore ? "✓ Logged" : "✓ I wore this"}</button>
    </div>`;
  }

  if (r.kind === "purchase_check" && VERDICT_LABELS[r.verdict]) {
    const v = VERDICT_LABELS[r.verdict];
    html += `<div class="chat-verdict ${r.verdict}"><span>${v.icon}</span><strong>${v.text}</strong></div>`;
    if (r.verdict === "skip") {
      html += `<div class="chat-actions">
        <button type="button" class="chat-action primary" data-chat-skip="${index}" ${msg.skipped ? "disabled" : ""}>
          ${msg.skipped ? `✓ Skipped (+${KARMA_CONFIG.POINTS.SKIP_PURCHASE} karma)` : "I’ll skip it"}
        </button>
      </div>`;
    }
  }

  const offerSwap = (r.missing_pieces || []).length || (r.kind === "purchase_check" && r.verdict === "swap_first");
  if ((r.missing_pieces || []).length) {
    html += `<div class="chat-missing"><span>Missing:</span>${r.missing_pieces
      .map((m) => `<span class="tag">${escapeHtml(m)}</span>`)
      .join("")}</div>`;
  }
  if (offerSwap) {
    html += `<div class="chat-actions"><button type="button" class="chat-action" data-go="swap">🔁 Find it on the Swap feed</button></div>`;
  }
  return html ? `<div class="chat-result">${html}</div>` : "";
}

$("#chat-log")?.addEventListener("click", async (e) => {
  const fav = e.target.closest("[data-chat-fav]");
  const wore = e.target.closest("[data-chat-wore]");
  const skip = e.target.closest("[data-chat-skip]");
  const btn = fav || wore || skip;
  if (!btn) return;
  const msg = chatMessages[Number(btn.dataset.chatFav ?? btn.dataset.chatWore ?? btn.dataset.chatSkip)];
  if (!msg || !msg.result) return;
  const ids = (msg.result.outfit_item_ids || []).filter((id) => chatItemsById.has(String(id)));

  if (fav) {
    const occasion = OCCASIONS.find((o) => (chatMessages[chatMessages.indexOf(msg) - 1]?.text || "").toLowerCase().includes(o)) || "casual";
    promptFavoriteOutfit({
      id: "outfit_chat_" + Date.now(),
      name: "Chat look",
      occasion,
      createdAt: Date.now(),
      items: ids.map((id) => chatItemsById.get(String(id))),
    });
  }

  if (wore && !msg.wore) {
    msg.wore = true;
    await logOutfitWorn(ids);
    renderChat();
  }

  if (skip && !msg.skipped) {
    msg.skipped = true;
    skipPurchase();
    renderChat();
  }
});
