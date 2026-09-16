<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'up'],

    'allowed_methods' => ['*'],

    // CLIENT_ORIGIN is a comma-separated list. Entries containing "*" become patterns, so
    // "https://*.vercel.app" allows every Vercel preview deployment of the client.
    'allowed_origins' => array_values(array_filter(
        array_map('trim', explode(',', (string) env('CLIENT_ORIGIN', 'http://localhost:3000,http://localhost:5173'))),
        fn (string $origin) => $origin !== '' && ! str_contains($origin, '*'),
    )),

    'allowed_origins_patterns' => array_values(array_map(
        fn (string $origin) => '#^'.str_replace('\\*', '.*', preg_quote($origin, '#')).'$#i',
        array_filter(
            array_map('trim', explode(',', (string) env('CLIENT_ORIGIN', ''))),
            fn (string $origin) => str_contains($origin, '*'),
        ),
    )),

    'allowed_headers' => ['*'],

    'exposed_headers' => ['Content-Disposition'],

    'max_age' => 0,

    'supports_credentials' => false,

];
