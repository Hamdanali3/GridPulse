<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssistantUsage extends Model
{
    public $timestamps = false;

    protected $table = 'assistant_usage';

    protected $fillable = [
        'scope',
        'identifier',
        'window_start',
        'request_count',
    ];

    protected function casts(): array
    {
        return [
            'window_start' => 'datetime',
            'request_count' => 'integer',
        ];
    }
}
