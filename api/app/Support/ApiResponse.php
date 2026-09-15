<?php

namespace App\Support;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Every endpoint answers with the same envelope so the client can handle responses uniformly:
 *   { success: true, data: ..., meta?: { page, limit, total, pages } }
 *   { success: false, error: { code, message, details? } }
 */
final class ApiResponse
{
    public static function ok(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['success' => true, 'data' => self::normalize($data)], $status);
    }

    public static function created(mixed $data): JsonResponse
    {
        return self::ok($data, 201);
    }

    public static function noContent(): JsonResponse
    {
        return response()->json(null, 204);
    }

    /**
     * @param  class-string<JsonResource>  $resource
     */
    public static function paginated(LengthAwarePaginator $paginator, string $resource): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $resource::collection($paginator->items())->resolve(),
            'meta' => [
                'page' => $paginator->currentPage(),
                'limit' => $paginator->perPage(),
                'total' => $paginator->total(),
                'pages' => max(1, $paginator->lastPage()),
            ],
        ]);
    }

    public static function error(int $status, string $code, string $message, mixed $details = null): JsonResponse
    {
        $error = ['code' => $code, 'message' => $message];
        if ($details !== null) {
            $error['details'] = $details;
        }

        return response()->json(['success' => false, 'error' => $error], $status);
    }

    private static function normalize(mixed $data): mixed
    {
        if ($data instanceof JsonResource) {
            return $data->resolve();
        }

        return $data;
    }
}
