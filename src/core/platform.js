// =====================================================
// Where is the app running? (browser, installed web app, or inside a
// native mobile app's WebView). Adds classes to <html> so CSS can adapt:
//   .is-standalone  installed to the home screen / opened by a native app
//   .is-webview     embedded in an Android or iOS app WebView
// =====================================================
const ua = navigator.userAgent || "";

export const isAndroidWebView = /; wv\)/.test(ua) || /\bVersion\/[\d.]+ Chrome\/[\d.]+ Mobile/.test(ua);
export const isIOSWebView = /(iPhone|iPad|iPod).*AppleWebKit(?!.*Safari)/i.test(ua);
export const isEmbeddedWebView = isAndroidWebView || isIOSWebView || new URLSearchParams(location.search).has("app");
export const isStandalone = isEmbeddedWebView || window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

// A native app can provide Google sign-in itself (Google blocks its web sign-in page in WebViews)
export const nativeBridge = () => window.WeariNative || null;

document.documentElement.classList.toggle("is-webview", isEmbeddedWebView);
document.documentElement.classList.toggle("is-standalone", Boolean(isStandalone));
