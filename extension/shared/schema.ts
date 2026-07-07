export interface BasicInfo {
  name: string
  nameEn: string
  nameHanja: string
  birthDate: string
  gender: 'female' | 'male' | 'none'
  email: string
  phone: string
  address: string
  addressDetail: string
  postalCode: string
}

export type SchoolType =
  | '고등학교'
  | '대학교(2,3년)'
  | '대학교(4년)'
  | '대학원(석사)'
  | '대학원(박사)'

export type EducationStatus = '졸업' | '졸업예정' | '재학' | '휴학' | '중퇴' | '수료'

export type GpaMax = '4.0' | '4.3' | '4.5' | '100'

export interface EducationEntry {
  id: string
  schoolType: SchoolType
  schoolName: string
  major: string
  subMajor?: string
  admissionDate: string
  graduationDate: string
  status: EducationStatus
  gpa: string
  majorGpa?: string
  gpaMax: GpaMax
  location?: string
}

export interface CertificateEntry {
  id: string
  name: string
  issuer: string
  acquiredDate: string
  certNumber?: string
  expiryDate?: string
}

export interface CareerEntry {
  id: string
  companyName: string
  department: string
  position: string
  startDate: string
  endDate: string | null
  isCurrent: boolean
  jobDescription: string
  salary?: string
  resignReason?: string
}

export type LanguageTestName =
  | 'TOEIC'
  | 'TOEIC Speaking'
  | 'OPIc'
  | 'TOEFL'
  | 'JLPT'
  | 'HSK'
  | '기타'

export type LanguageName = '영어' | '일본어' | '중국어' | '기타'

export interface LanguageEntry {
  id: string
  testName: LanguageTestName
  language: LanguageName
  score: string
  acquiredDate: string
  expiryDate?: string
  registrationNumber?: string
}

export interface AwardEntry {
  id: string
  title: string
  issuer: string
  awardDate: string
  description?: string
}

export interface Profile {
  basic: BasicInfo
  education: EducationEntry[]
  certificate: CertificateEntry[]
  career: CareerEntry[]
  language: LanguageEntry[]
  award: AwardEntry[]
}

export interface Settings {
  highlightFilledFields: boolean
}

export interface StorageSchema {
  version: 1
  profile: Profile
  settings: Settings
}

export const CURRENT_SCHEMA_VERSION = 1 as const

export function generateId(): string {
  return crypto.randomUUID()
}

export function createEmptyBasicInfo(): BasicInfo {
  return {
    name: '',
    nameEn: '',
    nameHanja: '',
    birthDate: '',
    gender: 'none',
    email: '',
    phone: '',
    address: '',
    addressDetail: '',
    postalCode: '',
  }
}

export function createEmptyProfile(): Profile {
  return {
    basic: createEmptyBasicInfo(),
    education: [],
    certificate: [],
    career: [],
    language: [],
    award: [],
  }
}

export const DEFAULT_SETTINGS: Settings = {
  highlightFilledFields: true,
}

export function createEmptyStorageSchema(): StorageSchema {
  return {
    version: CURRENT_SCHEMA_VERSION,
    profile: createEmptyProfile(),
    settings: { ...DEFAULT_SETTINGS },
  }
}

export type ArraySectionKey = 'education' | 'certificate' | 'career' | 'language' | 'award'
export type SectionKey = keyof Profile

// DOM 라벨(matcher.ts), 값/옵션 텍스트(filler.ts), 이력서 텍스트(resumeParser.ts) 매칭이 전부
// 같은 정규화 규칙을 써야 서로 다른 매칭 결과로 드리프트하지 않는다.
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s():·,\-.]/g, '')
}

// 필드/텍스트 조상(또는 이력서 텍스트의 한 줄)에서 이 키워드를 발견하면 해당 섹션 영역으로 간주한다.
// DOM 매처(content/matcher.ts)와 이력서 텍스트 파서(shared/resumeParser.ts)가 같은 목록을 공유해야
// 서로 다른 섹션 키워드로 드리프트하지 않는다.
export const SECTION_HEADINGS: Record<SectionKey, string[]> = {
  basic: ['기본정보', '개인정보', '인적사항', 'basic info', 'profile', 'personal information'],
  education: ['학력', '학력사항', 'education'],
  certificate: ['자격증', '자격증사항', '자격사항', 'certificate', 'certification', 'certifications', 'license'],
  career: ['경력', '경력사항', '근무경력', 'career', 'experience', 'work experience', 'employment'],
  language: ['어학', '어학사항', '외국어', 'language', 'languages'],
  award: ['수상', '수상경력', '수상내역', 'award', 'awards', 'honor', 'honors'],
}

// 항목 목록/오버레이 어디서든 "가장 최근 항목"의 정의가 같아야 하므로(F-20) 정렬 기준을 한 곳에 둔다.
export function sortEntriesByKeyDesc<T>(entries: T[], sortKey: keyof T): T[] {
  return [...entries].sort((a, b) => {
    const av = String(a[sortKey] ?? '')
    const bv = String(b[sortKey] ?? '')
    return bv.localeCompare(av)
  })
}

export interface EntrySummary {
  title: string
  subtitle?: string
}

export function summarizeEducationEntry(entry: EducationEntry): EntrySummary {
  return {
    title: `${entry.schoolName} ${entry.major}`.trim() || '학력 항목',
    subtitle: `${entry.admissionDate} ~ ${entry.graduationDate} · ${entry.status}`,
  }
}

export function summarizeCertificateEntry(entry: CertificateEntry): EntrySummary {
  return { title: entry.name || '자격증 항목', subtitle: `${entry.issuer} · ${entry.acquiredDate}` }
}

export function summarizeCareerEntry(entry: CareerEntry): EntrySummary {
  return {
    title: `${entry.companyName} · ${entry.position}`.trim() || '경력 항목',
    subtitle: `${entry.startDate} ~ ${entry.isCurrent ? '재직 중' : entry.endDate ?? ''}`,
  }
}

export function summarizeLanguageEntry(entry: LanguageEntry): EntrySummary {
  return {
    title: `${entry.testName} ${entry.score}`.trim() || '어학 항목',
    subtitle: `${entry.language} · ${entry.acquiredDate}`,
  }
}

export function summarizeAwardEntry(entry: AwardEntry): EntrySummary {
  return { title: entry.title || '수상 항목', subtitle: `${entry.issuer} · ${entry.awardDate}` }
}

// content script(overlay.ts)는 배열 섹션 키만 가지고 있고 구체 타입을 모르므로 쓰는 디스패처.
export function summarizeArrayEntry(section: ArraySectionKey, entry: Record<string, unknown>): EntrySummary {
  switch (section) {
    case 'education':
      return summarizeEducationEntry(entry as unknown as EducationEntry)
    case 'certificate':
      return summarizeCertificateEntry(entry as unknown as CertificateEntry)
    case 'career':
      return summarizeCareerEntry(entry as unknown as CareerEntry)
    case 'language':
      return summarizeLanguageEntry(entry as unknown as LanguageEntry)
    case 'award':
      return summarizeAwardEntry(entry as unknown as AwardEntry)
  }
}
