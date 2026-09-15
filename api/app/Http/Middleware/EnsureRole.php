<?php

namespace App\Http\Middleware;

use App\Enums\Role;
use App\Support\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Usage: ->middleware('role:admin,engineer')
 * Runs after auth:sanctum, so a user is always present here.
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        $allowed = array_map(fn (string $r) => Role::from($r), $roles);

        if (! $user || ! $user->hasRole(...$allowed)) {
            return ApiResponse::error(403, 'FORBIDDEN', 'This action needs one of these roles: '.implode(', ', $roles).'.');
        }

        return $next($request);
    }
}
