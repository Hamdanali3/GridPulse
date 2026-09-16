<?php

namespace Tests\Unit;

use App\Enums\AlertStatus;
use App\Enums\Role;
use App\Enums\Severity;
use App\Enums\WorkOrderStatus;
use PHPUnit\Framework\TestCase;

class EnumTest extends TestCase
{
    public function test_role_values_match_the_api_contract(): void
    {
        $this->assertSame(['admin', 'engineer', 'viewer'], Role::values());
    }

    public function test_severity_values_are_ordered_from_most_to_least_urgent(): void
    {
        $this->assertSame(['critical', 'warning', 'info'], Severity::values());
    }

    public function test_status_enums_round_trip_from_strings(): void
    {
        $this->assertSame(AlertStatus::Open, AlertStatus::from('open'));
        $this->assertSame(WorkOrderStatus::Planned, WorkOrderStatus::from('planned'));
        $this->assertNull(AlertStatus::tryFrom('bogus'));
    }
}
