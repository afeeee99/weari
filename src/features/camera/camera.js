import { $, toast } from "../../core/dom.js";
import { resizeImage } from "../../core/images.js";
import { handlePhotoSelected } from "../add-item/add-item.js";
import { runBuyCheck } from "../buying-brain/buying-brain.js";

// Camera Viewfinder Lifecycle
let cameraStream = null;
let currentFacingMode = "environment";
let capturedPhoto512 = null;

function resetCameraReviewUI() {
  const video = $("#camera-video");
  const frozenImg = $("#camera-frozen-img");
  const guide = $("#camera-guide");
  const captureControls = $("#camera-capture-controls");
  const reviewControls = $("#camera-review-controls");

  if (frozenImg) {
    frozenImg.src = "";
    frozenImg.hidden = true;
  }
  if (video) {
    video.hidden = false;
    if (cameraStream && video.paused) {
      video.play().catch(() => {});
    }
  }
  if (guide) guide.hidden = false;
  if (captureControls) captureControls.hidden = false;
  if (reviewControls) reviewControls.hidden = true;
  capturedPhoto512 = null;
}

function captureAndResizeCameraFrame(video, maxSize = 512, quality = 0.82) {
  const vWidth = video.videoWidth || 640;
  const vHeight = video.videoHeight || 480;
  const scale = Math.min(1, maxSize / Math.max(vWidth, vHeight));
  const targetW = Math.max(1, Math.round(vWidth * scale));
  const targetH = Math.max(1, Math.round(vHeight * scale));

  const canvas = $("#camera-canvas") || document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", quality);
}

// The same full-screen camera serves Add item ("add") and Buying Brain ("buycheck")
let cameraPurpose = "add";
let cameraFlipping = false;

export async function startCameraScan(purpose = "add") {
  const modal = $("#camera-modal");
  const video = $("#camera-video");
  const fallbackInput = $("#camera-fallback-file");

  // A fresh scan starts with an empty price (flipping the camera keeps it)
  if (!cameraFlipping && $("#camera-price")) $("#camera-price").value = "";
  cameraFlipping = false;
  cameraPurpose = purpose;
  const isBuyCheck = purpose === "buycheck";
  $("#camera-guide-text").textContent = isBuyCheck ? "Point at an item you’re thinking of buying" : "Place one item in the frame";
  $("#camera-price-wrap").hidden = !isBuyCheck;

  resetCameraReviewUI();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Camera is unavailable on this device. Opening file picker instead.");
    fallbackInput?.click();
    return;
  }

  try {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
    } catch (constrainedErr) {
      console.warn("Retrying camera with general constraints...", constrainedErr);
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }

    if (video) {
      video.srcObject = cameraStream;
      await video.play().catch(() => {});
    }

    if (modal) modal.hidden = false;
    const flipBtn = $("#camera-flip");
    if (flipBtn) flipBtn.hidden = false;
  } catch (err) {
    console.warn("Camera getUserMedia blocked or unavailable:", err);
    stopCameraScan();
    toast("Camera is blocked or unavailable. Please choose a photo from files.");
    fallbackInput?.click();
  }
}

function stopCameraScan() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const video = $("#camera-video");
  if (video) {
    video.srcObject = null;
  }
  const modal = $("#camera-modal");
  if (modal) modal.hidden = true;
  resetCameraReviewUI();
}

$("#camera-close")?.addEventListener("click", stopCameraScan);
$("#camera-backdrop")?.addEventListener("click", stopCameraScan);

// Freeze photo, resize to 512px, show "Use photo" and "Retake"
$("#camera-snap")?.addEventListener("click", () => {
  const video = $("#camera-video");
  if (!video) return;

  try {
    const resized512 = captureAndResizeCameraFrame(video, 512, 0.82);
    capturedPhoto512 = resized512;

    // Freeze video stream visually
    video.pause();
    video.hidden = true;

    // Show frozen preview
    const frozenImg = $("#camera-frozen-img");
    if (frozenImg) {
      frozenImg.src = resized512;
      frozenImg.hidden = false;
    }

    // Hide guide box during review
    const guide = $("#camera-guide");
    if (guide) guide.hidden = true;

    // Switch buttons to review mode
    const captureControls = $("#camera-capture-controls");
    if (captureControls) captureControls.hidden = true;
    const reviewControls = $("#camera-review-controls");
    if (reviewControls) reviewControls.hidden = false;
  } catch (err) {
    console.error("Failed to capture frame:", err);
    toast("Could not capture photo. Please try again.");
  }
});

// Retake photo: resume live camera preview
$("#camera-retake")?.addEventListener("click", () => {
  resetCameraReviewUI();
});

// Use photo: stop camera stream and fill Add item form with the 512px photo
$("#camera-use-photo")?.addEventListener("click", () => {
  if (!capturedPhoto512) return;
  const photoToUse = capturedPhoto512;
  const price = $("#camera-price")?.value;
  stopCameraScan();
  if (cameraPurpose === "buycheck") runBuyCheck(photoToUse, price);
  else handlePhotoSelected(photoToUse);
});

$("#camera-flip")?.addEventListener("click", () => {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  cameraFlipping = true;
  startCameraScan(cameraPurpose);
});

$("#camera-fallback-file")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const price = $("#camera-price")?.value;
  stopCameraScan();
  if (cameraPurpose === "buycheck") runBuyCheck(await resizeImage(file, 512, 0.82), price);
  else handlePhotoSelected(file);
});

$("#btn-camera-scan")?.addEventListener("click", () => {
  startCameraScan();
});

$("#btn-rescan")?.addEventListener("click", () => {
  startCameraScan();
});
