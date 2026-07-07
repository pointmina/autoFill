import ArrayCrudSection from '../components/ArrayCrudSection'
import type { FieldConfig } from '../components/EntryForm'
import { generateId, summarizeAwardEntry, type AwardEntry } from '../../shared/schema'

export const fields: FieldConfig<AwardEntry>[] = [
  { key: 'title', label: '수상명', type: 'text', required: true },
  { key: 'issuer', label: '수여 기관', type: 'text' },
  { key: 'awardDate', label: '수상일', type: 'month' },
  { key: 'description', label: '설명', type: 'textarea', wide: true },
]

export function createEmpty(): AwardEntry {
  return {
    id: generateId(),
    title: '',
    issuer: '',
    awardDate: '',
    description: '',
  }
}

interface AwardSectionProps {
  entries: AwardEntry[]
  onChange: (entries: AwardEntry[]) => void
}

export default function AwardSection({ entries, onChange }: AwardSectionProps) {
  return (
    <ArrayCrudSection
      title="수상"
      entries={entries}
      fields={fields}
      sortKey="awardDate"
      createEmpty={createEmpty}
      onChange={onChange}
      summary={summarizeAwardEntry}
    />
  )
}
