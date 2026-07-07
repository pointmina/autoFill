import { useState } from 'react'
import EntryForm, { type FieldConfig } from './EntryForm'
import { generateId, sortEntriesByKeyDesc } from '../../shared/schema'

interface EntryWithId {
  id: string
}

interface ArrayCrudSectionProps<T extends EntryWithId> {
  title: string
  entries: T[]
  fields: FieldConfig<T>[]
  sortKey: keyof T
  summary: (entry: T) => { title: string; subtitle?: string }
  createEmpty: () => T
  validate?: (value: T) => string | null
  transform?: (value: T) => T
  onChange: (entries: T[]) => void
}

type Mode = { type: 'list' } | { type: 'add' } | { type: 'edit'; id: string }

export default function ArrayCrudSection<T extends EntryWithId>({
  title,
  entries,
  fields,
  sortKey,
  summary,
  createEmpty,
  validate,
  transform,
  onChange,
}: ArrayCrudSectionProps<T>) {
  const [mode, setMode] = useState<Mode>({ type: 'list' })

  const sorted = sortEntriesByKeyDesc(entries, sortKey)

  function handleAddSubmit(value: T) {
    const finalValue = transform ? transform(value) : value
    onChange([...entries, { ...finalValue, id: generateId() }])
    setMode({ type: 'list' })
  }

  function handleEditSubmit(id: string, value: T) {
    const finalValue = transform ? transform(value) : value
    onChange(entries.map((entry) => (entry.id === id ? { ...finalValue, id } : entry)))
    setMode({ type: 'list' })
  }

  function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    onChange(entries.filter((entry) => entry.id !== id))
  }

  return (
    <div className="array-section">
      <div className="array-section-header">
        <h2>{title}</h2>
        {mode.type === 'list' && (
          <button type="button" onClick={() => setMode({ type: 'add' })}>
            + 추가
          </button>
        )}
      </div>

      {mode.type === 'list' && sorted.length === 0 && (
        <p className="empty-hint">등록된 항목이 없습니다.</p>
      )}

      {mode.type === 'list' && (
        <ul className="entry-list">
          {sorted.map((entry) => {
            const { title: cardTitle, subtitle } = summary(entry)
            return (
              <li key={entry.id} className="entry-card">
                <div>
                  <p className="entry-title">{cardTitle}</p>
                  {subtitle && <p className="entry-subtitle">{subtitle}</p>}
                </div>
                <div className="entry-actions">
                  <button type="button" onClick={() => setMode({ type: 'edit', id: entry.id })}>
                    수정
                  </button>
                  <button type="button" className="btn-danger" onClick={() => handleDelete(entry.id)}>
                    삭제
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {mode.type === 'add' && (
        <EntryForm
          fields={fields}
          initialValue={createEmpty()}
          onSubmit={handleAddSubmit}
          onCancel={() => setMode({ type: 'list' })}
          validate={validate}
        />
      )}

      {mode.type === 'edit' &&
        (() => {
          const editId = mode.id
          const editing = entries.find((entry) => entry.id === editId)
          if (!editing) return null
          return (
            <EntryForm
              fields={fields}
              initialValue={editing}
              onSubmit={(value) => handleEditSubmit(editId, value)}
              onCancel={() => setMode({ type: 'list' })}
              validate={validate}
            />
          )
        })()}
    </div>
  )
}
