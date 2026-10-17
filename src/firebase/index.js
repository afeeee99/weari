// =====================================================
// Everything the app uses from Firebase, in one place.
// This file (and the Firebase SDK) is only downloaded when the server
// has Firebase settings, so the app stays light without them.
// =====================================================
export { initFirebase, fb } from "./app.js";
export {
  friendlyAuthError,
  onUserChanged,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signInWithGoogleIdToken,
  signOutUser,
  signUpWithEmail,
} from "./auth.js";
export { forgetSyncState, getSyncStatus, startSync, stopSync, wipeCloudData } from "./sync.js";
export { cancelSwapRequest, sendSwapRequest, setSwapRequestStatus, watchListings, watchSwapRequests } from "./community.js";
export { uploadPhoto, withCloudPhotos } from "./photos.js";
export * as friends from "./friends.js";
