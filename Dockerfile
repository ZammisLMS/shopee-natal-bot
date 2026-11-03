FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src
COPY config ./config
COPY panel ./panel
RUN mkdir -p /app/runtime && chown -R node:node /app/runtime
USER node
EXPOSE 8787
CMD ["node", "src/index.js"]
