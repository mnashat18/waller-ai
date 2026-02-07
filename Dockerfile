# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build -- --configuration development

# Production stage
FROM nginx:alpine

# امسح الكونفيج الافتراضي
RUN rm /etc/nginx/conf.d/default.conf

# انسخ الكونفيج بتاعنا
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ⬅️⬅️⬅️ أهم سطر في القصة كلها
COPY --from=build /app/dist/wellar-ui/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
