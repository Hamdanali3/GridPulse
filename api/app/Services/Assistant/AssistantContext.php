<?php

namespace App\Services\Assistant;

use App\Enums\Role;
use App\Models\User;
use Carbon\CarbonImmutable;

final readonly class AssistantContext
{
    /**
     * @param  list<string>  $permissions
     * @param  list<string>  $availableScopes
     */
    public function __construct(
        public int $userId,
        public string $name,
        public string $role,
        public array $permissions,
        public string $today,
        public string $nowLocal,
        public string $timezone,
        public array $availableScopes,
    ) {}

    public static function fromUser(User $user): self
    {
        $roleValue = $user->role instanceof Role ? $user->role->value : (string) $user->role;
        $karachiNow = CarbonImmutable::now('Asia/Karachi');

        [$permissions, $scopes] = match ($roleValue) {
            'admin' => [
                [
                    'read:fleet',
                    'read:sites',
                    'write:sites',
                    'delete:sites',
                    'read:assets',
                    'write:assets',
                    'delete:assets',
                    'read:alerts',
                    'handle:alerts',
                    'read:work_orders',
                    'write:work_orders',
                    'delete:work_orders',
                    'read:reports',
                    'manage:team',
                    'read:audit',
                ],
                ['fleet', 'sites', 'assets', 'alerts', 'work_orders', 'engineer_workload', 'reports', 'team', 'audit'],
            ],
            'engineer' => [
                [
                    'read:fleet',
                    'read:sites',
                    'write:sites',
                    'read:assets',
                    'write:assets',
                    'read:alerts',
                    'handle:alerts',
                    'read:work_orders',
                    'write:work_orders',
                    'read:reports',
                ],
                ['fleet', 'sites', 'assets', 'alerts', 'own_work_orders', 'site_work_orders', 'own_workload', 'reports'],
            ],
            default => [
                [
                    'read:fleet',
                    'read:sites',
                    'read:assets',
                    'read:alerts',
                    'read:work_orders',
                    'read:reports',
                ],
                ['fleet', 'sites', 'assets', 'alerts', 'work_orders', 'reports'],
            ],
        };

        return new self(
            userId: (int) $user->id,
            name: (string) $user->name,
            role: $roleValue,
            permissions: $permissions,
            today: $karachiNow->toDateString(),
            nowLocal: $karachiNow->format('Y-m-d H:i'),
            timezone: 'Asia/Karachi',
            availableScopes: $scopes,
        );
    }

    /** @return array<string, mixed> */
    public function bootstrapPayload(): array
    {
        [$welcome, $starters] = match ($this->role) {
            'admin' => [
                "Welcome back, {$this->name}. As Operations Chief-of-Staff, I can summarize fleet output, engineer workloads, completion rates, critical alerts, team roles, and audit activity.",
                [
                    'How much work did we give engineers in the last 7 days across all hydro plants and solar fields, and how much is done?',
                    'Show overdue work orders and which sites are most affected',
                    'What is fleet output today and capacity factor by technology?',
                    'Summarize open critical alerts right now',
                    'Who changed what in the audit log over the last 7 days?',
                ],
            ],
            'engineer' => [
                "Hi {$this->name}. As your Field-Ops Co-Pilot, I default to your assigned work orders and active site alerts to help you prioritize field checks.",
                [
                    'What should I fix first across my assigned work orders and alerts?',
                    'Show my open and overdue work orders',
                    'Summarize active critical and warning alerts across sites',
                    'Which generating units have the lowest health score right now?',
                    'Explain how low-efficiency and high-temperature alerts trigger',
                ],
            ],
            default => [
                "Hello {$this->name}. I can report live fleet generation, plant availability, 7-day energy trends, and explain renewable-operations metrics in plain language.",
                [
                    'What is the fleet output and capacity factor right now?',
                    'Which plants are producing least today?',
                    'Show 7-day energy generation grouped by technology',
                    'Which sites are degraded, offline, or in maintenance?',
                    'What does capacity factor mean vs availability?',
                ],
            ],
        };

        return [
            'user_id' => $this->userId,
            'name' => $this->name,
            'role' => $this->role,
            'permissions' => $this->permissions,
            'today' => $this->today,
            'timezone' => $this->timezone,
            'welcome' => $welcome,
            'starters' => $starters,
        ];
    }
}
