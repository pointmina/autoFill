import ArrayCrudSection from '../components/ArrayCrudSection'
import type { FieldConfig } from '../components/EntryForm'
import { generateId, summarizeLanguageEntry, type LanguageEntry } from '../../shared/schema'

const TEST_NAMES = ['TOEIC', 'TOEIC Speaking', 'OPIc', 'TOEFL', 'JLPT', 'HSK', '기타'] as const
const LANGUAGES = ['영어', '일본어', '중국어', '기타'] as const

export const fields: FieldConfig<LanguageEntry>[] = [
  { key: 'testName', label: '시험명', type: 'select', options: TEST_NAMES },
  { key: 'language', label: '언어', type: 'select', options: LANGUAGES },
  { key: 'score', label: '점수/등급', type: 'text' },
  { key: 'acquiredDate', label: '취득일', type: 'date' },
  { key: 'expiryDate', label: '만료일', type: 'date' },
  { key: 'registrationNumber', label: '등록번호', type: 'text' },
]

export function createEmpty(): LanguageEntry {
  return {
    id: generateId(),
    testName: 'TOEIC',
    language: '영어',
    score: '',
    acquiredDate: '',
    expiryDate: '',
    registrationNumber: '',
  }
}

interface LanguageSectionProps {
  entries: LanguageEntry[]
  onChange: (entries: LanguageEntry[]) => void
}

export default function LanguageSection({ entries, onChange }: LanguageSectionProps) {
  return (
    <ArrayCrudSection
      title="어학"
      entries={entries}
      fields={fields}
      sortKey="acquiredDate"
      createEmpty={createEmpty}
      onChange={onChange}
      summary={summarizeLanguageEntry}
    />
  )
}
