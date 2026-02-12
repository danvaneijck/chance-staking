# Stage 1: Build
FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++ linux-headers eudev-dev libusb-dev

WORKDIR /app

# Copy package files and .npmrc for better CI stability
COPY package.json package-lock.json .npmrc* ./

# Install dependencies - using npm install with legacy-peer-deps for compatibility
# Note: package-lock.json has peer dependency issues, so we use install instead of ci
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
