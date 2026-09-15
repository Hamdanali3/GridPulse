<?php

use App\Http\Controllers\AlertController;
use App\Http\Controllers\AssetController;
use App\Http\Controllers\AuditController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SiteController;
use App\Http\Controllers\TelemetryController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\WorkOrderController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| GridPulse API v1
|--------------------------------------------------------------------------
| Contract: docs/API_ROUTES.md. Every route past /auth needs a Sanctum token;
| write routes additionally need the role listed in the contract.
*/

Route::prefix('v1')->group(function () {
    Route::get('/health', HealthController::class);

    Route::prefix('auth')->group(function () {
        Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:auth');
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth');

        Route::middleware(['auth:sanctum', 'active'])->group(function () {
            Route::post('/logout', [AuthController::class, 'logout']);
            Route::get('/me', [AuthController::class, 'me']);
            Route::patch('/me', [AuthController::class, 'updateMe']);
            Route::patch('/me/password', [AuthController::class, 'changePassword']);
        });
    });

    Route::middleware(['auth:sanctum', 'active', 'throttle:api'])->group(function () {
        $operators = 'role:admin,engineer';
        $admin = 'role:admin';

        // Users (admin only)
        Route::middleware($admin)->group(function () {
            Route::get('/users', [UserController::class, 'index']);
            Route::patch('/users/{user}', [UserController::class, 'update']);
            Route::delete('/users/{user}', [UserController::class, 'destroy']);
            Route::get('/audit', [AuditController::class, 'index']);
        });

        // Sites
        Route::get('/sites', [SiteController::class, 'index']);
        Route::post('/sites', [SiteController::class, 'store'])->middleware($operators);
        Route::get('/sites/{site}', [SiteController::class, 'show']);
        Route::get('/sites/{site}/summary', [SiteController::class, 'summary']);
        Route::patch('/sites/{site}', [SiteController::class, 'update'])->middleware($operators);
        Route::delete('/sites/{site}', [SiteController::class, 'destroy'])->middleware($admin);

        // Assets
        Route::get('/assets', [AssetController::class, 'index']);
        Route::post('/assets', [AssetController::class, 'store'])->middleware($operators);
        Route::get('/assets/{asset}', [AssetController::class, 'show']);
        Route::patch('/assets/{asset}', [AssetController::class, 'update'])->middleware($operators);
        Route::delete('/assets/{asset}', [AssetController::class, 'destroy'])->middleware($admin);

        // Telemetry (read only; written by the simulator)
        Route::prefix('telemetry')->group(function () {
            Route::get('/fleet/live', [TelemetryController::class, 'fleetLive']);
            Route::get('/fleet/series', [TelemetryController::class, 'fleetSeries']);
            Route::get('/sites/sparklines', [TelemetryController::class, 'sparklines']);
            Route::get('/sites/{site}/series', [TelemetryController::class, 'siteSeries']);
            Route::get('/assets/{asset}/latest', [TelemetryController::class, 'assetLatest']);
            Route::get('/energy', [TelemetryController::class, 'energy']);
        });

        // Alerts
        Route::get('/alerts', [AlertController::class, 'index']);
        Route::get('/alerts/{alert}', [AlertController::class, 'show']);
        Route::post('/alerts/{alert}/acknowledge', [AlertController::class, 'acknowledge'])->middleware($operators);
        Route::post('/alerts/{alert}/resolve', [AlertController::class, 'resolve'])->middleware($operators);
        Route::post('/alerts/{alert}/work-order', [AlertController::class, 'toWorkOrder'])->middleware($operators);

        // Work orders
        Route::get('/work-orders', [WorkOrderController::class, 'index']);
        Route::post('/work-orders', [WorkOrderController::class, 'store'])->middleware($operators);
        Route::get('/work-orders/{work_order}', [WorkOrderController::class, 'show']);
        Route::patch('/work-orders/{work_order}', [WorkOrderController::class, 'update'])->middleware($operators);
        Route::delete('/work-orders/{work_order}', [WorkOrderController::class, 'destroy'])->middleware($admin);

        // Dashboard and reports
        Route::get('/dashboard/overview', [DashboardController::class, 'overview']);
        Route::get('/reports/energy.csv', [ReportController::class, 'energyCsv']);
    });
});
