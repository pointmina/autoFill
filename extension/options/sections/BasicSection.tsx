import { useEffect, useState, type FormEvent } from 'react'
import type { BasicInfo } from '../../shared/schema'

interface BasicSectionProps {
  value: BasicInfo
  onSave: (value: BasicInfo) => Promise<void>
}

export default function BasicSection({ value, onSave }: BasicSectionProps) {
  const [form, setForm] = useState<BasicInfo>(value)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setForm(value)
  }, [value])

  function updateField<K extends keyof BasicInfo>(key: K, fieldValue: BasicInfo[K]) {
    setForm((prev) => ({ ...prev, [key]: fieldValue }))
    setSaved(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('이름은 필수 항목입니다.')
      return
    }
    setError('')
    await onSave(form)
    setSaved(true)
  }

  return (
    <form className="section-form" onSubmit={handleSubmit}>
      <div className="field-grid">
        <label>
          이름
          <input value={form.name} onChange={(e) => updateField('name', e.target.value)} />
        </label>
        <label>
          영문명
          <input value={form.nameEn} onChange={(e) => updateField('nameEn', e.target.value)} />
        </label>
        <label>
          한자이름
          <input value={form.nameHanja} onChange={(e) => updateField('nameHanja', e.target.value)} />
        </label>
        <label>
          생년월일
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => updateField('birthDate', e.target.value)}
          />
        </label>
        <label>
          성별
          <select
            value={form.gender}
            onChange={(e) => updateField('gender', e.target.value as BasicInfo['gender'])}
          >
            <option value="none">선택 안 함</option>
            <option value="female">여성</option>
            <option value="male">남성</option>
          </select>
        </label>
        <label>
          이메일
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
        </label>
        <label>
          전화번호
          <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
        </label>
        <label>
          우편번호
          <input
            value={form.postalCode}
            onChange={(e) => updateField('postalCode', e.target.value)}
          />
        </label>
        <label className="field-wide">
          주소
          <input value={form.address} onChange={(e) => updateField('address', e.target.value)} />
        </label>
        <label className="field-wide">
          상세주소
          <input
            value={form.addressDetail}
            onChange={(e) => updateField('addressDetail', e.target.value)}
          />
        </label>
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="form-actions">
        <button type="submit">저장</button>
        {saved && <span className="saved-indicator">저장 완료</span>}
      </div>
    </form>
  )
}
