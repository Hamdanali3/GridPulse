<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Http\Requests\ChangePasswordRequest;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function register(RegisterRequest $request): JsonResponse
    {
        // The very first account owns the workspace; everyone after starts as a viewer.
        $isFirst = User::query()->count() === 0;

        $user = User::create([
            'name' => $request->string('name'),
            'email' => $request->string('email'),
            'password' => $request->string('password'),
            'role' => $isFirst ? Role::Admin : Role::Viewer,
            'last_login_at' => now(),
        ]);

        $token = $this->issueToken($user, $request);
        $this->audit->log($request, 'auth.register', 'User', $user->id, ['email' => $user->email], $user);

        return ApiResponse::created(['token' => $token, 'user' => new UserResource($user)]);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->string('email'))->first();

        // Same message for unknown email and wrong password so accounts cannot be enumerated.
        if (! $user || ! Hash::check($request->string('password'), $user->password)) {
            return ApiResponse::error(401, 'UNAUTHENTICATED', 'Email or password is incorrect.');
        }
        if (! $user->is_active) {
            return ApiResponse::error(403, 'FORBIDDEN', 'This account has been deactivated. Contact your admin.');
        }

        $user->forceFill(['last_login_at' => now()])->save();
        $token = $this->issueToken($user, $request);
        $this->audit->log($request, 'auth.login', 'User', $user->id, [], $user);

        return ApiResponse::ok(['token' => $token, 'user' => new UserResource($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();
        $this->audit->log($request, 'auth.logout', 'User', $request->user()->id);

        return ApiResponse::ok(['logged_out' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return ApiResponse::ok(new UserResource($request->user()));
    }

    public function updateMe(UpdateProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->update(['name' => $request->string('name')]);
        $this->audit->log($request, 'user.update_profile', 'User', $user->id);

        return ApiResponse::ok(new UserResource($user));
    }

    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->update(['password' => $request->string('password')]);

        // Sign out every other device; keep the current token alive.
        $currentId = $user->currentAccessToken()?->id;
        $user->tokens()->when($currentId, fn ($q) => $q->where('id', '!=', $currentId))->delete();
        $this->audit->log($request, 'user.change_password', 'User', $user->id);

        return ApiResponse::ok(new UserResource($user));
    }

    private function issueToken(User $user, Request $request): string
    {
        $device = substr((string) $request->userAgent(), 0, 60) ?: 'api';

        return $user->createToken($device, ['*'], now()->addDays((int) config('gridpulse.token_ttl_days', 7)))->plainTextToken;
    }
}
