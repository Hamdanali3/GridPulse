# GridPulse API — PHP 8.3 CLI image running the Laravel server and the telemetry scheduler.
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

FROM php:8.3-cli-alpine
RUN apk add --no-cache icu-dev libzip-dev oniguruma-dev bash \
    && docker-php-ext-install pdo_mysql intl bcmath opcache
WORKDIR /app
COPY --from=vendor /app/vendor ./vendor
COPY . .
RUN composer_dump() { php -r "copy('https://getcomposer.org/installer','/tmp/c.php');" && php /tmp/c.php --install-dir=/usr/local/bin --filename=composer --quiet; }; composer_dump \
    && composer dump-autoload --optimize --no-dev \
    && chmod +x docker/entrypoint.sh \
    && chown -R www-data:www-data storage bootstrap/cache
EXPOSE 8000
ENTRYPOINT ["bash", "docker/entrypoint.sh"]
