<?php

namespace App\Services\Assistant\Tools;

use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\KnowledgeBase;
use App\Services\EnergyService;

final class ToolRegistry
{
    /** @var array<string, ToolInterface> */
    private array $tools = [];

    public function __construct(EnergyService $energy, KnowledgeBase $knowledge)
    {
        $catalog = [
            new FleetOverviewTool($energy),
            new SiteSummaryTool($energy),
            new ListSitesTool($energy),
            new ListAssetsTool,
            new GenerationTimeseriesTool($energy),
            new AlertsSummaryTool,
            new ListAlertsTool,
            new WorkOrdersSummaryTool,
            new WorkOrdersListTool,
            new EngineerWorkloadTool,
            new EnergyReportTool($energy),
            new TeamSummaryTool,
            new AuditLogSearchTool,
            new NavigateTargetsTool,
            new ProjectKnowledgeTool($knowledge),
        ];

        foreach ($catalog as $tool) {
            $this->tools[$tool->name()] = $tool;
        }
    }

    /** @return list<array<string, mixed>> */
    public function definitions(): array
    {
        $defs = [];
        foreach ($this->tools as $tool) {
            $defs[] = [
                'type' => 'function',
                'function' => [
                    'name' => $tool->name(),
                    'description' => $tool->description(),
                    'parameters' => $tool->parametersSchema(),
                ],
            ];
        }

        return $defs;
    }

    public function get(string $name): ?ToolInterface
    {
        return $this->tools[$name] ?? null;
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function execute(string $name, array $args, AssistantContext $ctx): array
    {
        $tool = $this->tools[$name] ?? null;
        if (! $tool) {
            return [
                'error' => 'unknown_tool',
                'message' => "Unknown tool '{$name}'.",
            ];
        }

        return $tool->execute($args, $ctx);
    }
}

