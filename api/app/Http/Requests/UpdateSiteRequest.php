<?php

namespace App\Http\Requests;

use App\Enums\OperationalStatus;
use App\Enums\SiteType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSiteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('code')) {
            $this->merge(['code' => strtoupper(trim((string) $this->input('code')))]);
        }
    }

    public function rules(): array
    {
        $siteId = $this->route('site')?->id ?? $this->route('site');

        return [
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'code' => ['sometimes', 'string', 'regex:/^[A-Z]{3}-[A-Z0-9]{2,4}-\d{2,3}$/', Rule::unique('sites', 'code')->ignore($siteId)],
            'type' => ['sometimes', Rule::enum(SiteType::class)],
            'capacity_mw' => ['sometimes', 'numeric', 'min:0.1', 'max:5000'],
            'status' => ['sometimes', Rule::enum(OperationalStatus::class)],
            'lat' => ['sometimes', 'numeric', 'between:-90,90'],
            'lng' => ['sometimes', 'numeric', 'between:-180,180'],
            'region' => ['sometimes', 'string', 'max:80'],
            'country' => ['sometimes', 'string', 'max:80'],
            'commissioned_at' => ['nullable', 'date'],
            'min_efficiency' => ['sometimes', 'numeric', 'between:0,100'],
            'max_temperature' => ['sometimes', 'numeric', 'between:-50,200'],
        ];
    }

    public function messages(): array
    {
        return [
            'code.regex' => 'Code format is TYP-RGN-01, for example SOL-TX-01.',
            'code.unique' => 'That site code is already in use.',
        ];
    }
}
