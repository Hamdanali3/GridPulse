<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\ApiResponse;
use App\Support\ListQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = User::query();
        if ($q = $request->query('q')) {
            $like = '%'.$q.'%';
            $query->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('email', 'like', $like));
        }
        ListQuery::applySort($query, $request, ['name', 'email', 'role', 'created_at', 'last_login_at'], 'name');

        return ApiResponse::paginated($query->paginate(ListQuery::limit($request)), UserResource::class);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $self = $request->user()->is($user);
        if ($self && $request->filled('role') && $request->enum('role', Role::class) !== Role::Admin) {
            return ApiResponse::error(422, 'VALIDATION_ERROR', 'You cannot remove your own admin role.');
        }
        if ($self && $request->has('is_active') && ! $request->boolean('is_active')) {
            return ApiResponse::error(422, 'VALIDATION_ERROR', 'You cannot deactivate your own account.');
        }

        $user->update($request->validated());
        if ($request->has('is_active') && ! $request->boolean('is_active')) {
            $user->tokens()->delete();
        }
        $this->audit->log($request, 'user.update', 'User', $user->id, $request->validated());

        return ApiResponse::ok(new UserResource($user));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($request->user()->is($user)) {
            return ApiResponse::error(422, 'VALIDATION_ERROR', 'You cannot delete your own account.');
        }
        $this->audit->log($request, 'user.delete', 'User', $user->id, ['email' => $user->email]);
        $user->tokens()->delete();
        $user->delete();

        return ApiResponse::noContent();
    }
}
