<?php

namespace App\Console\Commands;

use App\Models\Site;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * One-shot start-up step for containers: wait for the database, run migrations and,
 * when asked, seed the demo fleet if the database is still empty. Idempotent, so it is
 * safe to run on every boot.
 */
class GridpulseBootstrap extends Command
{
    protected $signature = 'gridpulse:bootstrap
                            {--seed : Seed the Chitral demo fleet when there are no sites yet}
                            {--wait=60 : Seconds to wait for the database before giving up}';

    protected $description = 'Wait for the database, migrate, and seed demo data on an empty database';

    public function handle(): int
    {
        if (! $this->waitForDatabase((int) $this->option('wait'))) {
            $this->error('Database not reachable. Check DB_URL / DB_* variables.');

            return self::FAILURE;
        }

        $this->call('migrate', ['--force' => true, '--no-interaction' => true]);

        if ($this->option('seed')) {
            if (Site::query()->count() === 0) {
                $this->info('Empty database — seeding the demo fleet.');
                $this->call('db:seed', ['--force' => true, '--no-interaction' => true]);
            } else {
                $this->line('Sites already present, skipping seed.');
            }
        }

        $this->info(sprintf('Ready: %s, %d sites.', config('database.default'), Site::query()->count()));

        return self::SUCCESS;
    }

    private function waitForDatabase(int $seconds): bool
    {
        $deadline = time() + max(1, $seconds);
        $attempt = 0;

        while (true) {
            try {
                DB::connection()->getPdo();

                return true;
            } catch (Throwable $e) {
                if (time() >= $deadline) {
                    $this->error($e->getMessage());

                    return false;
                }
                $attempt++;
                $this->line("Waiting for database ({$attempt})…");
                sleep(2);
            }
        }
    }
}
