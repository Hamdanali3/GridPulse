<?php

use Illuminate\Support\Facades\Schedule;

// Run with: php artisan schedule:work
// Sub-minute frequency keeps the dashboard moving; prune keeps the table bounded.
Schedule::command('gridpulse:tick')->everyFiveSeconds()->withoutOverlapping();
Schedule::command('gridpulse:prune')->dailyAt('03:00');
