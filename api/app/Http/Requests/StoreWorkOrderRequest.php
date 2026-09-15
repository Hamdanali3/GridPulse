<?php

namespace App\Http\Requests;

use App\Enums\Priority;
use App\Enums\WorkOrderStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreWorkOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'min:3', 'max:160'],
            'description' => ['nullable', 'string', 'max:4000'],
            'priority' => ['sometimes', Rule::enum(Priority::class)],
            'status' => ['sometimes', Rule::enum(WorkOrderStatus::class)],
            'site_id' => ['required', 'integer', 'exists:sites,id'],
            'asset_id' => ['nullable', 'integer', Rule::exists('assets', 'id')->where('site_id', $this->input('site_id'))],
            'alert_id' => ['nullable', 'integer', 'exists:alerts,id'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
        ];
    }

    public function messages(): array
    {
        return [
            'site_id.exists' => 'The selected site does not exist.',
            'asset_id.exists' => 'The asset must belong to the selected site.',
        ];
    }
}
