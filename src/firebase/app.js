import { getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, browserPopupRedirectResolver, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { useStorage } from "./photos.js";

// =====================================================
// Firebase setup. The web config comes from the server (GET /api/config),
// which reads the FIREBASE_* values from .env or Cloud Run settings.
// =====================================================
export const fb = { app: null, auth: null, db: null, storage: null };

export function initFirebase(config) {
  if (fb.app) return fb;
  fb.app = getApps()[0] || initializeApp(config);
  fb.auth = initializeAuth(fb.app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // Offline cache: the app keeps working without a connection and catches up later
  try {
    fb.db = initializeFirestore(fb.app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn("Firestore offline cache unavailable, using memory only:", err);
    fb.db = initializeFirestore(fb.app, { ignoreUndefinedProperties: true });
  }
  fb.storage = config.storageBucket ? getStorage(fb.app) : null;
  useStorage(Boolean(fb.storage));
  return fb;
}
