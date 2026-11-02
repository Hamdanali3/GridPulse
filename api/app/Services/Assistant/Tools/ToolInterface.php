<?php

namespace App\Services\Assistant\Tools;

use App\Services\Assistant\AssistantContext;

interface ToolInterface
{
    public function name(): string;

    public function description(): string;

    /** @return array<string, mixed> */
    public function parametersSchema(): array;

    /** @return list<string> */
    public function allowedRoles(): array;

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function execute(array $args, AssistantContext $ctx): array;
}
