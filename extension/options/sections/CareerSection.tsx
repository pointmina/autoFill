import ArrayCrudSection from '../components/ArrayCrudSection'
import type { FieldConfig } from '../components/EntryForm'
import { generateId, summarizeCareerEntry, type CareerEntry } from '../../shared/schema'

export const fields: FieldConfig<CareerEntry>[] = [
  { key: 'companyName', label: '회사명', type: 'text', required: true },
  { key: 'department', label: '부서', type: 'text' },
  { key: 'position', label: '직위/직책', type: 'text' },
  { key: 'startDate', label: '입사일', type: 'month' },
  { key: 'endDate', label: '퇴사일', type: 'month' },
  { key: 'isCurrent', label: '재직 중', type: 'checkbox' },
  { key: 'jobDescription', label: '업무 내용', type: 'textarea', wide: true },
  { key: 'salary', label: '연봉', type: 'text' },
  { key: 'resignReason', label: '이직 사유', type: 'text' },
]

export function createEmpty(): CareerEntry {
  return {
    id: generateId(),
    companyName: '',
    department: '',
    position: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    jobDescription: '',
    salary: '',
    resignReason: '',
  }
}

interface CareerSectionProps {
  entries: CareerEntry[]
  onChange: (entries: CareerEntry[]) => void
}

export default function CareerSection({ entries, onChange }: CareerSectionProps) {
  return (
    <ArrayCrudSection
      title="경력"
      entries={entries}
      fields={fields}
      sortKey="startDate"
      createEmpty={createEmpty}
      onChange={onChange}
      transform={(value) => ({ ...value, endDate: value.isCurrent ? null : value.endDate })}
      summary={summarizeCareerEntry}
    />
  )
}
