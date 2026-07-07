import ArrayCrudSection from '../components/ArrayCrudSection'
import type { FieldConfig } from '../components/EntryForm'
import { generateId, summarizeEducationEntry, type EducationEntry } from '../../shared/schema'

const SCHOOL_TYPES = [
  '고등학교',
  '대학교(2,3년)',
  '대학교(4년)',
  '대학원(석사)',
  '대학원(박사)',
] as const

const STATUSES = ['졸업', '졸업예정', '재학', '휴학', '중퇴', '수료'] as const
const GPA_MAX = ['4.0', '4.3', '4.5', '100'] as const

export const fields: FieldConfig<EducationEntry>[] = [
  { key: 'schoolType', label: '학교 구분', type: 'select', options: SCHOOL_TYPES },
  { key: 'schoolName', label: '학교명', type: 'text', required: true },
  { key: 'major', label: '전공', type: 'text' },
  { key: 'subMajor', label: '복수/부전공', type: 'text' },
  { key: 'admissionDate', label: '입학일', type: 'month' },
  { key: 'graduationDate', label: '졸업일', type: 'month' },
  { key: 'status', label: '상태', type: 'select', options: STATUSES },
  { key: 'gpa', label: '학점', type: 'text' },
  { key: 'majorGpa', label: '전공학점', type: 'text' },
  { key: 'gpaMax', label: '학점 만점', type: 'select', options: GPA_MAX },
  { key: 'location', label: '지역', type: 'text' },
]

export function createEmpty(): EducationEntry {
  return {
    id: generateId(),
    schoolType: '대학교(4년)',
    schoolName: '',
    major: '',
    subMajor: '',
    admissionDate: '',
    graduationDate: '',
    status: '졸업',
    gpa: '',
    majorGpa: '',
    gpaMax: '4.5',
    location: '',
  }
}

interface EducationSectionProps {
  entries: EducationEntry[]
  onChange: (entries: EducationEntry[]) => void
}

export default function EducationSection({ entries, onChange }: EducationSectionProps) {
  return (
    <ArrayCrudSection
      title="학력"
      entries={entries}
      fields={fields}
      sortKey="graduationDate"
      createEmpty={createEmpty}
      onChange={onChange}
      summary={summarizeEducationEntry}
    />
  )
}
