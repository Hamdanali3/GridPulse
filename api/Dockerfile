# GridPulse API — single production image for Railway / Render / Fly / any Docker host.
# Runs migrations (+ demo seed on an empty database), the telemetry scheduler and the HTTP
# server in one container. Listens on $PORT (Railway injects it), default 8000.
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

FROM php:8.4-cli-alpine
RUN apk add --no-cache icu-dev libzip-dev oniguruma-dev postgresql-dev bash \
    && docker-php-ext-install pdo_mysql pdo_pgsql intl bcmath opcache \
    && printf 'opcache.enable_cli=1\nopcache.memory_consumption=128\nopcache.validate_timestamps=0\n' \
       > /usr/local/etc/php/conf.d/zz-opcache.ini \
    && printf 'memory_limit=256M\nupload_max_filesize=8M\npost_max_size=8M\n' \
       > /usr/local/etc/php/conf.d/zz-limits.ini
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
WORKDIR /app
COPY --from=vendor /app/vendor ./vendor
COPY . .
RUN composer dump-autoload --optimize --no-dev --classmap-authoritative \
    && chmod +x docker/entrypoint.sh \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views \
                storage/logs bootstrap/cache database \
    && chown -R www-data:www-data storage bootstrap/cache database

ENV PORT=8000 \
    APP_NAME=GridPulse \
    PHP_CLI_SERVER_WORKERS=8 \
    APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    CACHE_STORE=file \
    SESSION_DRIVER=file \
    QUEUE_CONNECTION=sync \
    SEED_DEMO=true
EXPOSE 8000
ENTRYPOINT ["bash", "docker/entrypoint.sh"]
