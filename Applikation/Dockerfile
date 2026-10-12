FROM nginx:1.27-alpine

COPY Applikation/*.html Applikation/*.css Applikation/*.js Applikation/*.png /usr/share/nginx/html/
COPY Website/html/*.html /usr/share/nginx/html/website/html/
COPY Website/css/nethera.css Website/css/palette.css /usr/share/nginx/html/website/css/
COPY Website/js/nethera.js /usr/share/nginx/html/website/js/nethera.js
COPY Website/images/ /usr/share/nginx/html/website/images/
COPY Applikation/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
