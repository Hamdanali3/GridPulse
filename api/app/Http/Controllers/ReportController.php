<?php

namespace App\Http\Controllers;

use App\Models\Site;
use App\Services\EnergyService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function __construct(private readonly EnergyService $energy) {}

    /** Daily energy per site as a CSV download. */
    public function energyCsv(Request $request): StreamedResponse
    {
        $v = $request->validate(['from' => ['sometimes', 'date'], 'to' => ['sometimes', 'date']]);
        $to = isset($v['to']) ? Carbon::parse($v['to']) : now();
        $from = isset($v['from']) ? Carbon::parse($v['from']) : $to->copy()->subDays(7);

        $rows = $this->energy->energy($from, $to, 'site_day');
        $sites = Site::query()->get()->keyBy('id');
        $filename = sprintf('gridpulse-energy-%s-to-%s.csv', $from->toDateString(), $to->toDateString());

        return response()->streamDownload(function () use ($rows, $sites) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['date', 'site_code', 'site_name', 'type', 'capacity_mw', 'energy_kwh', 'avg_efficiency_pct', 'peak_kw']);
            foreach ($rows as $r) {
                $site = $sites->get((int) $r['key']);
                fputcsv($out, [
                    $r['day'] ?? '',
                    $site?->code,
                    $site?->name,
                    $site?->type?->value,
                    $site?->capacity_mw,
                    number_format($r['kwh'], 1, '.', ''),
                    number_format($r['avg_efficiency'] ?? 0, 1, '.', ''),
                    number_format($r['peak_kw'] ?? 0, 1, '.', ''),
                ]);
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=utf-8']);
    }
}
