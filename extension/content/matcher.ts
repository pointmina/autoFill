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
