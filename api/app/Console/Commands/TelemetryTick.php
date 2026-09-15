<?php

namespace App\Console\Commands;

use App\Services\TelemetrySimulator;
use Illuminate\Console\Command;

class TelemetryTick extends Command
{
    protected $signature = 'gridpulse:tick {--loop : Keep ticking every 5 seconds until stopped}';

    protected $description = 'Generate one telemetry reading per asset and evaluate alert rules';

    public function handle(TelemetrySimulator $simulator): int
    {
        do {
            $result = $simulator->tick();
            $this->line(sprintf('[%s] %d readings, %d new alerts', now()->format('H:i:s'), $result['inserted'], $result['alerts']));
            if ($this->option('loop')) {
                sleep(5);
            }
        } while ($this->option('loop'));

        return self::SUCCESS;
    }
}
