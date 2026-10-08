# Recipe for Google Cloud Run: a tiny web server (nginx) that serves the app files.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css stylist.js swap-data.js app.js /usr/share/nginx/html/
EXPOSE 8080
