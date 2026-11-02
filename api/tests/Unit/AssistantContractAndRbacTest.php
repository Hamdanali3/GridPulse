<?php

namespace Tests\Unit;

use App\Models\Alert;
use App\Models\Asset;
use App\Models\AuditLog;
use App\Models\Site;
use App\Models\User;
use App\Models\WorkOrder;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\KnowledgeBase;
use App\Services\Assistant\NavigateTargets;
use App\Services\Assistant\ResponseValidator;
use App\Services\Assistant\Tools\ToolRegistry;
use App\Services\EnergyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssistantContractAndRbacTest extends TestCase
{
    use RefreshDatabase;

    private function registry(): ToolRegistry
    {
        return new ToolRegistry(new EnergyService, new KnowledgeBase);
    }

    public function test_response_validator_normalizes_all_visual_block_types_and_caps_counts(): void
    {
        $raw = json_encode([
            'summary' => 'Across the last 7 days (Asia/Karachi), 10 work orders were assigned across hydro and solar plants, with 60.0% completed.',
            'kpis' => [
                ['label' => 'Assigned', 'value' => 10, 'unit' => 'orders', 'delta' => '7d window', 'trend' => 'neutral'],
                ['label' => 'Done', 'value' => 6, 'unit' => 'orders', 'delta' => '60%', 'trend' => 'up'],
                ['label' => 'K3', 'value' => 1],
                ['label' => 'K4', 'value' => 2],
                ['label' => 'K5', 'value' => 3],
                ['label' => 'K6', 'value' => 4],
                ['label' => 'K7-extra', 'value' => 5],
            ],
            'visuals' => [
                [
                    'type' => 'stacked_bar',
                    'title' => 'Workload by engineer',
                    'x' => 'name',
                    'series' => ['done', 'in_progress'],
                    'data' => [
                        ['name' => 'Bilal Raza', 'done' => '4', 'in_progress' => 2],
                    ],
                    'unit' => 'orders',
                ],
                [
                    'type' => 'progress',
                    'title' => 'Overall completion',
                    'x' => 'label',
                    'series' => [['key' => 'value', 'label' => 'Completion']],
                    'data' => [['label' => 'Hydro + Solar', 'value' => 60]],
                    'unit' => '%',
                ],
                [
                    'type' => 'table',
                    'caption' => 'Top sites',
                    'columns' => ['Site', 'Total', 'Done'],
                    'rows' => array_fill(0, 14, ['Golen Gol Hydro', 5, 3]),
                ],
            ],
            'insights' => ['1 overdue order at Golen Gol Hydro.'],
            'links' => [
                ['label' => 'Open Work Orders', 'route' => '/work-orders', 'query' => ['types' => 'hydro,solar', 'view' => 'table']],
            ],
            'followups' => ['Show overdue work orders'],
        ]);

        $validated = ResponseValidator::validateSession((string) $raw, 'admin', [], true, [1]);

        $this->assertTrue($validated['valid']);
        $this->assertCount(6, $validated['data']['kpis']);
        $this->assertCount(3, $validated['data']['visuals']);
        $this->assertSame(4.0, $validated['data']['visuals'][0]['data'][0]['done']);
        $this->assertCount(10, $validated['data']['visuals'][2]['rows']);
        $this->assertCount(3, $validated['data']['followups']);
        $this->assertSame('/work-orders', $validated['data']['links'][0]['route']);
        $this->assertSame('hydro,solar', $validated['data']['links'][0]['query']['types']);
    }

    public function test_response_validator_rejects_invented_routes_and_strips_admin_links_for_viewer(): void
    {
        $invented = json_encode([
            'summary' => 'Fleet output is 84.2 MW right now in Asia/Karachi.',
            'kpis' => [],
            'visuals' => [],
            'insights' => ['Normal river flow.'],
            'links' => [['label' => 'Secret', 'route' => '/secret-admin-console']],
            'followups' => [],
        ]);

        $bad = ResponseValidator::validateSession((string) $invented, 'viewer');
        $this->assertFalse($bad['valid']);
        $this->assertStringContainsString('non-whitelisted route', $bad['reason']);

        $adminLinkForViewer = json_encode([
            'summary' => 'Audit logs require the Admin role; you can inspect live alerts instead (Asia/Karachi).',
            'kpis' => [],
            'visuals' => [],
            'insights' => ['Viewer accounts are read-only.'],
            'links' => [
                ['label' => 'Audit', 'route' => '/audit'],
                ['label' => 'Open Alerts', 'route' => '/alerts', 'query' => ['status' => 'open']],
            ],
            'followups' => [],
        ]);

        $clean = ResponseValidator::validateSession((string) $adminLinkForViewer, 'viewer');
        $this->assertTrue($clean['valid']);
        $this->assertCount(1, $clean['data']['links']);
        $this->assertSame('/alerts', $clean['data']['links'][0]['route']);
    }

    public function test_navigate_targets_enforces_whitelist_and_role_permissions(): void
    {
        $wo = NavigateTargets::resolve('work_orders', [
            'technologies' => ['hydro', 'solar'],
            'from' => '2026-10-27',
            'to' => '2026-11-02',
            'overdue' => true,
        ], 'admin');

        $this->assertTrue($wo['ok']);
        $this->assertSame('/work-orders', $wo['link']['route']);
        $this->assertSame('hydro,solar', $wo['link']['query']['types']);
        $this->assertSame('1', $wo['link']['query']['overdue']);
        $this->assertSame('table', $wo['link']['query']['view']);

        $deniedTeam = NavigateTargets::resolve('team', [], 'viewer');
        $this->assertFalse($deniedTeam['ok']);
        $this->assertTrue($deniedTeam['forbidden']);

        $deniedAudit = NavigateTargets::resolve('audit', [], 'engineer');
        $this->assertFalse($deniedAudit['ok']);
        $this->assertTrue($deniedAudit['forbidden']);
    }

    public function test_tool_catalog_enforces_rbac_and_engineer_self_scoping_and_email_redaction(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Amina Admin', 'email' => 'amina@gridpulse.io']);
        $engA = User::factory()->engineer()->create(['name' => 'Bilal Engineer', 'email' => 'bilal@gridpulse.io']);
        $engB = User::factory()->engineer()->create(['name' => 'Sana Engineer', 'email' => 'sana@gridpulse.io']);
        $viewer = User::factory()->viewer()->create(['name' => 'Zain Viewer', 'email' => 'zain@gridpulse.io']);

        $hydroSite = Site::factory()->create(['name' => 'Golen Gol Hydro', 'type' => 'hydro']);
        $asset = Asset::factory()->create(['site_id' => $hydroSite->id]);
        Alert::factory()->create(['site_id' => $hydroSite->id, 'asset_id' => $asset->id]);

        WorkOrder::factory()->create([
            'title' => 'Inspect Pelton runner',
            'site_id' => $hydroSite->id,
            'assignee_id' => $engA->id,
            'created_by' => $admin->id,
        ]);
        WorkOrder::factory()->create([
            'title' => 'Check transformer oil',
            'site_id' => $hydroSite->id,
            'assignee_id' => $engB->id,
            'created_by' => $admin->id,
        ]);

        AuditLog::query()->create([
            'actor_id' => $admin->id,
            'action' => 'user.updated',
            'entity_type' => 'user',
            'entity_id' => $engA->id,
            'meta' => ['role' => 'engineer'],
            'ip' => '127.0.0.1',
            'created_at' => now(),
        ]);

        $registry = $this->registry();
        $viewerCtx = AssistantContext::fromUser($viewer);
        $engACtx = AssistantContext::fromUser($engA);
        $adminCtx = AssistantContext::fromUser($admin);

        // Viewer forbidden on admin/engineer-only tools
        $this->assertTrue($registry->execute('team_summary', [], $viewerCtx)['forbidden'] ?? false);
        $this->assertTrue($registry->execute('audit_log_search', [], $viewerCtx)['forbidden'] ?? false);
        $this->assertTrue($registry->execute('engineer_workload', [], $viewerCtx)['forbidden'] ?? false);

        // Engineer forbidden on admin-only tools & other engineers' workload
        $this->assertTrue($registry->execute('team_summary', [], $engACtx)['forbidden'] ?? false);
        $this->assertTrue($registry->execute('audit_log_search', [], $engACtx)['forbidden'] ?? false);
        $this->assertTrue($registry->execute('engineer_workload', ['assignee' => 'Sana'], $engACtx)['forbidden'] ?? false);

        // Engineer allowed on own workload, with email omitted
        $ownWorkload = $registry->execute('engineer_workload', [], $engACtx);
        $this->assertSame('self', $ownWorkload['scope']);
        $this->assertCount(1, $ownWorkload['engineers']);
        $this->assertSame('Bilal Engineer', $ownWorkload['engineers'][0]['name']);
        $this->assertArrayNotHasKey('email', $ownWorkload['engineers'][0]);

        // Engineer work_orders_summary defaults to own assigned orders (`mine`)
        $engSummary = $registry->execute('work_orders_summary', ['range' => '7d'], $engACtx);
        $this->assertSame('mine', $engSummary['scope']);
        $this->assertSame(1, $engSummary['total']);

        // WorkOrdersList redacts email for non-admins
        $woListJson = json_encode($registry->execute('work_orders_list', ['scope' => 'all'], $viewerCtx));
        $this->assertStringNotContainsString('bilal@gridpulse.io', (string) $woListJson);
        $this->assertStringNotContainsString('sana@gridpulse.io', (string) $woListJson);

        // Admin sees full team & audit trail
        $team = $registry->execute('team_summary', [], $adminCtx);
        $this->assertSame(4, $team['total']);
        $audit = $registry->execute('audit_log_search', ['range' => '7d'], $adminCtx);
        $this->assertSame(1, $audit['count']);
    }
}
