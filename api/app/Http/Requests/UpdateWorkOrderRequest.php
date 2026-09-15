<?php

namespace App\Http\Requests;

use App\Enums\Priority;
use App\Enums\WorkOrderStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateWorkOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $siteId = $this->input('site_id', $this->route('work_order')?->site_id);

        return [
            'title' => ['sometimes', 'string', 'min:3', 'max:160'],
            'description' => ['nullable', 'string', 'max:4000'],
            'priority' => ['sometimes', Rule::enum(Priority::class)],
            'status' => ['sometimes', Rule::enum(WorkOrderStatus::class)],
            'site_id' => ['sometimes', 'integer', 'exists:sites,id'],
            'asset_id' => ['nullable', 'integer', Rule::exists('assets', 'id')->where('site_id', $siteId)],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
        ];
    }

    public function messages(): array
    {
        return ['asset_id.exists' => 'The asset must belong to the selected site.'];
    }
}
