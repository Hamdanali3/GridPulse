<?php
require __DIR__ . '/../api/vendor/autoload.php';
$app = require_once __DIR__ . '/../api/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$sql = file_get_contents($argv[1]);
echo "Executing SQL from " . $argv[1] . " (" . strlen($sql) . " bytes)...\n";
Illuminate\Support\Facades\DB::unprepared($sql);
echo "SUCCESS!\n";
