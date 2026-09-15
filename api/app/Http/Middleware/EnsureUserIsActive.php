<?php

namespace App\Http\Middleware;

use App\Support\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Deactivated accounts keep their tokens in the table but are refused at the door. */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && ! $user->is_active) {
            $user->currentAccessToken()?->delete();

            return ApiResponse::error(401, 'UNAUTHENTICATED', 'This account has been deactivated. Contact your admin.');
        }

        return $next($request);
    }
}
