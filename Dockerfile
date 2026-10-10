# Stage 1: build the React client
FROM node:20-alpine AS client-build
WORKDIR /build/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: production server that also serves the built client
FROM node:20-alpine
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client-build /build/client/dist /app/client/dist
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
CMD ["node", "src/index.js"]
