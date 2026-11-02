<?php

namespace App\Services\Assistant\Tools;

use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\KnowledgeBase;

final class ProjectKnowledgeTool extends AbstractTool
{
    public function __construct(private readonly KnowledgeBase $knowledge) {}

    public function name(): string
    {
        return 'project_knowledge';
    }

    public function description(): string
    {
        return 'Search the curated GridPulse documentation & glossary (capacity factor, availability, efficiency, health score, alert-to-work-order loop, simulator physics, roles, stack).';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'query' => ['type' => 'string'],
            ],
            'required' => ['query'],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $query = is_string($args['query'] ?? null) ? $args['query'] : '';

        return [
            'topics' => $this->knowledge->search($query, 4),
        ];
    }
}
