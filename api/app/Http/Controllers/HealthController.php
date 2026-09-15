<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('select 1');
            $db = 'connected';
        } catch (Throwable) {
            $db = 'unreachable';
        }

        return response()->json([
            'status' => $db === 'connected' ? 'ok' : 'degraded',
            'app' => config('app.name'),
            'env' => config('app.env'),
            'db' => $db,
            'driver' => config('database.default'),
            'time' => now()->toISOString(),
        ], $db === 'connected' ? 200 : 503);
    }
}
