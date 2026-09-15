<?php

namespace App\Console\Commands;

use App\Models\TelemetryReading;
use Illuminate\Console\Command;

class TelemetryPrune extends Command
{
    protected $signature = 'gridpulse:prune {--days=7 : Keep this many days of readings}';

    protected $description = 'Delete telemetry readings older than the retention window';

    public function handle(): int
    {
        $cutoff = now()->subDays((int) $this->option('days'));
        $deleted = 0;
        do {
            $batch = TelemetryReading::where('recorded_at', '<', $cutoff)->limit(5000)->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Pruned {$deleted} readings older than {$cutoff->toDateTimeString()}.");

        return self::SUCCESS;
    }
}
