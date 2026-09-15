<?php

namespace App\Http\Requests;

use App\Enums\AssetKind;
use App\Enums\OperationalStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAssetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('tag')) {
            $this->merge(['tag' => strtoupper(trim((string) $this->input('tag')))]);
        }
    }

    public function rules(): array
    {
        return [
            'site_id' => ['required', 'integer', 'exists:sites,id'],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'tag' => ['required', 'string', 'regex:/^[A-Z]{2,4}-\d{2,4}$/', Rule::unique('assets', 'tag')],
            'kind' => ['required', Rule::enum(AssetKind::class)],
            'manufacturer' => ['nullable', 'string', 'max:80'],
            'serial_number' => ['nullable', 'string', 'max:80'],
            'rated_kw' => ['required', 'numeric', 'min:1', 'max:50000'],
            'status' => ['sometimes', Rule::enum(OperationalStatus::class)],
            'health_score' => ['sometimes', 'numeric', 'between:0,100'],
            'installed_at' => ['nullable', 'date'],
        ];
    }

    public function messages(): array
    {
        return [
            'site_id.exists' => 'The selected site does not exist.',
            'tag.regex' => 'Tag format is INV-01 or WT-003.',
            'tag.unique' => 'That asset tag is already in use.',
        ];
    }
}
