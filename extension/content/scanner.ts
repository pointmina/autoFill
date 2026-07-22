export type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export interface FieldClues {
  labelText: string
  ariaLabel: string
  placeholder: string
  nameOrId: string
  nearbyText: string
}

export interface ScannedField {
  element: FieldElement
  inputType: string
  clues: FieldClues
}

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'file', 'password'])

function isFillableField(el: Element): el is FieldElement {
  if (el instanceof HTMLInputElement) {
    return !SKIP_INPUT_TYPES.has(el.type) && !el.disabled
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return !el.disabled
  }
  return false
}

function getLabelText(el: FieldElement): string {
  if (el.id) {
    const escapedId = CSS.escape(el.id)
    const label = document.querySelector(`label[for="${escapedId}"]`)
    const text = label?.textContent?.trim()
    if (text) return text
  }

  const wrappingLabel = el.closest('label')
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, textarea, select').forEach((node) => node.remove())
    const text = clone.textContent?.trim()
    if (text) return text
  }

  return ''
}

function getAriaLabel(el: FieldElement): string {
  const direct = el.getAttribute('aria-label')?.trim()
  if (direct) return direct

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
    if (text) return text
  }

  return ''
}

function getPlaceholder(el: FieldElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.placeholder?.trim() ?? ''
  }
  return ''
}

function getNameOrId(el: FieldElement): string {
  return el.name.trim() || el.id.trim() || ''
}

function getNearbyText(el: FieldElement): string {
  const cell = el.closest('td, th')
  if (cell) {
    let sibling = cell.previousElementSibling
    while (sibling) {
      const text = sibling.textContent?.trim()
      if (text) return text
      sibling = sibling.previousElementSibling
    }
  }

  let sibling = el.previousElementSibling
  while (sibling) {
    if (!sibling.matches('input, textarea, select, button')) {
      const text = sibling.textContent?.trim()
      if (text) return text
    }
    sibling = sibling.previousElementSibling
  }

  const parent = el.parentElement
  if (parent) {
    for (const node of Array.from(parent.childNodes)) {
      if (node === el) break
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim()
        if (text) return text
      }
    }
  }

  return ''
}

// 라벨→aria-label→placeholder→name/id 순 사람이 읽을 수 있는 설명 텍스트. 팝업의 미인식
// 목록과 페이지 내 오버레이 배너가 같은 필드를 다르게 설명하지 않도록 한 곳에 둔다.
export function describeFieldClues(clues: FieldClues): string {
  return clues.labelText || clues.ariaLabel || clues.placeholder || clues.nameOrId || '(라벨 없음)'
}

export function scanFields(root: ParentNode = document): ScannedField[] {
  const candidates = root.querySelectorAll('input, textarea, select')
  const fields: ScannedField[] = []

  candidates.forEach((el) => {
    if (!isFillableField(el)) return

    fields.push({
      element: el,
      inputType: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
      clues: {
        labelText: getLabelText(el),
        ariaLabel: getAriaLabel(el),
        placeholder: getPlaceholder(el),
        nameOrId: getNameOrId(el),
        nearbyText: getNearbyText(el),
      },
    })
  })

  return fields
}
