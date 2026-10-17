import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { resizeDataUrl } from "../core/images.js";
import { fb } from "./app.js";

// =====================================================
// Photos: the app keeps photos on the device as data URLs. Before anything
// goes to the cloud, those photos are uploaded to Firebase Storage
// (users/{uid}/photos/{hash}.jpg) and replaced by their download URL.
// The same photo is only ever uploaded once (the file name is its hash).
//
// No Storage bucket? (New Firebase projects need the Blaze plan for Storage.)
// Then a smaller copy of the photo is kept inside the Firestore document
// instead, so sync still works on the free Spark plan.
// =====================================================
const URL_CACHE_KEY = "weari__photo_urls"; // device-only: photo hash -> download URL
const NO_BUCKET_ERRORS = ["storage/no-default-bucket", "storage/bucket-not-found", "storage/project-not-found", "storage/unauthorized", "storage/unauthenticated"];
let storageAvailable = true;

export function useStorage(available) {
  storageAvailable = Boolean(available);
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(URL_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}
function remember(hash, url) {
  try {
    const cache = readCache();
    cache[hash] = url;
    localStorage.setItem(URL_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// Small drawings (SVG placeholders) stay inline; real photos get uploaded
export const isUploadablePhoto = (v) => typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v);

async function hashOf(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const inFlight = new Map();

// inlineSize: longest side (px) of the copy kept in Firestore when there is no Storage bucket
export async function uploadPhoto(uid, dataUrl, { inlineSize = 480 } = {}) {
  if (!isUploadablePhoto(dataUrl)) return dataUrl;
  if (!storageAvailable) return resizeDataUrl(dataUrl, inlineSize, 0.7);
  const hash = await hashOf(dataUrl);
  const cached = readCache()[hash];
  if (cached) return cached;
  if (inFlight.has(hash)) return inFlight.get(hash);

  const job = (async () => {
    const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const fileRef = ref(fb.storage, `users/${uid}/photos/${hash}.${ext}`);
    await uploadString(fileRef, dataUrl, "data_url", { contentType: mime, cacheControl: "public, max-age=31536000" });
    const url = await getDownloadURL(fileRef);
    remember(hash, url);
    return url;
  })();
  inFlight.set(hash, job);
  try {
    return await job;
  } catch (err) {
    if (NO_BUCKET_ERRORS.includes(err.code)) {
      console.warn(
        `Firebase Storage unavailable (${err.code}). Photos will be stored inside Firestore instead. ` +
          "To use Storage: Firebase Console → Storage → Get started, then deploy storage.rules (see docs/FIREBASE_SETUP.md)."
      );
      storageAvailable = false;
      return resizeDataUrl(dataUrl, inlineSize, 0.7);
    }
    throw err; // offline or similar: the sync retries later
  } finally {
    inFlight.delete(hash);
  }
}

// Return a copy of any value (item, outfit list, plan…) with every "photo" uploaded
export async function withCloudPhotos(uid, value, options) {
  if (Array.isArray(value)) return Promise.all(value.map((v) => withCloudPhotos(uid, v, options)));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = k === "photo" && isUploadablePhoto(v) ? await uploadPhoto(uid, v, options) : await withCloudPhotos(uid, v, options);
    }
    return out;
  }
  return value;
}
