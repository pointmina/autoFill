import { useState, type FormEvent } from 'react'

export interface FieldConfig<T> {
  key: keyof T
  label: string
  type: 'text' | 'date' | 'month' | 'select' | 'textarea' | 'checkbox'
  options?: readonly string[]
  required?: boolean
  wide?: boolean
}

interface EntryFormProps<T> {
  fields: FieldConfig<T>[]
  initialValue: T
  onSubmit: (value: T) => void
  onCancel: () => void
  validate?: (value: T) => string | null
}

export default function EntryForm<T>({
  fields,
  initialValue,
  onSubmit,
  onCancel,
  validate,
}: EntryFormProps<T>) {
  const [form, setForm] = useState<T>(initialValue)
  const [error, setError] = useState('')

  function updateField(key: keyof T, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }) as T)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    for (const field of fields) {
      if (field.required) {
        const fieldValue = form[field.key]
        if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
          setError(`${field.label}은 필수 항목입니다.`)
          return
        }
      }
    }
    const validationError = validate?.(form) ?? null
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    onSubmit(form)
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="field-grid">
        {fields.map((field) => {
          const rawValue = form[field.key]
          const key = String(field.key)

          if (field.type === 'checkbox') {
            return (
              <label
                key={key}
                className={field.wide ? 'field-wide field-checkbox' : 'field-checkbox'}
              >
                <input
                  type="checkbox"
                  checked={Boolean(rawValue)}
                  onChange={(e) => updateField(field.key, e.target.checked)}
                />
                {field.label}
              </label>
            )
          }

          if (field.type === 'select') {
            return (
              <label key={key} className={field.wide ? 'field-wide' : undefined}>
                {field.label}
                <select
                  value={String(rawValue ?? '')}
                  onChange={(e) => updateField(field.key, e.target.value)}
                >
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )
          }

          if (field.type === 'textarea') {
            return (
              <label key={key} className={field.wide ? 'field-wide' : undefined}>
                {field.label}
                <textarea
                  value={String(rawValue ?? '')}
                  onChange={(e) => updateField(field.key, e.target.value)}
                />
              </label>
            )
          }

          return (
            <label key={key} className={field.wide ? 'field-wide' : undefined}>
              {field.label}
              <input
                type={field.type}
                value={String(rawValue ?? '')}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
            </label>
          )
        })}
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="form-actions">
        <button type="submit">저장</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}
