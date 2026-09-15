<?php

namespace App\Http\Requests;

use App\Enums\AssetKind;
use App\Enums\OperationalStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAssetRequest extends FormRequest
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
        $assetId = $this->route('asset')?->id ?? $this->route('asset');

        return [
            'site_id' => ['sometimes', 'integer', 'exists:sites,id'],
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'tag' => ['sometimes', 'string', 'regex:/^[A-Z]{2,4}-\d{2,4}$/', Rule::unique('assets', 'tag')->ignore($assetId)],
            'kind' => ['sometimes', Rule::enum(AssetKind::class)],
            'manufacturer' => ['nullable', 'string', 'max:80'],
            'serial_number' => ['nullable', 'string', 'max:80'],
            'rated_kw' => ['sometimes', 'numeric', 'min:1', 'max:50000'],
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
