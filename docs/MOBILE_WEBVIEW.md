# Running Weari inside a mobile app (WebView)

The web app is ready to be wrapped in a native Android or iOS shell (a WebView, or tools
like Capacitor). Point the WebView at your deployed URL, e.g. `https://weari-xxxx.run.app/?app=1`
(`?app=1` tells the app it is inside a native shell).

## Already handled by the web app

- Full-screen layout with safe areas for notches and home bars (`viewport-fit=cover`)
- No page zoom when typing, no double-tap zoom, no rubber-band scrolling of the whole page
- In-app confirm dialogs (WebViews often block `window.confirm`)
- Android back button / swipe-back: every screen has its own address (`#wardrobe`, `#swap`…)
- Works offline after the first load; sync catches up when the connection returns
- App icon and name in `public/manifest.webmanifest` (also used for "Add to Home Screen")

## Settings the native shell needs

**Android (WebView)**
- `settings.javaScriptEnabled = true`, `settings.domStorageEnabled = true` (localStorage / IndexedDB)
- Camera: declare `android.permission.CAMERA`, and in `WebChromeClient.onPermissionRequest`
  grant `RESOURCE_VIDEO_CAPTURE`. Implement `onShowFileChooser` so "Upload photo" works.
- Back button: `if (webView.canGoBack()) webView.goBack() else finish()`

**iOS (WKWebView)**
- `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` in Info.plist
- `configuration.allowsInlineMediaPlayback = true` (live camera preview)

## Google sign-in inside an app

Google blocks its sign-in page inside embedded WebViews ("disallowed_useragent").
Email/password sign-in works everywhere. For Google, do the sign-in natively and hand the
result to the page:

1. Use the native Google Sign-In SDK (Android Credential Manager / GoogleSignIn for iOS) with
   the **Web client ID** from Firebase Console → Authentication → Sign-in method → Google.
2. Expose a bridge object named `WeariNative` with a `googleSignIn()` method. The app's
   "Continue with Google" button calls it.
3. When the native sign-in finishes, run this JavaScript in the WebView:

   ```js
   window.weari.signInWithGoogleIdToken("<the Google ID token>");
   ```

The app then signs in to Firebase with that token, and sync starts as usual.
`window.weari.signOut()` is also available for a native "Sign out" button.
