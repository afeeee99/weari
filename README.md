# Weari

A mobile-friendly wardrobe and clothing-swap app. Add your clothes, get outfit ideas
from a Gemini-powered stylist, plan your week, swap pieces with others and earn karma
for rewearing.

- **Front end:** plain HTML, CSS and JavaScript (`index.html`, `styles.css`, `app.js`,
  `stylist.js`, `swap-data.js`). Your wardrobe, outfits and settings stay in your browser.
- **Server:** `server.js` (Node + Express) serves the app and talks to Gemini, so the
  API key never reaches the browser.

## Run it on your computer

You need **Node.js 24** (LTS). Download it from https://nodejs.org, then check it in Terminal:

```
node -v
```

Install the app's add-ons once, then start it:

```
cd ~/weari-app
npm install
npm start
```

Open **http://localhost:8080** in your browser. Press `Ctrl + C` in Terminal to stop.

The app works without a Gemini key: auto-tag and outfit ideas then use basic rules.

## Add your Gemini key (stays on your computer)

1. Make your private settings file from the example:
   ```
   cp .env.example .env
   ```
2. Open it: `open -e .env`
3. Paste your key after `GEMINI_API_KEY=` (no spaces or quotes), save, and restart with `npm start`.

`.env` is listed in `.gitignore` and `.dockerignore`, so it is never committed or put in
the Cloud Run image. Never paste the key into the code, a chat or an issue.

### Test without using quota

Set `MOCK_GEMINI=true` in `.env` and restart. The server then returns realistic fake
answers, and the app labels them as test mode rather than Gemini.

## How the AI works

| Endpoint | The browser sends | The server replies |
|---|---|---|
| `POST /api/tag` | one photo, resized to 512px | `name`, `category`, `color`, `occasions` (from the app's lists) |
| `POST /api/style` | occasion, wardrobe as compact text (no photos), and only the onboarding goal, styles and occasions | outfit item ids from your wardrobe + a two-sentence explanation |
| `POST /api/review` | category, color and name of each piece in a "Create your own" look | a two-sentence review (one call, no fallback model) |
| `POST /api/chat` | your message, the last 4 messages, an optional photo (512px), wardrobe as compact text with wear counts, and only the onboarding goal, styles and occasions | `kind` (outfit, reference_match, purchase_check, chat), `reply` (max 3 sentences), `outfit_item_ids`, `missing_pieces`, `verdict` (skip, swap_first, buy) |

- One Gemini call per request. The model is set in `GEMINI_MODEL` at the top of `server.js`.
  Only exception: if that model answers 503 (busy), the server waits 2 seconds and tries
  `GEMINI_FALLBACK_MODEL` (the lighter `gemini-3.5-flash-lite`) once. Never on a 429 or any other error.
- Limits (top of `server.js`): `PER_VISITOR_DAILY_LIMIT` (15 per visitor per day) and
  `GLOBAL_DAILY_CAP` (whole app per day). They are kept in memory, so they reset at
  midnight UTC or when the server restarts.
- On any error, including Gemini's 429 "too many requests", the app falls back to basic
  rules and shows: *"The stylist needs a short break, so this is a basic suggestion."*
- The API always answers with JSON.
- Chat purchase checks start from the rules in `buying-brain.js` (similar pieces you own and how often you wear them), then Gemini makes the final call.

## Data saved in the browser

- IndexedDB database `weari`, store `items`: your clothes and photos
  (backup copy in localStorage `weari_items_backup`)
- localStorage: `weari-karma`, `weari-completed-swaps`, `weari-purchases-avoided`,
  `weari-swap-requests`, `weari_saved_outfits`, `weari_favorite_outfits`,
  `weari_weekly_plan`, `weari_plan_repeat_weekly`, `weari_onboarding_completed`,
  `weari_onboarding_answers`, `weari_user_profile`, `weari_profile_dismissed`,
  `weari_profile_first_name`, `weari_profile_email`, `weari_plus_waitlist`

**Settings → Reset app** clears all of these (in both dash and underscore spellings)
after a confirmation.

## Deploy to Google Cloud Run

The `Dockerfile` builds a Node 24 image that installs with `npm ci --omit=dev` and runs
`server.js` on port 8080 (Cloud Run's `PORT`). Store the key in Secret Manager rather
than in the image, for example:

```
gcloud secrets create gemini-api-key --data-file=-     # paste the key, then Ctrl+D
gcloud run deploy weari --source . --region europe-west1 \
  --allow-unauthenticated --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

## Files

- `index.html`, `styles.css`: page structure and look
- `app.js`: app behavior (wardrobe, add item, style me, swap, insights, karma, profile)
- `stylist.js`: basic-rules outfit picker, used when Gemini isn't available
- `swap-data.js`: sample swap listings (replace `getSwapListings()` with real data later)
- `server.js`: web server + Gemini endpoints
- `Dockerfile`, `.dockerignore`: Cloud Run image
- `.env.example`: template for your local `.env`
