FROM nginx:alpine

# Copy static files
COPY index.html /usr/share/nginx/html/
COPY config/ /usr/share/nginx/html/config/
COPY plugins/ /usr/share/nginx/html/plugins/

# Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
