# Build stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build -- --configuration production

# Production stage
FROM nginx:alpine

# امسح أي config قديم
RUN rm -rf /usr/share/nginx/html/*

# انسخ ملفات Angular
COPY --from=build /app/dist/wellar-ui/browser /usr/share/nginx/html

# nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
