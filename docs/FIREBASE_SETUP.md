# Firebase setup

Firebase gives Weari three things: **sign-in** (Google or email), **cloud sync** of each
person's wardrobe, and the **community swap feed**. Without it the app still works,
saving everything on the device.

## 1. Create the project

1. Go to https://console.firebase.google.com → **Add project** (Google Analytics is optional).
2. **Project settings** (gear icon) → **General** → **Your apps** → click the **Web** icon `</>`.
   Give it a name (e.g. "Weari web"). You don't need Firebase Hosting.
3. Copy the values from the `firebaseConfig` it shows into `.env`:

   | `firebaseConfig` | `.env` |
   |---|---|
   | `apiKey` | `FIREBASE_API_KEY` |
   | `authDomain` | `FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `FIREBASE_PROJECT_ID` |
   | `storageBucket` | `FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `FIREBASE_APP_ID` |
   | `measurementId` (if shown) | `FIREBASE_MEASUREMENT_ID` |

These values identify your project; they are not passwords. Access is protected by the
security rules in step 4. A service-account key file is **not** needed: never put one in
this project.

## 2. Turn on sign-in

**Build → Authentication → Get started → Sign-in method**:

- **Google** → Enable → choose a support email → Save.
- **Email/Password** → Enable → Save.

**Authentication → Settings → Authorized domains**: `localhost` is there already. Add your
Cloud Run address after deploying (e.g. `weari-abc123-ew.a.run.app`) and any custom domain.

## 3. Create the database and photo storage

- **Build → Firestore Database → Create database** → pick a location close to your users →
  start in **production mode** (the rules below open exactly what the app needs).
- **Build → Storage → Get started** (same location).
  New projects need the **Blaze (pay-as-you-go)** plan for Storage. It has a free monthly
  allowance, and you can set a budget alert. If you stay on the free **Spark** plan, leave
  `FIREBASE_STORAGE_BUCKET` empty: photos are then saved inside Firestore as smaller copies,
  and everything else works the same.

## 4. Publish the security rules

The rules live in this repo (`firebase/firestore.rules`, `firebase/storage.rules`). Publish them
with the Firebase CLI (no install needed, `npx` downloads it):

```
npx firebase-tools login
npx firebase-tools use --add          # pick your project
npx firebase-tools deploy --only firestore:rules,storage
```

Or paste each file's contents into Firebase Console → Firestore → **Rules** and
Storage → **Rules**, then **Publish**.

## 5. Check it works

`npm run dev`, open http://localhost:8080. The server log says `Firebase project: <your id>`,
the top bar shows **Sign in**, and Profile shows the account card. Sign in, add an item, then
open the app in another browser and sign in with the same account: the item appears there too.

## What is stored where

```
users/{uid}                      { displayName, lastSeenAt }  — shown to swap partners
users/{uid}/items/{itemId}       one wardrobe item (photo = Storage URL)
users/{uid}/state/{key}          { value, updatedAt } — outfits, favorites, plan, karma, settings
listings/{uid}_{itemId}          public: true  — an item marked "Available to swap" (all signed-in members can see it)
listings/{uid}_{shareKey}        sharedWithFriends: true — a piece shared from My Rewear (only accepted friends)
swapRequests/{id}                { fromUid, toUid, listing, offered, status } — community swaps, only the two members
inviteCodes/{code}               { uid, displayName, photoURL } — lets a friend find you by your 6-letter code
friendships/{uidA_uidB}          { members, status, requestedBy, profiles } — pending until the other person accepts
requests/{id}                    { ownerUid, requesterUid, type: borrow | swap, status, messages } — between friends
Storage: users/{uid}/photos/{hash}.jpg
```

| Who | Can |
|---|---|
| The owner | read and write everything under their own `users/{uid}` and photos |
| Any signed-in member | browse public `listings`, view listing photos, look up an invite code they know |
| Accepted friends | see each other's friends-only listings and send borrow/swap requests |
| The two members in a swap or request | see it and (for friends) message each other. The owner accepts or declines |

## How sync behaves

- The app always saves on the device first, so it stays fast and works offline. Changes
  are uploaded in the background and retried when the connection returns.
- Changes made on another device appear live.
- The first time a device signs in, its guest data is **added** to the account (karma takes
  the higher score, outfit lists are combined).
- **Sign out** clears the device; the data stays in the account.
- **Reset app** while signed in deletes the cloud copy too (after a confirmation).

Code: `src/firebase/sync.js` (wardrobe + settings), `src/firebase/community.js` (swap feed),
`src/firebase/photos.js` (photo uploads), `src/features/account/account.js` (sign-in UI).
