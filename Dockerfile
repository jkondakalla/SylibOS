FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_JKOS_AUTH_URL=https://auth.jkos.net
ARG VITE_APP_ORIGIN=https://sylibos.jkos.net
ENV VITE_JKOS_AUTH_URL=$VITE_JKOS_AUTH_URL
ENV VITE_APP_ORIGIN=$VITE_APP_ORIGIN
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# SPA fallback: serve index.html for all routes
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
