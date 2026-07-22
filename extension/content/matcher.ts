import type { FieldClues, ScannedField } from './scanner'
import { normalizeText, SECTION_HEADINGS, type SectionKey } from '../shared/schema'
import dictionaryData from '../shared/dictionary.ko.json'

export type { SectionKey }
export { normalizeText }
export type Confidence = 'high' | 'medium' | 'low'

export interface FieldMatch {
  field: ScannedField
  section: SectionKey | null
  key: string | null
  confidence: Confidence | null
}

type SynonymDictionary = Record<string, string[]>

const dictionary = dictionaryData as SynonymDictionary

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }

function matchesSynonym(clue: string, synonyms: string[]): 'exact' | 'partial' | null {
  const normalizedClue = normalizeText(clue)
  if (!normalizedClue) return null

  let partial = false
  for (const synonym of synonyms) {
    const normalizedSynonym = normalizeText(synonym)
    if (!normalizedSynonym) continue
    if (normalizedClue === normalizedSynonym) return 'exact'
    if (normalizedClue.includes(normalizedSynonym) || normalizedSynonym.includes(normalizedClue)) {
      partial = true
    }
  }
  return partial ? 'partial' : null
}

// 라벨 완전일치(high) > 부분일치/placeholder·인접텍스트 완전일치(medium) > name/id 추정(low)
// groupLabel: 라디오처럼 "옵션 자신의 라벨"과 "필드 전체를 가리키는 라벨"이 다른 경우 보조로 전달된다.
function evaluateEntry(clues: FieldClues, synonyms: string[], groupLabel?: string): Confidence | null {
  if (groupLabel && matchesSynonym(groupLabel, synonyms) === 'exact') return 'high'

  const labelMatch = matchesSynonym(clues.labelText, synonyms) ?? matchesSynonym(clues.ariaLabel, synonyms)
  if (labelMatch === 'exact') return 'high'

  const placeholderMatch = matchesSynonym(clues.placeholder, synonyms)
  const nearbyMatch = matchesSynonym(clues.nearbyText, synonyms)
  if (labelMatch === 'partial' || placeholderMatch === 'exact' || nearbyMatch === 'exact') {
    return 'medium'
  }
  if (placeholderMatch === 'partial' || nearbyMatch === 'partial') return 'medium'

  const nameMatch = matchesSynonym(clues.nameOrId, synonyms)
  if (nameMatch) return 'low'

  return null
}

function findHeadingNear(container: Element): string | null {
  if (container.tagName === 'FIELDSET') {
    const legendText = container.querySelector('legend')?.textContent?.trim()
    if (legendText) return legendText
  }

  let sibling = container.previousElementSibling
  let hops = 0
  while (sibling && hops < 5) {
    if (
      /^H[1-6]$/.test(sibling.tagName) ||
      sibling.tagName === 'LEGEND' ||
      sibling.matches('[class*="title" i], [class*="heading" i], strong, b')
    ) {
      const text = sibling.textContent?.trim()
      if (text) return text
    }
    sibling = sibling.previousElementSibling
    hops++
  }

  return null
}

// 라디오/체크박스는 개별 옵션의 라벨(예: "여성")과 그룹 전체를 가리키는 라벨(예: "성별")이
// 서로 다른 요소에 있는 경우가 많다. fieldset/legend 또는 가까운 제목류 요소에서 그룹 라벨을 찾는다.
function findGroupLabel(element: Element): string | undefined {
  const fieldset = element.closest('fieldset')
  const legendText = fieldset?.querySelector('legend')?.textContent?.trim()
  if (legendText) return legendText

  let current: Element | null = element.parentElement
  let depth = 0
  while (current && depth < 4) {
    const heading = findHeadingNear(current)
    if (heading) return heading
    current = current.parentElement
    depth++
  }

  return undefined
}

function matchSectionHeading(text: string): SectionKey | null {
  const normalized = normalizeText(text)
  for (const [section, keywords] of Object.entries(SECTION_HEADINGS) as [SectionKey, string[]][]) {
    if (keywords.some((keyword) => normalized.includes(normalizeText(keyword)))) {
      return section
    }
  }
  return null
}

// findHeadingNear는 태그(h1-6/legend)나 영문 클래스명("title"/"heading")으로만 제목 후보를
// 가려내는데, 한국 채용 사이트는 "tit"/"sec_tit"/"stit"처럼 축약된 한국어 클래스명을 쓰는
// 경우가 많아 그 휴리스틱을 통과하지 못한다. findGroupLabel(라디오/체크박스 그룹 라벨) 쪽은
// "아무 인접 텍스트"를 받아들이면 오탐이 늘어나 태그/클래스 제한이 필요하지만, 섹션 추론은
// 텍스트 자체가 SECTION_HEADINGS 키워드와 일치하는지로 바로 판단할 수 있어 태그/클래스 제한이
// 필요 없다 — 사전(데이터)만으로 매칭 범위를 넓힌다.
function findSectionHeadingNear(container: Element): SectionKey | null {
  let sibling = container.previousElementSibling
  let hops = 0
  while (sibling && hops < 5) {
    const text = sibling.textContent?.trim()
    if (text && text.length <= 20) {
      const matched = matchSectionHeading(text)
      if (matched) return matched
    }
    sibling = sibling.previousElementSibling
    hops++
  }
  return null
}

// 필드의 조상을 거슬러 올라가며 섹션 제목을 찾는다 (예: "취득일"이 자격증/어학 중 어느 영역인지 구분).
export function inferSection(element: Element): SectionKey | null {
  let current: Element | null = element
  let depth = 0

  while (current && depth < 12) {
    const heading = findHeadingNear(current)
    if (heading) {
      const matched = matchSectionHeading(heading)
      if (matched) return matched
    }
    const directMatch = findSectionHeadingNear(current)
    if (directMatch) return directMatch
    current = current.parentElement
    depth++
  }

  return null
}

function findBestMatch(
  clues: FieldClues,
  onlySection: SectionKey | null,
  groupLabel?: string,
): { sectionKey: SectionKey; fieldKey: string; confidence: Confidence } | null {
  let best: { sectionKey: SectionKey; fieldKey: string; confidence: Confidence } | null = null

  for (const [dictKey, synonyms] of Object.entries(dictionary)) {
    const [sectionKey, fieldKey] = dictKey.split('.') as [SectionKey, string]
    if (onlySection && sectionKey !== onlySection) continue

    const confidence = evaluateEntry(clues, synonyms, groupLabel)
    if (!confidence) continue

    if (!best || CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[best.confidence]) {
      best = { sectionKey, fieldKey, confidence }
    }
  }

  return best
}

export function matchField(field: ScannedField): FieldMatch {
  const groupLabel =
    field.inputType === 'radio' || field.inputType === 'checkbox'
      ? findGroupLabel(field.element)
      : undefined

  const inferredSection = inferSection(field.element)
  // 섹션이 추론되면 그 섹션 안에서만 찾고, 못 찾으면 전체 사전으로 넓혀서 재시도한다.
  const match =
    (inferredSection && findBestMatch(field.clues, inferredSection, groupLabel)) ??
    findBestMatch(field.clues, null, groupLabel)

  return {
    field,
    section: match?.sectionKey ?? null,
    key: match?.fieldKey ?? null,
    confidence: match?.confidence ?? null,
  }
}

export function matchFields(fields: ScannedField[]): FieldMatch[] {
  return fields.map(matchField)
}
