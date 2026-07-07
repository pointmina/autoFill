import type { FieldElement } from './scanner'
import type { FieldMatch } from './matcher'
import { normalizeText, sortEntriesByKeyDesc, type ArraySectionKey, type Profile } from '../shared/schema'
import valueAliasesData from '../shared/valueAliases.ko.json'

type ValueAliases = Record<string, Record<string, string[]>>

const valueAliases = valueAliasesData as ValueAliases

export type FillStatus = 'filled' | 'skipped' | 'unmatched'

export interface FillResult {
  match: FieldMatch
  status: FillStatus
  reason?: string
  // 배열형 섹션 필드가 어떤 항목(entry)의 값으로 채워졌는지. overlay의 교체 UI(F-21)가
  // "같은 항목에서 나온 필드들"을 하나의 그룹으로 묶을 때 사용한다.
  entryId?: string
}

export type { ArraySectionKey }

// 배열형 섹션에서 폼에 슬롯이 하나뿐일 때 기본으로 넣을 "최신 항목"을 고르는 기준 (F-20).
const ARRAY_SORT_KEY: Record<ArraySectionKey, string> = {
  education: 'graduationDate',
  certificate: 'acquiredDate',
  career: 'startDate',
  language: 'acquiredDate',
  award: 'awardDate',
}

const SIMILARITY_THRESHOLD = 0.3

export function getEntries(profile: Profile, section: ArraySectionKey): Record<string, unknown>[] {
  return profile[section] as unknown as Record<string, unknown>[]
}

function getLatestEntry(entries: Record<string, unknown>[], sortKey: string): Record<string, unknown> | null {
  if (entries.length === 0) return null
  return sortEntriesByKeyDesc(entries, sortKey)[0]
}

function resolveField(match: FieldMatch, profile: Profile): { value: unknown; entryId?: string } {
  if (!match.section || !match.key) return { value: undefined }

  if (match.section === 'basic') {
    return { value: (profile.basic as unknown as Record<string, unknown>)[match.key] }
  }

  const section = match.section as ArraySectionKey
  const latest = getLatestEntry(getEntries(profile, section), ARRAY_SORT_KEY[section])
  if (!latest) return { value: undefined }
  return { value: latest[match.key], entryId: String(latest.id) }
}

function getAliases(match: FieldMatch, canonicalValue: string): string[] {
  const table = valueAliases[`${match.section}.${match.key}`]
  const aliases = table?.[canonicalValue]
  return aliases && aliases.length > 0 ? aliases : [canonicalValue]
}

function bigrams(text: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2))
  return set
}

function bigramSimilarity(a: string, b: string): number {
  const setA = bigrams(a)
  const setB = bigrams(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const gram of setA) if (setB.has(gram)) intersection++
  return intersection / Math.max(setA.size, setB.size)
}

// 완전일치 > 포함관계 > 자모 겹침 기반 유사도. "4년제 대학교" ↔ "대학교(4년)" 처럼 어순이
// 달라 포함관계로는 안 잡히는 경우까지 대응한다 (F-13 드롭다운 텍스트 유사도 매칭).
function scoreAgainstAliases(text: string, aliases: string[]): number {
  const normText = normalizeText(text)
  if (!normText) return 0

  let best = 0
  for (const alias of aliases) {
    const normAlias = normalizeText(alias)
    if (!normAlias) continue
    if (normText === normAlias) return 1
    if (normText.includes(normAlias) || normAlias.includes(normText)) {
      best = Math.max(best, 0.9)
      continue
    }
    best = Math.max(best, bigramSimilarity(normText, normAlias))
  }
  return best
}

function setNativeValue(element: FieldElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype

  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(element, value)

  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setNativeChecked(element: HTMLInputElement, checked: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
  setter?.call(element, checked)

  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

interface DateFormatSpec {
  yearDigits: 2 | 4
  separator: '' | '-' | '.' | '/'
  hasDay: boolean
}

// 저장 형식(YYYY-MM-DD, YYYY-MM)이 아닌 다른 표기를 요구하는 텍스트 입력을 위한 것.
// 네이티브 <input type="date"|"month">은 이미 저장 형식과 일치해서 이 로직이 필요 없다.
function isDateKey(key: string | null): boolean {
  return Boolean(key) && key!.toLowerCase().endsWith('date')
}

function formatFromDigitCount(digits: number): DateFormatSpec | null {
  if (digits === 8) return { yearDigits: 4, separator: '', hasDay: true }
  if (digits === 6) return { yearDigits: 2, separator: '', hasDay: true }
  if (digits === 10) return { yearDigits: 4, separator: '-', hasDay: true }
  return null
}

// placeholder에서 "YYYYMMDD", "YYYY.MM.DD", "YY-MM", "8자리", "########" 같은 패턴을 찾아
// 자릿수(연도 2/4자리)와 구분자를 추정한다.
function formatFromText(text: string): DateFormatSpec | null {
  if (!text) return null
  const lower = text.toLowerCase()

  const templateMatch = lower.match(/(yyyy|yy)\s*([-.\/])?\s*mm\s*([-.\/])?\s*(dd)?/)
  if (templateMatch) {
    const [, yearToken, sep] = templateMatch
    return {
      yearDigits: yearToken === 'yyyy' ? 4 : 2,
      separator: (sep as DateFormatSpec['separator']) ?? '',
      hasDay: Boolean(templateMatch[4]),
    }
  }

  const digitCountMatch = text.match(/(\d)\s*자리/)
  if (digitCountMatch) return formatFromDigitCount(Number(digitCountMatch[1]))

  const trimmed = text.trim()
  if (/^[0#]{6,8}$/.test(trimmed)) return formatFromDigitCount(trimmed.length)

  return null
}

function detectDateFormat(element: HTMLInputElement): DateFormatSpec | null {
  const fromPlaceholder = formatFromText(element.placeholder ?? '')
  if (fromPlaceholder) return fromPlaceholder

  if (element.maxLength > 0) return formatFromDigitCount(element.maxLength)

  return null
}

function reformatDate(isoValue: string, format: DateFormatSpec): string {
  const [year, month, day] = isoValue.split('-')
  if (!year || !month) return isoValue

  const yearPart = format.yearDigits === 2 ? year.slice(-2) : year
  const segments = [yearPart, month]
  if (format.hasDay && day) segments.push(day)

  return segments.join(format.separator)
}

function fillSelect(element: HTMLSelectElement, aliases: string[]): boolean {
  let bestIndex = -1
  let bestScore = 0

  Array.from(element.options).forEach((option, index) => {
    const score = scoreAgainstAliases(option.textContent ?? '', aliases)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })

  if (bestIndex === -1 || bestScore < SIMILARITY_THRESHOLD) return false

  setNativeValue(element, element.options[bestIndex].value)
  return true
}

// 값이 이미 정해진 상태에서 실제로 DOM에 써넣는 부분. overlay의 항목 교체(F-21)도
// "다른 값으로" 이 함수를 다시 호출하는 것으로 구현된다.
export function fillFieldWithValue(match: FieldMatch, rawValue: unknown): FillResult {
  if (!match.section || !match.key) {
    return { match, status: 'unmatched' }
  }

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { match, status: 'skipped', reason: '채울 값이 없습니다.' }
  }

  const element = match.field.element

  if (element instanceof HTMLSelectElement) {
    const aliases = getAliases(match, String(rawValue))
    return fillSelect(element, aliases)
      ? { match, status: 'filled' }
      : { match, status: 'skipped', reason: '일치하는 옵션을 찾지 못했습니다.' }
  }

  if (element instanceof HTMLInputElement && element.type === 'checkbox') {
    setNativeChecked(element, Boolean(rawValue))
    return { match, status: 'filled' }
  }

  if (element instanceof HTMLInputElement && element.type === 'radio') {
    const aliases = getAliases(match, String(rawValue))
    const ownLabel = match.field.clues.labelText || match.field.clues.ariaLabel || match.field.clues.nearbyText
    if (scoreAgainstAliases(ownLabel, aliases) < SIMILARITY_THRESHOLD) {
      return { match, status: 'skipped', reason: '옵션 라벨이 값과 일치하지 않습니다.' }
    }
    setNativeChecked(element, true)
    return { match, status: 'filled' }
  }

  // 날짜를 일반 텍스트 입력으로 받는 폼: placeholder/maxlength로 형식(YYYYMMDD, YY.MM.DD 등)을
  // 추정해서 변환한다. 추정에 실패하면 저장된 형식(YYYY-MM-DD, YYYY-MM) 그대로 넣는다.
  if (element instanceof HTMLInputElement && element.type === 'text' && isDateKey(match.key)) {
    const format = detectDateFormat(element)
    if (format) {
      setNativeValue(element, reformatDate(String(rawValue), format))
      return { match, status: 'filled' }
    }
  }

  // 네이티브 <input type="date"|"month">: 저장 형식(YYYY-MM-DD, YYYY-MM)이 요구 정밀도와 다르면
  // (예: 월 단위 값을 일 단위 date input에 넣는 경우) 브라우저가 값을 조용히 비워버리므로,
  // 실제로 반영됐는지 읽어 확인한 뒤에만 'filled'로 보고한다.
  if (element instanceof HTMLInputElement && (element.type === 'date' || element.type === 'month')) {
    setNativeValue(element, String(rawValue))
    if (element.value === '') {
      return { match, status: 'skipped', reason: '이 입력란의 날짜 형식과 저장된 날짜 형식이 맞지 않습니다.' }
    }
    return { match, status: 'filled' }
  }

  // text/textarea. 사전에 등록된 값 별칭이 있으면(성별·재직여부 등 내부 코드값) 사람이 읽을 수
  // 있는 표시형으로 바꿔서 넣는다 — select/radio 채우기와 동일한 별칭 테이블을 재사용한다.
  setNativeValue(element, getAliases(match, String(rawValue))[0])
  return { match, status: 'filled' }
}

function fillField(match: FieldMatch, profile: Profile, overrideValue?: string): FillResult {
  const { value, entryId } = resolveField(match, profile)
  const result = fillFieldWithValue(match, overrideValue ?? value)
  return entryId && result.status === 'filled' ? { ...result, entryId } : result
}

function isSplittableInput(element: FieldElement): boolean {
  return element instanceof HTMLInputElement && ['text', 'tel', 'number'].includes(element.type)
}

function sortByDomOrder(matches: FieldMatch[]): FieldMatch[] {
  return [...matches].sort((a, b) => {
    const position = a.field.element.compareDocumentPosition(b.field.element)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  })
}

// "전화번호"가 010 / 1234 / 5678 처럼 인접한 여러 입력칸으로 나뉜 폼 대응. 같은 필드로
// 매칭된 입력이 같은 부모 아래 여럿 있으면 하나의 분리 그룹으로 보고, DOM 순서대로
// 저장값의 "-" 구분 세그먼트를 하나씩 배분한다 (개수가 안 맞으면 원래 값 그대로 둔다).
function findSplitGroups(matches: FieldMatch[]): FieldMatch[][] {
  const groups = new Map<Element, Map<string, FieldMatch[]>>()

  for (const match of matches) {
    if (!match.section || !match.key) continue
    const element = match.field.element
    if (!isSplittableInput(element)) continue

    const parent = element.parentElement
    if (!parent) continue

    const dictKey = `${match.section}.${match.key}`
    const byKey = groups.get(parent) ?? new Map<string, FieldMatch[]>()
    groups.set(parent, byKey)

    const list = byKey.get(dictKey) ?? []
    list.push(match)
    byKey.set(dictKey, list)
  }

  const result: FieldMatch[][] = []
  for (const byKey of groups.values()) {
    for (const list of byKey.values()) {
      if (list.length >= 2) result.push(sortByDomOrder(list))
    }
  }
  return result
}

// 국내 휴대폰/전화번호의 흔한 자릿수 분할 패턴. "-" 없이 저장된 값(예: "01012345678")도
// 입력칸 개수에 맞춰 나눌 수 있게 하기 위한 것 — 어느 패턴에도 안 맞으면 null을 반환한다.
const PHONE_DIGIT_PATTERNS: Record<number, number[]> = {
  11: [3, 4, 4],
  10: [3, 3, 4],
  9: [2, 3, 4],
  8: [4, 4],
}

function splitByDashes(value: string, groupSize: number): string[] | null {
  const parts = value.split('-')
  return parts.length === groupSize ? parts : null
}

function splitByDigitPattern(value: string, groupSize: number): string[] | null {
  const digits = value.replace(/\D/g, '')
  const pattern = PHONE_DIGIT_PATTERNS[digits.length]
  if (!pattern || pattern.length !== groupSize) return null

  const parts: string[] = []
  let index = 0
  for (const length of pattern) {
    parts.push(digits.slice(index, index + length))
    index += length
  }
  return parts
}

export function fillFields(matches: FieldMatch[], profile: Profile): FillResult[] {
  const overrides = new Map<FieldMatch, string>()
  const unsplittable = new Set<FieldMatch>()

  for (const group of findSplitGroups(matches)) {
    const { value } = resolveField(group[0], profile)
    if (typeof value !== 'string' || !value) continue

    const parts = splitByDashes(value, group.length) ?? splitByDigitPattern(value, group.length)

    if (parts) {
      group.forEach((match, index) => overrides.set(match, parts[index]))
    } else {
      // 어떻게 나눠야 할지 알 수 없으면, 전체 값을 모든 칸에 중복 입력하는 대신 건너뛴다.
      group.forEach((match) => unsplittable.add(match))
    }
  }

  return matches.map((match) => {
    if (unsplittable.has(match)) {
      return { match, status: 'skipped', reason: '값을 입력칸 개수에 맞게 나눌 수 없습니다.' }
    }
    return fillField(match, profile, overrides.get(match))
  })
}
