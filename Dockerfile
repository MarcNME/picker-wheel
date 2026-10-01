FROM nginxinc/nginx-unprivileged:stable-alpine

USER root
RUN printf '%s\n' \
	'server {' \
	'    listen 8080;' \
	'    listen [::]:8080;' \
	'    server_name _;' \
	'    server_tokens off;' \
	'    root /usr/share/nginx/html;' \
	'    index index.html;' \
	'    add_header X-Content-Type-Options "nosniff" always;' \
	'    add_header X-Frame-Options "DENY" always;' \
	'    add_header Referrer-Policy "strict-origin-when-cross-origin" always;' \
	'    location / { try_files $uri $uri/ =404; }' \
	'    location ~ /\. { deny all; }' \
	'}' > /etc/nginx/conf.d/default.conf

COPY --chown=nginx:nginx index.html script.js styles.css favicon.svg /usr/share/nginx/html/

USER nginx
EXPOSE 8080
