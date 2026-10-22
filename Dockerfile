FROM php:8.3-cli
RUN docker-php-ext-install pdo pdo_mysql
WORKDIR /app
COPY . .
RUN printf "post_max_size=20M\nupload_max_filesize=20M\n" > /usr/local/etc/php/conf.d/uploads.ini
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080}"]
