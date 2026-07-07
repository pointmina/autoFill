import { useState } from 'react'
import EntryForm, { type FieldConfig } from './EntryForm'

interface ImportReviewListProps<T> {
  title: string
  drafts: T[]
  fields: FieldConfig<T>[]
  createEmpty: () => T
  summary: (entry: T) => { title: string; subtitle?: string }
  onChange: (drafts: T[]) => void
}

// 아직 id도 없고 저장도 안 된 파싱 결과 후보 목록 — 체크(포함)된 채로 남은 항목만 확정 시
// 프로필에 추가된다. "제외"는 이 목록에서 지우는 것이고, 실제 저장된 프로필에는 영향이 없다.
export default function ImportReviewList<T>({
  title,
  drafts,
  fields,
  createEmpty,
  summary,
  onChange,
}: ImportReviewListProps<T>) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  function handleRemove(index: number) {
    onChange(drafts.filter((_, i) => i !== index))
    setEditingIndex((current) => {
      if (current === null || current === index) return null
      return current > index ? current - 1 : current
    })
  }

  function handleEditSubmit(index: number, value: T) {
    onChange(drafts.map((entry, i) => (i === index ? value : entry)))
    setEditingIndex(null)
  }

  return (
    <div className="array-section">
      <div className="array-section-header">
        <h2>{title}</h2>
        <span className="empty-hint">{drafts.length}건 발견</span>
      </div>

      {drafts.length === 0 && <p className="empty-hint">추출된 항목이 없습니다.</p>}

      <ul className="entry-list">
        {drafts.map((entry, index) => {
          const { title: cardTitle, subtitle } = summary({ ...createEmpty(), ...entry })
          return (
            <li key={index} className="entry-card">
              <div>
                <p className="entry-title">{cardTitle || '(제목 없음)'}</p>
                {subtitle && <p className="entry-subtitle">{subtitle}</p>}
              </div>
              <div className="entry-actions">
                <button type="button" onClick={() => setEditingIndex(index)}>
                  수정
                </button>
                <button type="button" className="btn-danger" onClick={() => handleRemove(index)}>
                  제외
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {editingIndex !== null && drafts[editingIndex] && (
        <EntryForm
          fields={fields}
          initialValue={{ ...createEmpty(), ...drafts[editingIndex] }}
          onSubmit={(value) => handleEditSubmit(editingIndex, value)}
          onCancel={() => setEditingIndex(null)}
        />
      )}
    </div>
  )
}
