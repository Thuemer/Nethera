FROM nginx:1.27-alpine

COPY Applikation/*.html Applikation/*.css Applikation/*.js Applikation/*.png /usr/share/nginx/html/
COPY Applikation/vendor/ /usr/share/nginx/html/vendor/
COPY Website/html/*.html /usr/share/nginx/html/website/html/
COPY Website/css/*.css /usr/share/nginx/html/website/css/
COPY Website/js/*.js /usr/share/nginx/html/website/js/
COPY Website/images/ /usr/share/nginx/html/website/images/
COPY Applikation/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
