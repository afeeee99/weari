import { defineConfig } from "vite";

// Vite bundles the browser app (index.html + src/) into dist/.
// server/index.js serves dist/ in production and runs Vite itself in dev mode.
export default defineConfig({
  publicDir: "public", // copied as-is: manifest, icons
  build: {
    outDir: "dist",
    target: "es2022",
    chunkSizeWarningLimit: 900, // the Firebase SDK is one big (lazy-loaded) chunk
  },
});
