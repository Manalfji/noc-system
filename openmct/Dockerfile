FROM nginx:alpine

# Install Node.js for build
RUN apk add --no-cache nodejs npm git

# Clone OpenMCT
WORKDIR /tmp/openmct
RUN git clone https://github.com/nasa/openmct.git . && \
    npm install && \
    npm run build

# Copy built files to nginx
RUN cp -r dist/* /usr/share/nginx/html/

# Add custom NOC plugin
COPY plugins/ /usr/share/nginx/html/plugins/
COPY config/ /usr/share/nginx/html/config/

# Nginx config for OpenMCT
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
