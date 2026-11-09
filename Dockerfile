FROM php:8.3-cli
RUN docker-php-ext-install pdo pdo_mysql
WORKDIR /app
COPY . .
RUN printf "post_max_size=20M\nupload_max_filesize=20M\n" > /usr/local/etc/php/conf.d/uploads.ini
# If a Railway Volume is mounted and UPLOAD_DIR points to it (e.g. /data/uploads),
# uploads (avatars, valid IDs, accommodation photos) are stored there so they
# survive redeploys. Without UPLOAD_DIR the app works as before.
CMD ["sh", "-c", "if [ -n \"$UPLOAD_DIR\" ]; then mkdir -p \"$UPLOAD_DIR/avatars\" \"$UPLOAD_DIR/valid_ids\" \"$UPLOAD_DIR/accommodations\" && cp -rn /app/assets/uploads/. \"$UPLOAD_DIR/\" 2>/dev/null; rm -rf /app/assets/uploads && ln -s \"$UPLOAD_DIR\" /app/assets/uploads; fi; php -S 0.0.0.0:${PORT:-8080} /app/router.php"]
