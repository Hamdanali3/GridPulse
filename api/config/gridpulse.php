<?php

return [
    // Sanctum token lifetime in days. Tokens are revoked on logout, deactivation and password change.
    'token_ttl_days' => (int) env('GRIDPULSE_TOKEN_TTL_DAYS', 7),

    // Telemetry retention window enforced by gridpulse:prune.
    'retention_days' => (int) env('GRIDPULSE_RETENTION_DAYS', 7),
];
