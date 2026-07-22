import {
  normalizeText,
  SECTION_HEADINGS,
  type ArraySectionKey,
  type AwardEntry,
  type BasicInfo,
  type CareerEntry,
  type CertificateEntry,
  type EducationEntry,
  type LanguageEntry,
  type SectionKey,
} from './schema'
import dictionaryData from './dictionary.ko.json'
import valueAliasesData from './valueAliases.ko.json'

type SynonymDictionary = Record<string, string[]>
type ValueAliases = Record<string, Record<string, string[]>>

const dictionary = dictionaryData as SynonymDictionary
const valueAliases = valueAliasesData as ValueAliases

export interface ParsedResumeDraft {
  basic: Partial<BasicInfo>
  education: Partial<EducationEntry>[]
  certificate: Partial<CertificateEntry>[]
  career: Partial<CareerEntry>[]
  language: Partial<LanguageEntry>[]
  award: Partial<AwardEntry>[]
}

// 이 파서는 최선 추정치일 뿐이다 — 이력서는 형식이 제각각이라 완벽할 수 없다. 특히:
//  - 날짜 범위가 없는 서술형 이력서, "2020년 3월"처럼 정규식이 못 잡는 날짜 표기는 놓친다.
//  - PDF에서 추출한 텍스트는 시각적 열 순서가 아니라 텍스트 런 순서로 이어붙여지므로 표/다단
//    레이아웃에서는 라벨과 값이 뒤섞일 수 있다.
//  - "제목류" 필드(학교명/회사명 등)의 최후 추정(청크의 첫 줄)은 틀릴 수 있다.
//  - 마크다운 이력서(노션/README 스타일)에서 같은 제목 레벨(예: ###)을 항목 구분과 항목 내부
//    소제목(예: 학교 아래의 "전공"/"졸업요건") 둘 다에 쓰면, 이 둘을 구조만으로 구분할 수 없어
//    소제목이 별도 항목으로 잘못 분리될 수 있다.
// 그래서 옵션 페이지의 검토 화면은 이 결과를 그대로 저장하지 않고 사용자가 확인/수정하게 한다.

const LABEL_VALUE_LINE = /^(.{1,20}?)\s*[:：]\s*(.+)$/
const DATE_RANGE = /(\d{4}[.\-/]\d{1,2})\s*[~\-]\s*(\d{4}[.\-/]\d{1,2}|현재|재직\s*중)/
const SINGLE_DATE = /\d{4}[.\-/]\d{1,2}(?:[.\-/]\d{1,2})?/
const MARKDOWN_HEADING = /^(#{1,6})\s+(.*)$/
const MARKDOWN_BULLET = /^\s*[-*+]\s+/
const MARKDOWN_RULE = /^(-{3,}|\*{3,}|_{3,})\s*$/
const MARKDOWN_EMPHASIS = /\*\*(.+?)\*\*|__(.+?)__/g

interface Line {
  text: string
  // "#"~"######" 마크다운 제목이면 그 레벨(1~6), 아니면 null. 항목 경계 추정에 쓰인다.
  headingLevel: number | null
}

// 마크다운 문법을 최대한 이해하고 정제한다 — 노션/README로 관리하는 이력서가 드물지 않다.
// 제목(#), 글머리 기호(-/*/+), 굵게(**...**) 표시를 제거해서 이후 라벨:값/제목 매칭이
// 그 아래 "실제 텍스트"만 보게 한다. 수평선(---)은 빈 줄과 동일하게 문단 구분자로 취급한다.
function preprocessLines(rawLines: string[]): Line[] {
  return rawLines.map((raw) => {
    const headingMatch = raw.match(MARKDOWN_HEADING)
    if (headingMatch) {
      return { text: stripEmphasis(headingMatch[2]).trim(), headingLevel: headingMatch[1].length }
    }
    if (MARKDOWN_RULE.test(raw.trim())) {
      return { text: '', headingLevel: null }
    }
    const withoutBullet = raw.replace(MARKDOWN_BULLET, '')
    return { text: stripEmphasis(withoutBullet), headingLevel: null }
  })
}

function stripEmphasis(text: string): string {
  return text.replace(MARKDOWN_EMPHASIS, (_, a, b) => a ?? b ?? '')
}

const RANGE_DATE_FIELDS: Partial<Record<ArraySectionKey, { start: string; end: string }>> = {
  education: { start: 'admissionDate', end: 'graduationDate' },
  career: { start: 'startDate', end: 'endDate' },
}

const SINGLE_DATE_FIELD: Partial<Record<ArraySectionKey, string>> = {
  certificate: 'acquiredDate',
  language: 'acquiredDate',
  award: 'awardDate',
}

// 청크에서 라벨:값으로도, enum 값으로도 못 찾았을 때 "첫 줄 = 제목"으로 추정할 필드.
// language는 testName/language가 둘 다 enum이라 마땅한 자유 텍스트 제목이 없어 제외한다.
const TITLE_FIELD_BY_SECTION: Partial<Record<ArraySectionKey, string>> = {
  education: 'schoolName',
  career: 'companyName',
  certificate: 'name',
  award: 'title',
}

function splitIntoLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

// 선행 이모지/기호(🎓, ▶, # 등)를 뗀 앞부분만 남긴다 — 제목 앞 장식 문자를 무시하고 "진짜 제목
// 단어"만 비교하기 위한 것.
function stripLeadingDecoration(normalized: string): string {
  return normalized.replace(/^[^\p{L}\p{N}]+/u, '')
}

// 줄이 명시적 마크다운 제목(#)이거나, 12자 이하로 짧으면 "제목 후보"로 본다(예: "▶ 경력").
// 후보 줄은 (장식 문자를 뗀) 접두 일치로만 섹션을 판정한다 — 임의 위치 부분일치를 허용하면
// "한국외국어대학교"(8자라 후보 조건을 만족)처럼 짧은 고유명사가 우연히 키워드 "외국어"를
// 중간에 포함한다는 이유만으로 language 섹션으로 오인될 수 있다. 접두 일치는 "한국..."으로
// 시작하니 "외국어"로는 시작하지 않아 이 오탐을 막아준다. 마크다운 제목은 "🎓 Education"처럼
// 장식 문자 때문에 12자를 넘기기 쉬워서 길이 제한 없이 후보로 인정한다.
function splitIntoSectionBlocks(lines: Line[]): Record<SectionKey, Line[]> {
  const blocks: Record<SectionKey, Line[]> = {
    basic: [],
    education: [],
    certificate: [],
    career: [],
    language: [],
    award: [],
  }
  const headingEntries = Object.entries(SECTION_HEADINGS) as [SectionKey, string[]][]

  let current: SectionKey = 'basic'
  for (const line of lines) {
    const trimmed = line.text.trim()
    const normalized = normalizeText(trimmed)
    const isCandidate = normalized && (line.headingLevel !== null || trimmed.length <= 12)
    if (isCandidate) {
      const core = stripLeadingDecoration(normalized)
      const heading = headingEntries.find(([, keywords]) =>
        keywords.some((keyword) => {
          const normalizedKeyword = normalizeText(keyword)
          return core === normalizedKeyword || core.startsWith(normalizedKeyword)
        }),
      )
      if (heading) {
        current = heading[0]
        continue
      }
    }
    blocks[current].push(line)
  }
  return blocks
}

function findFieldKeyForLabel(label: string, scope: SectionKey): string | null {
  const normalizedLabel = normalizeText(label)
  if (!normalizedLabel) return null
  const prefix = `${scope}.`
  for (const [dictKey, synonyms] of Object.entries(dictionary)) {
    if (!dictKey.startsWith(prefix)) continue
    if (synonyms.some((synonym) => normalizeText(synonym) === normalizedLabel)) {
      return dictKey.slice(prefix.length)
    }
  }
  return null
}

// "여성"→"female", "토익"→"TOEIC"처럼 라벨:값으로 잡은 원문을 정규 enum 값으로 바꾼다.
// 해당 필드가 enum이 아니면(예: 이름, 이메일) 원문을 그대로 둔다.
function canonicalizeEnumValue(scope: SectionKey, fieldKey: string, rawValue: string): string {
  const table = valueAliases[`${scope}.${fieldKey}`]
  if (!table) return rawValue
  const normalizedRaw = normalizeText(rawValue)
  for (const [canonical, aliases] of Object.entries(table)) {
    if (aliases.some((alias) => normalizeText(alias) === normalizedRaw)) return canonical
  }
  return rawValue
}

// "certification date"처럼 명시적 라벨:값으로 잡힌 날짜도, 정규식 보완으로 채운 날짜와 같은
// YYYY-MM-DD 형식으로 맞춘다 — 스키마 저장 형식과 어긋나면 옵션 페이지의 date/month input에
// 그대로 못 들어간다.
function isDateFieldKey(fieldKey: string): boolean {
  return fieldKey.toLowerCase().endsWith('date')
}

function extractLabelValues(lines: string[], scope: SectionKey): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of lines) {
    const match = line.match(LABEL_VALUE_LINE)
    if (!match) continue
    const fieldKey = findFieldKeyForLabel(match[1], scope)
    if (!fieldKey || result[fieldKey] !== undefined) continue
    const rawValue = match[2].trim()
    if (!rawValue) continue
    const value = isDateFieldKey(fieldKey) ? normalizeDateToken(rawValue) : rawValue
    result[fieldKey] = canonicalizeEnumValue(scope, fieldKey, value)
  }
  return result
}

function splitByBlankLines(lines: string[]): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) chunks.push(current)
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

// 노션/README 스타일 이력서는 항목마다 마크다운 제목을 붙이고, 그 아래 필드를 빈 줄 하나
// 띄우고 적는 경우가 흔하다("### 회사명\n\n* 입사일 : ..."). 이럴 때 빈 줄 기준 분할을 쓰면
// "제목만 있는 청크"와 "본문만 있는 청크"로 쪼개져서 항목 하나가 둘로 갈라진다. 제목이 하나라도
// 있으면 빈 줄은 무시하고 제목 자체를 항목 경계로 쓴다 — 같은 레벨의 제목을 항목 내부 소제목
// (예: 학교 아래의 "전공")으로 쓰는 문서는 여전히 과분할될 수 있는데, 이건 구조만으로는 풀 수
// 없는 모호함이라 검토 화면에서 사용자가 정리하는 걸 전제로 한다.
function splitByMarkdownHeading(lines: Line[]): Line[][] | null {
  if (!lines.some((line) => line.headingLevel !== null)) return null

  const chunks: Line[][] = []
  let current: Line[] = []
  let seenHeading = false
  for (const line of lines) {
    if (line.headingLevel !== null) {
      if (current.length > 0) chunks.push(current)
      current = []
      seenHeading = true
    } else if (!seenHeading) {
      // 첫 제목을 만나기 전의 서두(전체 소개 문장 등)는 어느 항목에도 속하지 않으므로 버린다 —
      // 그대로 두면 별도 청크로 분리돼 제목류(회사명/학교명 등) 최후 추정에서 가짜 항목이 된다.
      continue
    }
    current.push(line)
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

// education/career는 항목마다 날짜 "범위"(입학~졸업, 입사~퇴사)가 있다는 걸 이용해서, 빈 줄
// 구분이 없는 촘촘한 텍스트에서도 항목 경계를 추정한다. 날짜 범위 줄 바로 위 한 줄을 그 항목의
// "제목"(학교명/회사명)으로 보고 포함시킨다 — 흔한 이력서 레이아웃 관례에 기댄 근사치다.
// 앵커가 2개 미만이면(항목을 나눌 근거가 부족하면) null을 반환해서 빈 줄 분할로 대체하게 한다.
function splitByDateRangeAnchor(lines: string[]): string[][] | null {
  const anchorIdx: number[] = []
  lines.forEach((line, i) => {
    if (DATE_RANGE.test(line)) anchorIdx.push(i)
  })
  if (anchorIdx.length < 2) return null

  return anchorIdx.map((idx, a) => {
    const prevBound = a === 0 ? 0 : anchorIdx[a - 1] + 1
    const start = Math.max(idx - 1, prevBound)
    const end = a === anchorIdx.length - 1 ? lines.length : anchorIdx[a + 1] - 1
    return lines.slice(start, Math.max(end, start + 1))
  })
}

function normalizeDateToken(token: string): string {
  const match = token.match(/(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?/)
  if (!match) return token
  const [, year, month, day] = match
  const parts = [year, month.padStart(2, '0')]
  if (day) parts.push(day.padStart(2, '0'))
  return parts.join('-')
}

function applyDates(values: Record<string, string>, chunkText: string, section: ArraySectionKey) {
  const rangeFields = RANGE_DATE_FIELDS[section]
  if (rangeFields) {
    const match = chunkText.match(DATE_RANGE)
    if (!match) return
    if (values[rangeFields.start] === undefined) values[rangeFields.start] = normalizeDateToken(match[1])
    const endToken = match[2]
    if (endToken === '현재' || normalizeText(endToken) === '재직중') {
      if (section === 'career') values.isCurrent = 'true'
    } else if (values[rangeFields.end] === undefined) {
      values[rangeFields.end] = normalizeDateToken(endToken)
    }
    return
  }

  const singleField = SINGLE_DATE_FIELD[section]
  if (!singleField || values[singleField] !== undefined) return
  const match = chunkText.match(SINGLE_DATE)
  if (match) values[singleField] = normalizeDateToken(match[0])
}

// 숫자로만 된 별칭(예: 학점만점 "4.3"→정규화 후 "43")은 normalizeText가 소수점을 지워버려서
// "3.43"(→"343") 같은 무관한 숫자열 안에 우연히 포함될 수 있다. 그런 별칭은 앞뒤가 숫자가 아닌
// "독립된 숫자열"일 때만 인정한다 — 문자로 된 별칭은 기존처럼 부분일치를 허용한다.
function containsAlias(normalizedChunkText: string, normalizedAlias: string): boolean {
  if (!normalizedAlias) return false
  if (/^\d+$/.test(normalizedAlias)) {
    return new RegExp(`(?<!\\d)${normalizedAlias}(?!\\d)`).test(normalizedChunkText)
  }
  return normalizedChunkText.includes(normalizedAlias)
}

// 라벨:값으로 못 찾은 enum 필드(학교구분/재학상태/재직여부/시험명 등)를 청크 전체 텍스트에서
// 부분일치로 탐지한다 — "고려대학교 컴퓨터공학과 졸업"처럼 "상태: 졸업" 같은 명시적 라벨 없이
// 단어만 섞여 있는 경우를 대응하기 위함.
function applyEnumDetection(values: Record<string, string>, normalizedChunkText: string, section: ArraySectionKey) {
  const prefix = `${section}.`
  for (const [dictKey, table] of Object.entries(valueAliases)) {
    if (!dictKey.startsWith(prefix)) continue
    const fieldKey = dictKey.slice(prefix.length)
    if (values[fieldKey] !== undefined) continue
    for (const [canonical, aliases] of Object.entries(table)) {
      if (aliases.some((alias) => containsAlias(normalizedChunkText, normalizeText(alias)))) {
        values[fieldKey] = canonical
        break
      }
    }
  }
}

function applyTitleFallback(values: Record<string, string>, chunkLines: string[], section: ArraySectionKey) {
  const titleField = TITLE_FIELD_BY_SECTION[section]
  if (!titleField || values[titleField] !== undefined) return
  const candidate = chunkLines
    .map((line) => line.trim())
    .find((line) => line && !LABEL_VALUE_LINE.test(line) && !DATE_RANGE.test(line) && !SINGLE_DATE.test(line))
  if (candidate) values[titleField] = candidate
}

function finalizeEntryValues(section: ArraySectionKey, values: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...values }
  if (section === 'career' && 'isCurrent' in result) {
    result.isCurrent = result.isCurrent === 'true'
  }
  return result
}

function parseEntryChunk(chunkLines: string[], section: ArraySectionKey): Record<string, unknown> {
  const values = extractLabelValues(chunkLines, section)
  const chunkText = chunkLines.join(' ')

  applyEnumDetection(values, normalizeText(chunkText), section)
  applyDates(values, chunkText, section)
  applyTitleFallback(values, chunkLines, section)

  return finalizeEntryValues(section, values)
}

// 마크다운 제목이 하나라도 있으면 그걸 항목 경계로 쓰고(노션/README 스타일), 없으면 기존처럼
// education/career는 날짜 범위 앵커, 그 외는 빈 줄로 나눈다.
function parseArraySection(lines: Line[], section: ArraySectionKey): Record<string, unknown>[] {
  const headingChunks = splitByMarkdownHeading(lines)
  const chunks =
    headingChunks?.map((chunk) => chunk.map((line) => line.text)) ??
    (section === 'education' || section === 'career'
      ? splitByDateRangeAnchor(lines.map((line) => line.text))
      : null) ??
    splitByBlankLines(lines.map((line) => line.text))

  return chunks.map((chunk) => parseEntryChunk(chunk, section)).filter((entry) => Object.keys(entry).length > 0)
}

export function parseResumeText(text: string): ParsedResumeDraft {
  const blocks = splitIntoSectionBlocks(preprocessLines(splitIntoLines(text)))

  return {
    basic: extractLabelValues(blocks.basic.map((line) => line.text), 'basic') as Partial<BasicInfo>,
    education: parseArraySection(blocks.education, 'education') as Partial<EducationEntry>[],
    certificate: parseArraySection(blocks.certificate, 'certificate') as Partial<CertificateEntry>[],
    career: parseArraySection(blocks.career, 'career') as Partial<CareerEntry>[],
    language: parseArraySection(blocks.language, 'language') as Partial<LanguageEntry>[],
    award: parseArraySection(blocks.award, 'award') as Partial<AwardEntry>[],
  }
}
