# How Weari is put together

```
 Browser (index.html + src/)                     Weari server (server/)              Google
 ┌───────────────────────────────┐   /api/*     ┌──────────────────────┐          ┌────────┐
 │ features/*  ← screens         │ ───────────► │ routes/tag, style,   │ ───────► │ Gemini │
 │ core/kv.js  ← every save      │              │ review, chat,        │          └────────┘
 │ data/items-db.js (IndexedDB)  │ ◄─────────── │ buycheck, config     │
 │        │                      │   JSON       └──────────────────────┘
 │        ▼ (signed in only)     │
 │ firebase/sync.js ─────────────┼──────────────► Firebase: Auth · Firestore · Storage
 └───────────────────────────────┘
```

## The browser app (`src/`)

- **`main.js`** imports every screen, then starts the app. Each feature file wires up its
  own buttons when it loads, so adding a screen means adding a folder and one import.
- **`core/`** holds small shared helpers:
  - `router.js` switches screens (`#wardrobe`, `#style`…) so Back buttons work, and
    `refreshCurrentScreen()` re-draws after a sync.
  - `kv.js` wraps `localStorage`. Everything is saved through it, so the cloud sync sees every change.
  - `sheet.js` (pop-up panel), `dialog.js` (confirm box), `dom.js` (`$`, `toast`), `api.js`
    (calls the server), `images.js` (resizing), `format.js` (text helpers, `escapeHtml`),
    `constants.js` (categories, colors, occasions: keep in sync with `server/config.js`).
  - `platform.js` detects app WebViews.
- **`data/`** is the on-device wardrobe (IndexedDB). `saveItem` / `deleteItem` announce changes
  through `onItemsChange` (the sync listens). `migrate.js` imports data from older versions.
- **`features/<name>/`** holds one folder per area of the app. Files only talk to each other
  through `import`, never through global variables. For example `rewear/` (Sell, Swap, Donate,
  My Rewear), `friends/` (invite codes and borrowing), `swap/` (the swipe deck),
  `style/labels.js` (custom outfit labels) and `style/weekly-plan.js` (week and month views).
- **`core/collage.js`** draws the colored collage tiles used by the Closet, Favorites, Swap and Plan.
- **`firebase/`** is only downloaded when the server reports a Firebase config, so guests on a
  server without Firebase never load the Firebase code.
- **`styles/`** has `base.css` (shared look), `features/*.css` (one per screen),
  `layout.css` (phone / tablet / desktop) and `components.css` (accounts, dialogs, feed).

## Layout

| Width | Layout |
|---|---|
| under 640px (phones) | Top bar + bottom tab bar, 2-column grids, pop-ups slide up from the bottom |
| 640–899px (tablets) | Same menu, wider content, more columns |
| 900px and up (laptops) | Sidebar menu, content up to 1120px, pop-ups are centered dialogs |

Safe areas (notches, home bars), 16px inputs on phones (no iOS zoom), `prefers-reduced-motion`
and keyboard focus rings are handled in `layout.css`.

## The server (`server/`)

- `index.js`: Express app. In dev (`--dev`) it runs Vite inside the server for live reload;
  in production it serves the built `dist/` folder.
- `config.js`: every setting (models, limits, Firebase env vars) in one place.
- `gemini.js`: the single Gemini call + the 503 fallback.
- `rate-limit.js`: daily limits per visitor and for the whole app.
- `helpers.js`: reading the compact wardrobe text and always answering errors with JSON.
- `routes/*.js`: one endpoint each, with its prompt, response schema and a mock answer.

`shared/buying-brain.js` is used by both sides: the server uses it in prompts and mock mode,
and the browser uses it to re-check an edited Buying Brain result without another AI call.

## Adding a feature (checklist)

1. Create `src/features/<name>/<name>.js` (and `src/styles/features/<name>.css` if needed).
2. Add the screen's HTML to `index.html` as `<section id="screen-<name>" class="screen" hidden>`.
3. Import the JS in `src/main.js` and the CSS in `src/styles/index.css`.
4. If it is a new screen: add it to `SCREENS` and `renderScreen()` in `src/core/router.js`.
5. If it saves data that should follow the user: save it with `kv.setItem(...)` and add the
   key to `SYNCED_KEYS` in `src/firebase/sync.js`.
6. Anything typed by people goes through `escapeHtml()` before it is put into HTML.
