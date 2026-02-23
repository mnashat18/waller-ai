# Build stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build -- --configuration production

# Production stage
FROM nginx:alpine

# امسح أي حاجة قديمة
RUN rm -rf /usr/share/nginx/html/*

# انسخ ناتج Angular الصح
COPY --from=build /app/dist/wellar-ui/ /usr/share/nginx/html/

# 🔎 اطبع محتويات الفولدر عشان نتأكد في اللوجز
RUN echo "=== HTML CONTENT ===" && ls -la /usr/share/nginx/html/ && \
    echo "=== CHECK INDEX ===" && cat /usr/share/nginx/html/index.html | head -n 5

# nginx config نظيف
RUN printf "server {\n\
  listen 80;\n\
  server_name _;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files \$uri \$uri/ /index.html;\n\
  }\n\
}\n" > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
