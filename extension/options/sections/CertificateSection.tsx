import ArrayCrudSection from '../components/ArrayCrudSection'
import type { FieldConfig } from '../components/EntryForm'
import { generateId, summarizeCertificateEntry, type CertificateEntry } from '../../shared/schema'

export const fields: FieldConfig<CertificateEntry>[] = [
  { key: 'name', label: '자격증명', type: 'text', required: true },
  { key: 'issuer', label: '발행 기관', type: 'text' },
  { key: 'acquiredDate', label: '취득일', type: 'date' },
  { key: 'certNumber', label: '자격증 번호', type: 'text' },
  { key: 'expiryDate', label: '만료일', type: 'date' },
]

export function createEmpty(): CertificateEntry {
  return {
    id: generateId(),
    name: '',
    issuer: '',
    acquiredDate: '',
    certNumber: '',
    expiryDate: '',
  }
}

interface CertificateSectionProps {
  entries: CertificateEntry[]
  onChange: (entries: CertificateEntry[]) => void
}

export default function CertificateSection({ entries, onChange }: CertificateSectionProps) {
  return (
    <ArrayCrudSection
      title="자격증"
      entries={entries}
      fields={fields}
      sortKey="acquiredDate"
      createEmpty={createEmpty}
      onChange={onChange}
      summary={summarizeCertificateEntry}
    />
  )
}
