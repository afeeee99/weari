import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from "firebase/auth";
import { fb } from "./app.js";

// =====================================================
// Sign-in: Google or email + password.
// Google blocks its sign-in page inside embedded app WebViews, so a future
// mobile app should sign in natively and pass the Google ID token to
// window.weari.signInWithGoogleIdToken(token) (see docs/MOBILE_WEBVIEW.md).
// =====================================================

export function onUserChanged(callback) {
  // Shows any error from a redirect sign-in that finished while the page was away
  getRedirectResult(fb.auth).catch((err) => console.warn("Redirect sign-in failed:", err.code || err));
  return onAuthStateChanged(fb.auth, callback);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return await signInWithPopup(fb.auth, provider);
  } catch (err) {
    // Popups can be blocked (some phones, in-app browsers): use a full-page redirect instead
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/web-storage-unsupported"].includes(err.code)) {
      return signInWithRedirect(fb.auth, provider);
    }
    throw err;
  }
}

export function signInWithGoogleIdToken(idToken) {
  return signInWithCredential(fb.auth, GoogleAuthProvider.credential(idToken));
}

export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(fb.auth, email.trim(), password);
}

export async function signUpWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(fb.auth, email.trim(), password);
  if (name) await updateProfile(cred.user, { displayName: name.trim().slice(0, 40) });
  return cred;
}

export function resetPassword(email) {
  return sendPasswordResetEmail(fb.auth, email.trim());
}

export function signOutUser() {
  return signOut(fb.auth);
}

// Plain-language messages for the errors people actually hit
const AUTH_ERRORS = {
  "auth/invalid-credential": "That email and password don’t match. Try again or reset your password.",
  "auth/wrong-password": "That email and password don’t match. Try again or reset your password.",
  "auth/user-not-found": "There’s no account with that email yet. Create one instead?",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/missing-password": "Please enter your password.",
  "auth/email-already-in-use": "There’s already an account with that email. Sign in instead.",
  "auth/weak-password": "Please use a password with at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Please wait a minute and try again.",
  "auth/network-request-failed": "You seem to be offline. Check your connection and try again.",
  "auth/unauthorized-domain": "This website isn’t allowed to sign in yet. Add it in Firebase Console → Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed": "This sign-in method is turned off. Turn it on in Firebase Console → Authentication → Sign-in method.",
  "auth/popup-closed-by-user": "",
  "auth/cancelled-popup-request": "",
  "auth/user-cancelled": "",
};

// "" means the person cancelled on purpose: show nothing
export function friendlyAuthError(err) {
  const msg = AUTH_ERRORS[err?.code];
  return msg !== undefined ? msg : "Something went wrong while signing in. Please try again.";
}
