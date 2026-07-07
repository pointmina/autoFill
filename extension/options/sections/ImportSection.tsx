import { useState, type ChangeEvent } from 'react'
import ImportReviewList from '../components/ImportReviewList'
import { extractTextFromFile } from '../extractText'
import { parseResumeText } from '../../shared/resumeParser'
import {
  generateId,
  summarizeAwardEntry,
  summarizeCareerEntry,
  summarizeCertificateEntry,
  summarizeEducationEntry,
  summarizeLanguageEntry,
  type AwardEntry,
  type BasicInfo,
  type CareerEntry,
  type CertificateEntry,
  type EducationEntry,
  type LanguageEntry,
  type Profile,
} from '../../shared/schema'
import { fields as educationFields, createEmpty as createEmptyEducation } from './EducationSection'
import { fields as certificateFields, createEmpty as createEmptyCertificate } from './CertificateSection'
import { fields as careerFields, createEmpty as createEmptyCareer } from './CareerSection'
import { fields as languageFields, createEmpty as createEmptyLanguage } from './LanguageSection'
import { fields as awardFields, createEmpty as createEmptyAward } from './AwardSection'

export interface ImportResult {
  basic: BasicInfo
  education: EducationEntry[]
  certificate: CertificateEntry[]
  career: CareerEntry[]
  language: LanguageEntry[]
  award: AwardEntry[]
}

interface DraftState {
  basic: BasicInfo
  education: EducationEntry[]
  certificate: CertificateEntry[]
  career: CareerEntry[]
  language: LanguageEntry[]
  award: AwardEntry[]
}

interface ImportSectionProps {
  profile: Profile
  onImport: (result: ImportResult) => Promise<void>
}

type Stage = 'idle' | 'parsing' | 'review'

export default function ImportSection({ profile, onImport }: ImportSectionProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [draft, setDraft] = useState<DraftState | null>(null)

  function updateBasicField<K extends keyof BasicInfo>(key: K, value: BasicInfo[K]) {
    setDraft((current) => (current ? { ...current, basic: { ...current.basic, [key]: value } } : current))
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = '' // 같은 파일을 다시 선택해도 onChange가 뜨도록 초기화
    if (!file) return

    setError('')
    setConfirmed(false)
    setStage('parsing')
    try {
      const text = await extractTextFromFile(file)
      const parsed = parseResumeText(text)
      setDraft({
        // 파서가 못 찾은 필드는 기존에 저장된 값을 그대로 유지한다(빈 값으로 덮어쓰지 않음).
        basic: { ...profile.basic, ...parsed.basic },
        education: parsed.education.map((entry) => ({ ...createEmptyEducation(), ...entry })),
        certificate: parsed.certificate.map((entry) => ({ ...createEmptyCertificate(), ...entry })),
        career: parsed.career.map((entry) => ({ ...createEmptyCareer(), ...entry })),
        language: parsed.language.map((entry) => ({ ...createEmptyLanguage(), ...entry })),
        award: parsed.award.map((entry) => ({ ...createEmptyAward(), ...entry })),
      })
      setStage('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 읽는 중 오류가 발생했습니다.')
      setStage('idle')
    }
  }

  function handleReset() {
    setDraft(null)
    setStage('idle')
    setError('')
  }

  async function handleConfirm() {
    if (!draft) return
    await onImport({
      basic: draft.basic,
      education: draft.education.map((entry) => ({ ...entry, id: generateId() })),
      certificate: draft.certificate.map((entry) => ({ ...entry, id: generateId() })),
      career: draft.career.map((entry) => ({ ...entry, id: generateId() })),
      language: draft.language.map((entry) => ({ ...entry, id: generateId() })),
      award: draft.award.map((entry) => ({ ...entry, id: generateId() })),
    })
    setDraft(null)
    setStage('idle')
    setConfirmed(true)
  }

  return (
    <div className="section-form">
      <p className="import-disclaimer">
        이력서 파일(txt, pdf, docx)을 업로드하면 자동으로 정보를 추출합니다. 추출 결과는 정확하지
        않을 수 있으니, 아래에서 반드시 확인·수정한 뒤 "프로필에 반영"을 눌러야 저장됩니다.
      </p>

      {stage !== 'review' && (
        <div className="import-dropzone">
          <input type="file" accept=".txt,.pdf,.docx" onChange={handleFileChange} disabled={stage === 'parsing'} />
          {stage === 'parsing' && <p className="empty-hint">파일을 분석하는 중...</p>}
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
      {confirmed && <p className="saved-indicator">프로필에 반영되었습니다.</p>}

      {stage === 'review' && draft && (
        <>
          <div className="array-section">
            <div className="array-section-header">
              <h2>기본정보</h2>
            </div>
            <div className="field-grid">
              <label>
                이름
                <input value={draft.basic.name} onChange={(e) => updateBasicField('name', e.target.value)} />
              </label>
              <label>
                영문명
                <input value={draft.basic.nameEn} onChange={(e) => updateBasicField('nameEn', e.target.value)} />
              </label>
              <label>
                한자이름
                <input
                  value={draft.basic.nameHanja}
                  onChange={(e) => updateBasicField('nameHanja', e.target.value)}
                />
              </label>
              <label>
                생년월일
                <input
                  type="date"
                  value={draft.basic.birthDate}
                  onChange={(e) => updateBasicField('birthDate', e.target.value)}
                />
              </label>
              <label>
                성별
                <select
                  value={draft.basic.gender}
                  onChange={(e) => updateBasicField('gender', e.target.value as BasicInfo['gender'])}
                >
                  <option value="none">선택 안 함</option>
                  <option value="female">여성</option>
                  <option value="male">남성</option>
                </select>
              </label>
              <label>
                이메일
                <input value={draft.basic.email} onChange={(e) => updateBasicField('email', e.target.value)} />
              </label>
              <label>
                전화번호
                <input value={draft.basic.phone} onChange={(e) => updateBasicField('phone', e.target.value)} />
              </label>
              <label>
                우편번호
                <input
                  value={draft.basic.postalCode}
                  onChange={(e) => updateBasicField('postalCode', e.target.value)}
                />
              </label>
              <label className="field-wide">
                주소
                <input value={draft.basic.address} onChange={(e) => updateBasicField('address', e.target.value)} />
              </label>
              <label className="field-wide">
                상세주소
                <input
                  value={draft.basic.addressDetail}
                  onChange={(e) => updateBasicField('addressDetail', e.target.value)}
                />
              </label>
            </div>
          </div>

          <ImportReviewList
            title="학력"
            drafts={draft.education}
            fields={educationFields}
            createEmpty={createEmptyEducation}
            summary={summarizeEducationEntry}
            onChange={(education) => setDraft({ ...draft, education })}
          />
          <ImportReviewList
            title="자격증"
            drafts={draft.certificate}
            fields={certificateFields}
            createEmpty={createEmptyCertificate}
            summary={summarizeCertificateEntry}
            onChange={(certificate) => setDraft({ ...draft, certificate })}
          />
          <ImportReviewList
            title="경력"
            drafts={draft.career}
            fields={careerFields}
            createEmpty={createEmptyCareer}
            summary={summarizeCareerEntry}
            onChange={(career) => setDraft({ ...draft, career })}
          />
          <ImportReviewList
            title="어학"
            drafts={draft.language}
            fields={languageFields}
            createEmpty={createEmptyLanguage}
            summary={summarizeLanguageEntry}
            onChange={(language) => setDraft({ ...draft, language })}
          />
          <ImportReviewList
            title="수상"
            drafts={draft.award}
            fields={awardFields}
            createEmpty={createEmptyAward}
            summary={summarizeAwardEntry}
            onChange={(award) => setDraft({ ...draft, award })}
          />

          <div className="form-actions">
            <button type="button" onClick={handleConfirm}>
              프로필에 반영
            </button>
            <button type="button" className="btn-secondary" onClick={handleReset}>
              취소
            </button>
          </div>
        </>
      )}
    </div>
  )
}
