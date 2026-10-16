FROM node:20.18-alpine AS build
RUN apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev git
WORKDIR /opt/app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM node:20.18-alpine
RUN apk add --no-cache vips-dev
WORKDIR /opt/app
ENV NODE_ENV=production
COPY --from=build /opt/app ./
RUN chown -R node:node /opt/app
USER node
EXPOSE 1337
CMD ["npm", "run", "start"]
