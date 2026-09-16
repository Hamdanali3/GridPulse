<?php

namespace Tests\Unit;

use App\Models\Site;
use App\Support\ListQuery;
use Illuminate\Http\Request;
use Tests\TestCase;

class ListQueryTest extends TestCase
{
    public function test_limit_is_clamped_between_one_and_max(): void
    {
        $this->assertSame(20, ListQuery::limit(Request::create('/', 'GET')));
        $this->assertSame(5, ListQuery::limit(Request::create('/', 'GET', ['limit' => 5])));
        $this->assertSame(100, ListQuery::limit(Request::create('/', 'GET', ['limit' => 5000])));
        $this->assertSame(1, ListQuery::limit(Request::create('/', 'GET', ['limit' => -3])));
        $this->assertSame(1, ListQuery::limit(Request::create('/', 'GET', ['limit' => 'abc'])));
    }

    public function test_sort_only_uses_whitelisted_columns(): void
    {
        $request = Request::create('/', 'GET', ['sort' => '-capacity_kw,password,name']);
        $sql = ListQuery::applySort(Site::query(), $request, ['name', 'capacity_kw'])->toSql();

        $this->assertStringContainsString('order by "capacity_kw" desc, "name" asc', $sql);
        $this->assertStringNotContainsString('password', $sql);
    }

    public function test_sort_falls_back_to_default_when_nothing_matches(): void
    {
        $request = Request::create('/', 'GET', ['sort' => 'drop_table']);
        $sql = ListQuery::applySort(Site::query(), $request, ['name'], '-created_at')->toSql();

        $this->assertStringContainsString('order by "created_at" desc', $sql);
    }
}
