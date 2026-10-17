import { $, toast } from "../../core/dom.js";
import { confirmDialog } from "../../core/dialog.js";
import { escapeHtml } from "../../core/format.js";
import { kv } from "../../core/kv.js";
import { isEmbeddedWebView, nativeBridge } from "../../core/platform.js";
import { refreshCurrentScreen } from "../../core/router.js";
import { closeSheet, openSheet } from "../../core/sheet.js";
import { getAllItems } from "../../data/items-db.js";
import { updateKarmaChip } from "../karma/karma.js";
import { clearDeviceData } from "../settings/reset.js";

// =====================================================
// Account: optional sign-in with Firebase.
//   Guest  -> everything stays on this device (works with no setup at all)
//   Signed -> the same data syncs to the user's account and other devices,
//             and the Swap feed shows real community listings
// =====================================================
const PROFILE_FIRST_NAME_KEY = "weari_profile_first_name";
const PROFILE_EMAIL_KEY = "weari_profile_email";

let firebase = null; // src/firebase/index.js once loaded
let currentUser = null;
let cloudState = "loading"; // loading | off | ready
let syncStatus = "off";

export const getSignedInUser = () => currentUser;
export const isCloudReady = () => cloudState === "ready";
export const getFirebase = () => firebase;

// The name other members see on your swap listings and requests
export function getDisplayName() {
  const typed = (kv.getItem(PROFILE_FIRST_NAME_KEY) || "").trim();
  return typed || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Weari member";
}

export async function startAccount() {
  let config = null;
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    config = (await res.json()).firebase;
  } catch (err) {
    console.warn("Could not load app settings:", err.message);
  }
  if (!config) {
    cloudState = "off";
    renderAccountUI();
    return;
  }
  try {
    firebase = await import("../../firebase/index.js");
    firebase.initFirebase(config);
    cloudState = "ready";
    firebase.onUserChanged(handleUserChanged);
  } catch (err) {
    console.error("Firebase failed to start:", err);
    cloudState = "off";
  }
  renderAccountUI();
}

// ---------- Signed in / signed out ----------
let refreshTimer = null;
function onCloudChange() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    updateKarmaChip();
    refreshCurrentScreen();
  }, 250);
}

async function handleUserChanged(user) {
  const wasGuest = !currentUser;
  currentUser = user;
  if (user) {
    fillProfileFromAccount(user);
    guestChosen = false;
    firebase.startSync(user, {
      ownerName: getDisplayName,
      onChange: onCloudChange,
      onStatus: (status) => {
        syncStatus = status;
        renderSyncStatus();
      },
    });
    if (wasGuest && (await getAllItems()).length) toast("Signed in. Syncing your wardrobe ☁️");
  } else {
    firebase.stopSync();
    syncStatus = "off";
  }
  renderAccountUI();
  document.dispatchEvent(new CustomEvent("weari:auth-changed", { detail: { user } }));
}

async function signOutFlow() {
  const ok = await confirmDialog({
    title: "Sign out?",
    message: "Your wardrobe stays safe in your account. This device will be cleared until you sign in again.",
    confirmLabel: "Sign out",
  });
  if (!ok) return;
  try {
    firebase.forgetSyncState();
    await firebase.signOutUser();
  } catch (err) {
    console.warn("Sign out failed:", err);
  }
  await clearDeviceData();
  location.reload();
}

export async function wipeCloudData() {
  if (currentUser && firebase) await firebase.wipeCloudData(currentUser.uid);
}

// ---------- UI: account card (Profile) + avatar chip (top bar) ----------
const SYNC_LABELS = {
  synced: { icon: "✓", text: "Synced" },
  syncing: { icon: "↻", text: "Syncing…" },
  offline: { icon: "⏸", text: "Offline · will sync later" },
  error: { icon: "!", text: "Sync paused · retrying" },
  off: { icon: "", text: "" },
};

function initialOf(user) {
  return (getDisplayName().trim().charAt(0) || "W").toUpperCase();
}

function avatarHtml(user, cls = "") {
  return user?.photoURL
    ? `<img class="account-avatar ${cls}" src="${escapeHtml(user.photoURL)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="account-avatar ${cls}">${escapeHtml(initialOf(user))}</span>`;
}

function renderSyncStatus() {
  const el = $("#account-sync-status");
  if (!el) return;
  const s = SYNC_LABELS[syncStatus] || SYNC_LABELS.off;
  el.dataset.status = syncStatus;
  el.innerHTML = s.text ? `<span class="sync-dot"></span>${s.text}` : "";
}

// Sign-in prompts placed around the app (<div data-auth-block>): Closet card, Friends, Settings
let guestChosen = false; // "Continue as guest" tapped during this visit

function renderAuthBlocks() {
  document.querySelectorAll("[data-auth-block]").forEach((block) => {
    const signedIn = Boolean(currentUser);
    block.hidden = cloudState !== "ready" || (block.dataset.authBlock === "prompt" && guestChosen && !signedIn);
    block.querySelector("[data-auth-guest]").hidden = signedIn;
    block.querySelector("[data-auth-signed]").hidden = !signedIn;
    if (signedIn) {
      block.querySelector("[data-auth-name]").textContent = currentUser.displayName || currentUser.email || "Weari member";
      const photo = block.querySelector("[data-auth-photo]");
      photo.hidden = !currentUser.photoURL;
      if (currentUser.photoURL) photo.src = currentUser.photoURL;
    }
  });

  // Profile avatar: account photo while signed in, otherwise the initial
  const avatar = $("#profile-avatar");
  if (avatar) {
    let img = avatar.querySelector(".profile-avatar-photo");
    if (currentUser?.photoURL) {
      if (!img) {
        img = document.createElement("img");
        img.className = "profile-avatar-photo";
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        avatar.appendChild(img);
      }
      img.src = currentUser.photoURL;
      img.hidden = false;
    } else if (img) img.hidden = true;
  }
}

function showBlockMessage(button, text) {
  const msg = button.closest("[data-auth-block]")?.querySelector("[data-auth-msg]");
  if (!msg) return toast(text);
  msg.textContent = text;
  msg.hidden = !text;
}

// First sign-in fills in an empty profile name and email (never overwrites what was typed)
function fillProfileFromAccount(user) {
  const firstName = (user.displayName || "").trim().split(/\s+/)[0];
  if (firstName && !kv.getItem(PROFILE_FIRST_NAME_KEY)) kv.setItem(PROFILE_FIRST_NAME_KEY, firstName);
  if (user.email && !kv.getItem(PROFILE_EMAIL_KEY)) kv.setItem(PROFILE_EMAIL_KEY, user.email);
}

export function renderAccountUI() {
  renderAuthBlocks();
  const chip = $("#account-chip");
  if (chip) {
    chip.hidden = cloudState !== "ready";
    chip.innerHTML = currentUser ? avatarHtml(currentUser, "sm") : `<span class="account-chip-label">Sign in</span>`;
    chip.title = currentUser ? `Signed in as ${currentUser.email || getDisplayName()}` : "Sign in to sync and swap";
  }

  const card = $("#account-card");
  if (!card) return;
  if (cloudState === "loading") {
    card.innerHTML = "";
    return;
  }
  if (cloudState === "off") {
    card.innerHTML = `
      <div class="account-card-row">
        <div class="account-card-icon">🔒</div>
        <div>
          <strong>On-device mode</strong>
          <small>Your wardrobe is saved on this device only. Accounts and cloud sync turn on when Firebase is connected.</small>
        </div>
      </div>`;
    return;
  }
  if (!currentUser) {
    card.innerHTML = `
      <div class="account-card-row">
        <div class="account-card-icon">☁️</div>
        <div>
          <strong>Back up your wardrobe</strong>
          <small>Sign in to keep your closet on every device and swap with real people.</small>
        </div>
      </div>
      <div class="account-card-actions">
        <button type="button" class="btn-primary" data-auth-open="signin">Sign in</button>
        <button type="button" class="btn-secondary" data-auth-open="signup">Create account</button>
      </div>`;
    return;
  }
  card.innerHTML = `
    <div class="account-card-row">
      ${avatarHtml(currentUser)}
      <div class="account-card-who">
        <strong>${escapeHtml(currentUser.displayName || getDisplayName())}</strong>
        <small>${escapeHtml(currentUser.email || "")}</small>
        <span id="account-sync-status" class="sync-status"></span>
      </div>
      <button type="button" class="btn-link-action" data-auth-signout>Sign out</button>
    </div>`;
  renderSyncStatus();
}

// ---------- UI: sign-in sheet ----------
const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/></svg>`;

const AUTH_COPY = {
  signin: { title: "Welcome back", button: "Sign in" },
  signup: { title: "Create your Weari account", button: "Create account" },
  reset: { title: "Reset your password", button: "Send reset link" },
};

export function openAuthSheet(mode = "signin") {
  if (!isCloudReady()) {
    toast("Accounts aren’t set up on this server yet");
    return;
  }
  const copy = AUTH_COPY[mode];
  // Google's sign-in page doesn't open inside app WebViews unless the native app handles it
  const showGoogle = mode !== "reset" && (!isEmbeddedWebView || nativeBridge()?.googleSignIn);
  openSheet(`
    <div class="auth-sheet">
      <button type="button" class="btn-detail-close auth-close" aria-label="Close" data-close-sheet>✕</button>
      <div class="auth-head">
        <img class="auth-logo brand-mark" src="/brand/weari-mark.svg" alt="Weari" width="936" height="576" />
        <h3>${copy.title}</h3>
        <p>${mode === "reset" ? "We’ll email you a link to choose a new password." : "Keep your closet on every device and swap with the community."}</p>
      </div>
      ${showGoogle ? `<button type="button" class="btn-google" data-auth="google">${GOOGLE_ICON}<span>Continue with Google</span></button><div class="auth-divider"><span>or use email</span></div>` : ""}
      <form id="auth-form" class="auth-form" data-mode="${mode}" novalidate>
        ${mode === "signup" ? `<label class="field-label">Your name<input class="text-input" name="name" autocomplete="given-name" maxlength="40" placeholder="e.g. Maya" /></label>` : ""}
        <label class="field-label">Email<input class="text-input" type="email" name="email" autocomplete="email" inputmode="email" required placeholder="you@example.com" /></label>
        ${mode !== "reset" ? `<label class="field-label">Password<input class="text-input" type="password" name="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="6" required placeholder="${mode === "signup" ? "At least 6 characters" : "Your password"}" /></label>` : ""}
        <p class="error auth-error" hidden></p>
        <button type="submit" class="btn-primary btn-block">${copy.button}</button>
      </form>
      <div class="auth-switch">
        ${mode === "signin" ? `<button type="button" class="link-btn" data-auth-mode="reset">Forgot password?</button><span>New here? <button type="button" class="link-btn" data-auth-mode="signup">Create an account</button></span>` : ""}
        ${mode !== "signin" ? `<span>Already have an account? <button type="button" class="link-btn" data-auth-mode="signin">Sign in</button></span>` : ""}
      </div>
      <p class="auth-note">Anything already on this device is added to your account.</p>
    </div>`);
  setTimeout(() => $("#auth-form input")?.focus({ preventScroll: true }), 250);
}

function showAuthError(msg) {
  const el = $(".auth-error");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

async function runAuth(button, action) {
  showAuthError("");
  if (button) button.disabled = true;
  try {
    await action();
    return true;
  } catch (err) {
    console.warn("Auth failed:", err.code || err);
    showAuthError(firebase.friendlyAuthError(err));
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}

document.addEventListener("click", async (e) => {
  const open = e.target.closest("[data-auth-open]");
  if (open) return openAuthSheet(open.dataset.authOpen);

  if (e.target.closest("#account-chip")) {
    if (currentUser) {
      closeSheet();
      document.querySelector('[data-go="profile"]')?.click();
    } else openAuthSheet("signin");
    return;
  }

  const modeBtn = e.target.closest("[data-auth-mode]");
  if (modeBtn) return openAuthSheet(modeBtn.dataset.authMode);

  if (e.target.closest("[data-auth-signout]") || e.target.closest("[data-google-signout]")) return signOutFlow();

  const guest = e.target.closest("[data-continue-guest]");
  if (guest) {
    guestChosen = true;
    renderAuthBlocks();
    showBlockMessage(guest, "You're using Weari as a guest. Your wardrobe stays on this device.");
    return;
  }

  // "Continue with Google" inside a sign-in prompt
  const blockGoogle = e.target.closest("[data-google-signin]");
  if (blockGoogle) {
    if (!isCloudReady()) return showBlockMessage(blockGoogle, "Sign-in isn’t available right now. You’re still in guest mode.");
    const native = nativeBridge();
    if (native?.googleSignIn) return native.googleSignIn();
    const label = blockGoogle.querySelector("span");
    const original = label ? label.textContent : "";
    blockGoogle.disabled = true;
    if (label) label.textContent = "Opening Google…";
    try {
      await firebase.signInWithGoogle();
      if (currentUser) toast(`Welcome, ${getDisplayName()} ✨`);
    } catch (err) {
      const msg = firebase.friendlyAuthError(err);
      showBlockMessage(blockGoogle, msg ? `${msg} You’re still in guest mode.` : "Sign-in was cancelled. You’re still in guest mode.");
    } finally {
      blockGoogle.disabled = false;
      if (label) label.textContent = original;
    }
    return;
  }

  const google = e.target.closest('[data-auth="google"]');
  if (google) {
    const native = nativeBridge();
    if (native?.googleSignIn) {
      native.googleSignIn(); // the native app calls window.weari.signInWithGoogleIdToken(token) when done
      return;
    }
    const ok = await runAuth(google, () => firebase.signInWithGoogle());
    if (ok && currentUser) {
      closeSheet();
      toast(`Welcome, ${getDisplayName()} ✨`);
    }
  }
});

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "auth-form") return;
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  const mode = form.dataset.mode;
  if (!email) return showAuthError("Please enter your email.");
  if (mode !== "reset" && password.length < 6) return showAuthError("Passwords have at least 6 characters.");

  const button = form.querySelector('[type="submit"]');
  const ok = await runAuth(button, async () => {
    if (mode === "signin") await firebase.signInWithEmail(email, password);
    if (mode === "signup") await firebase.signUpWithEmail(String(data.get("name") || ""), email, password);
    if (mode === "reset") await firebase.resetPassword(email);
  });
  if (!ok) return;
  if (mode === "reset") {
    toast("Check your inbox for the reset link 📬");
    openAuthSheet("signin");
    return;
  }
  closeSheet();
  toast(mode === "signup" ? "Account created. Welcome to Weari ✨" : `Welcome back, ${getDisplayName()} ✨`);
});

// For a native mobile app wrapping this page (see docs/MOBILE_WEBVIEW.md)
window.weari = {
  async signInWithGoogleIdToken(idToken) {
    if (!firebase) throw new Error("Firebase is not configured");
    await firebase.signInWithGoogleIdToken(idToken);
    closeSheet();
  },
  signOut: () => signOutFlow(),
};
