FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js db.js ai.js jkos-auth.js ./

EXPOSE 8004
CMD ["node", "index.js"]
