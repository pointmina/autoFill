import { useEffect, useState } from 'react'
import './options.css'
import { clearStorage, loadStorage, saveProfile } from '../shared/storage'
import { createEmptyProfile, type BasicInfo, type Profile } from '../shared/schema'
import BasicSection from './sections/BasicSection'
import EducationSection from './sections/EducationSection'
import CertificateSection from './sections/CertificateSection'
import CareerSection from './sections/CareerSection'
import LanguageSection from './sections/LanguageSection'
import AwardSection from './sections/AwardSection'
import ImportSection, { type ImportResult } from './sections/ImportSection'

const SECTIONS = [
  { key: 'basic', label: '기본정보' },
  { key: 'education', label: '학력' },
  { key: 'certificate', label: '자격증' },
  { key: 'career', label: '경력' },
  { key: 'language', label: '어학' },
  { key: 'award', label: '수상' },
  { key: 'import', label: '가져오기' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeSection, setActiveSection] = useState<SectionKey>('basic')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    loadStorage().then((data) => setProfile(data.profile))
  }, [])

  async function handleDeleteAll() {
    await clearStorage()
    setProfile(createEmptyProfile())
    setConfirmingDelete(false)
  }

  async function handleSaveBasic(basic: BasicInfo) {
    if (!profile) return
    const updated: Profile = { ...profile, basic }
    await saveProfile(updated)
    setProfile(updated)
  }

  async function updateSection<K extends keyof Profile>(key: K, value: Profile[K]) {
    if (!profile) return
    const updated: Profile = { ...profile, [key]: value }
    await saveProfile(updated)
    setProfile(updated)
  }

  // 기본정보 + 5개 배열 섹션을 한 번에 반영한다 — 섹션별로 여러 번 나눠서 저장하면, saveProfile이
  // 매번 전체 프로필을 통째로 덮어써서 앞서 반영한 섹션이 뒤 호출에서 사라질 수 있다(스토리지에
  // 부분 병합이 없음). 가져오기는 반드시 하나의 원자적 업데이트로 처리한다.
  async function handleImport(result: ImportResult) {
    if (!profile) return
    const updated: Profile = {
      basic: result.basic,
      education: [...profile.education, ...result.education],
      certificate: [...profile.certificate, ...result.certificate],
      career: [...profile.career, ...result.career],
      language: [...profile.language, ...result.language],
      award: [...profile.award, ...result.award],
    }
    await saveProfile(updated)
    setProfile(updated)
  }

  return (
    <div className="options">
      <div className="options-header">
        <h1>내 정보 입력</h1>

        {confirmingDelete ? (
          <div className="delete-confirm">
            <span>정말 모든 정보를 삭제할까요? 되돌릴 수 없습니다.</span>
            <button type="button" className="btn-danger" onClick={handleDeleteAll}>
              삭제 확인
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirmingDelete(false)}>
              취소
            </button>
          </div>
        ) : (
          <button type="button" className="btn-danger-outline" onClick={() => setConfirmingDelete(true)}>
            전체 삭제
          </button>
        )}
      </div>

      <nav className="tab-bar">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={section.key === activeSection ? 'tab tab-active' : 'tab'}
            onClick={() => setActiveSection(section.key)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {!profile ? (
        <p>불러오는 중...</p>
      ) : (
        <>
          {activeSection === 'basic' && (
            <BasicSection value={profile.basic} onSave={handleSaveBasic} />
          )}
          {activeSection === 'education' && (
            <EducationSection
              entries={profile.education}
              onChange={(entries) => updateSection('education', entries)}
            />
          )}
          {activeSection === 'certificate' && (
            <CertificateSection
              entries={profile.certificate}
              onChange={(entries) => updateSection('certificate', entries)}
            />
          )}
          {activeSection === 'career' && (
            <CareerSection
              entries={profile.career}
              onChange={(entries) => updateSection('career', entries)}
            />
          )}
          {activeSection === 'language' && (
            <LanguageSection
              entries={profile.language}
              onChange={(entries) => updateSection('language', entries)}
            />
          )}
          {activeSection === 'award' && (
            <AwardSection
              entries={profile.award}
              onChange={(entries) => updateSection('award', entries)}
            />
          )}
          {activeSection === 'import' && <ImportSection profile={profile} onImport={handleImport} />}
        </>
      )}
    </div>
  )
}
