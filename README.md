# Weari

A wardrobe and clothing-swap web app. Add your clothes, get outfit ideas from a
Gemini-powered stylist, plan your week, swap pieces with other people and earn karma
for rewearing. Works on phones, tablets and laptops, and is ready to be wrapped as a
mobile app (WebView).

- **Guest mode:** everything works straight away and is saved on the device.
- **Signed in (Firebase):** the wardrobe syncs to the user's account on every device,
  and the Swap feed shows real listings from other members.

## Run it on your computer

You need **Node.js 24** or newer (https://nodejs.org). Check it in Terminal with `node -v`.

```
cd weari
npm install          # once, installs the add-ons
cp .env.example .env # once, then fill in .env (see below)
npm run dev          # start the app with live reload
```

Open **http://localhost:8080**. Edits to files in `src/` show up in the browser straight away.
Press `Ctrl + C` in Terminal to stop.

The app also works with an empty `.env`: the stylist then uses basic rules, and sign-in is
switched off (on-device mode).

| Command | What it does |
|---|---|
| `npm run dev` | Start for development (live reload) |
| `npm run build` | Build the finished app into `dist/` |
| `npm start` | Run the built app (what Cloud Run does) |
| `npm run preview` | Build, then run it, to check the real thing locally |

## Settings (`.env`)

`.env` is ignored by git and Docker, so its values are never uploaded. Never paste keys into
the code, a chat or an issue.

| Setting | What it is |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key for the stylist. Stays on the server. |
| `MOCK_GEMINI=true` | Fake AI answers for testing, no quota used (labelled "test mode" in the app) |
| `FIREBASE_*` | Your Firebase web app config. Turns on sign-in, sync and the community feed. See [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md). |

## Folder structure

```
weari/
├── index.html            The page layout (all screens and pop-ups)
├── src/                  The browser app
│   ├── main.js           Starts the app
│   ├── core/             Shared helpers: storage, screens, pop-ups, dialogs, API calls
│   ├── data/             The on-device wardrobe database (IndexedDB)
│   ├── features/         One folder per part of the app
│   │   ├── wardrobe/  add-item/  camera/  buying-brain/
│   │   ├── style/        Chat, AI stylist, Create your own, favorites, weekly plan
│   │   ├── swap/         Community swap feed + sample listings
│   │   ├── insights/  karma/  onboarding/  profile/  settings/  demo/
│   │   └── account/      Sign-in and the account card
│   ├── firebase/         Everything that talks to Firebase (auth, sync, photos, community)
│   └── styles/           CSS: base, one file per screen, responsive layout
├── shared/               Code used by both the browser and the server (Buying Brain rules)
├── server/               Node + Express server: serves the app, talks to Gemini
│   └── routes/           One file per AI feature (tag, style, review, chat, buycheck)
├── firebase/             Firestore + Storage security rules
├── public/               Icons and the web-app manifest
└── docs/                 Guides: architecture, Firebase setup, mobile app
```

More detail on how the pieces fit together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## How the AI works

The browser never sees the Gemini key. It calls the Weari server, which calls Gemini:

| Endpoint | The browser sends | The server replies |
|---|---|---|
| `POST /api/tag` | one photo, resized to 512px | `name`, `category`, `color`, `occasions` |
| `POST /api/style` | occasion, wardrobe as compact text (no photos), onboarding goal/styles/occasions | outfit item ids + a two-sentence explanation |
| `POST /api/review` | category, color and name of each piece in a "Create your own" look | a two-sentence review |
| `POST /api/chat` | message, last 4 messages, optional photo, wardrobe text with wear counts | `kind`, `reply`, `outfit_item_ids`, `missing_pieces`, `verdict` |
| `POST /api/buycheck` | one photo, optional price, wardrobe text | `verdict`, `reason`, similar and pairing item ids |
| `GET /api/config` | – | the Firebase web config (or `null` = on-device mode) |

- One Gemini call per request. The model is set in `GEMINI_MODEL` in `server/config.js`. Only
  if it answers 503 (busy) does the server wait 2 s and try `GEMINI_FALLBACK_MODEL` once.
- Daily limits in `server/config.js`: `PER_VISITOR_DAILY_LIMIT` (40) and `GLOBAL_DAILY_CAP` (600).
  They reset at midnight UTC or when the server restarts.
- On any error the app falls back to basic rules (`src/features/style/basic-stylist.js`).

## Data

- **On the device:** IndexedDB database `weari` (clothes and photos) and `localStorage` keys
  starting with `weari` (outfits, plan, karma, settings). **Profile → Reset app** clears them.
- **In Firebase (signed in):** `users/{uid}/items`, `users/{uid}/state`, community `listings`
  and `swapRequests`, photos in Storage. Details in [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).

## Deploy to Google Cloud Run

The `Dockerfile` builds the app and runs `server/index.js` on port 8080. Keep the Gemini key
in Secret Manager, and pass the Firebase values as normal environment variables:

```
gcloud secrets create gemini-api-key --data-file=-     # paste the key, then Ctrl+D
gcloud run deploy weari --source . --region europe-west1 --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars FIREBASE_API_KEY=...,FIREBASE_AUTH_DOMAIN=...,FIREBASE_PROJECT_ID=...,FIREBASE_STORAGE_BUCKET=...,FIREBASE_MESSAGING_SENDER_ID=...,FIREBASE_APP_ID=...
```

After the first deploy, add the Cloud Run address (e.g. `weari-xxxx.run.app`) under
Firebase Console → Authentication → Settings → **Authorized domains**, or Google sign-in
will be refused there.

## Mobile app

The web app is built to run inside an Android/iOS WebView. See [docs/MOBILE_WEBVIEW.md](docs/MOBILE_WEBVIEW.md).
