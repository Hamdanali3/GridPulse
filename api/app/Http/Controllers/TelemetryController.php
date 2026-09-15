<?php

namespace App\Http\Controllers;

use App\Http\Resources\TelemetryReadingResource;
use App\Models\Asset;
use App\Models\Site;
use App\Services\EnergyService;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TelemetryController extends Controller
{
    public function __construct(private readonly EnergyService $energy) {}

    public function fleetLive(): JsonResponse
    {
        $live = $this->energy->fleetLive();

        return ApiResponse::ok($live + ['capacity_kw' => (float) Site::sum('capacity_mw') * 1000]);
    }

    public function fleetSeries(Request $request): JsonResponse
    {
        $v = $request->validate([
            'minutes' => ['sometimes', 'integer', 'between:5,10080'],
            'bucket' => ['sometimes', 'integer', 'between:1,240'],
            'by' => ['sometimes', Rule::in(['fleet', 'type'])],
        ]);
        $minutes = (int) ($v['minutes'] ?? 60);
        $bucket = (int) ($v['bucket'] ?? 1);
        $from = now()->subMinutes($minutes);

        if (($v['by'] ?? 'fleet') === 'type') {
            return ApiResponse::ok($this->energy->seriesByType($from, $bucket));
        }

        return ApiResponse::ok($this->energy->series($from, $bucket));
    }

    public function siteSeries(Request $request, Site $site): JsonResponse
    {
        $v = $request->validate([
            'hours' => ['sometimes', 'integer', 'between:1,168'],
            'bucket' => ['sometimes', 'integer', 'between:1,240'],
        ]);
        $hours = (int) ($v['hours'] ?? 24);
        $bucket = (int) ($v['bucket'] ?? 15);

        return ApiResponse::ok($this->energy->series(now()->subHours($hours), $bucket, $site->id, true));
    }

    public function sparklines(Request $request): JsonResponse
    {
        $v = $request->validate([
            'hours' => ['sometimes', 'integer', 'between:1,168'],
            'bucket' => ['sometimes', 'integer', 'between:5,240'],
        ]);

        return ApiResponse::ok($this->energy->sparklines(now()->subHours((int) ($v['hours'] ?? 24)), (int) ($v['bucket'] ?? 60)));
    }

    public function assetLatest(Asset $asset): JsonResponse
    {
        $reading = $asset->readings()->latest('recorded_at')->first();

        return ApiResponse::ok($reading ? new TelemetryReadingResource($reading) : null);
    }

    public function energy(Request $request): JsonResponse
    {
        $v = $request->validate([
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date'],
            'group_by' => ['sometimes', Rule::in(['site', 'type', 'day'])],
        ]);
        $to = isset($v['to']) ? \Carbon\Carbon::parse($v['to']) : now();
        $from = isset($v['from']) ? \Carbon\Carbon::parse($v['from']) : $to->copy()->subDays(7);
        $groupBy = $v['group_by'] ?? 'site';

        $rows = $this->energy->energy($from, $to, $groupBy);

        if ($groupBy === 'site') {
            $sites = Site::whereIn('id', array_column($rows, 'key'))->get()->keyBy('id');
            $rows = array_map(fn ($r) => [
                'key' => $r['key'],
                'label' => $sites->get((int) $r['key'])?->name ?? 'Unknown',
                'code' => $sites->get((int) $r['key'])?->code,
                'type' => $sites->get((int) $r['key'])?->type,
                'kwh' => $r['kwh'],
            ], $rows);
        } else {
            $rows = array_map(fn ($r) => ['key' => $r['key'], 'label' => $r['key'], 'kwh' => $r['kwh']], $rows);
        }

        return ApiResponse::ok($rows);
    }
}
