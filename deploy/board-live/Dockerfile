FROM livekit/livekit-server:v1.13.11 AS livekit
FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=livekit /livekit-server /livekit-server
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY supervisor.mjs ./
USER node
EXPOSE 7880 7881 7882/udp 3478/udp
CMD ["node", "supervisor.mjs"]
