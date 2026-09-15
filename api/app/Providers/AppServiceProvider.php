<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Credential endpoints: 20 attempts per 15 minutes per IP (brute-force protection).
        RateLimiter::for('auth', fn (Request $request) => Limit::perMinutes(15, 20)->by($request->ip()));

        // Everything else: generous per-user budget; the dashboard polls several endpoints every 5 s.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(600)->by($request->user()?->id ?: $request->ip()));
    }
}
