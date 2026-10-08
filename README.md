# Weari

A simple, mobile-friendly wardrobe app. Plain HTML/CSS/JavaScript, no install needed.
Data (items + photos) is saved in your browser.

## Run on your computer
```
cd ~/Weari
python3 -m http.server 8080
```
Then open http://localhost:8080 in your browser. Press Ctrl+C in the terminal to stop.

## Files
- `index.html` – the page structure (both screens)
- `styles.css` – the look
- `app.js` – the behavior (adding items, saving, showing the grid)
- `Dockerfile` + `nginx.conf` – used later to deploy to Google Cloud Run
