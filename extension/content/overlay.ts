import type { FieldMatch } from './matcher'
import { fillFieldWithValue, getEntries, type ArraySectionKey, type FillResult } from './filler'
import { summarizeArrayEntry, type Profile, type Settings } from '../shared/schema'

const OVERLAY_CSS = `
  :host { all: initial; }
  .af-banner {
    position: fixed;
    top: 16px;
    right: 16px;
    max-width: 320px;
    background: #ffffff;
    border: 1px solid #d0d0d0;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    padding: 12px 14px;
    font: 13px/1.5 system-ui, sans-serif;
    color: #222;
    pointer-events: auto;
  }
  .af-banner-summary { font-weight: 600; margin: 0 18px 0 0; }
  .af-banner-unmatched-list {
    margin: 8px 0 0;
    padding: 0 0 0 16px;
    max-height: 120px;
    overflow-y: auto;
    color: #888;
  }
  .af-banner-close {
    position: absolute;
    top: 8px;
    right: 10px;
    border: none;
    background: none;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    color: #888;
  }
  .af-badge {
    position: fixed;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid #999;
    background: #fff;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .af-dropdown {
    position: fixed;
    min-width: 160px;
    max-width: 280px;
    background: #fff;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    padding: 4px;
    font: 12px/1.4 system-ui, sans-serif;
    pointer-events: auto;
  }
  .af-dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
  }
  .af-dropdown-item:hover { background: #f0f0f0; }
  .af-dropdown-empty { padding: 6px 8px; color: #999; }
`

const HIGHLIGHT_STYLE_ID = 'af-highlight-style'

let overlayHost: HTMLDivElement | null = null
let overlayRoot: ShadowRoot | null = null
let activeDropdown: { element: HTMLElement; cleanup: () => void } | null = null
let badgeRepositionCleanup: (() => void) | null = null

function ensureOverlayRoot(): ShadowRoot {
  if (overlayRoot) return overlayRoot

  const host = document.createElement('div')
  host.setAttribute('data-autofill-overlay-host', '')
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
  })

  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = OVERLAY_CSS
  root.appendChild(style)

  document.body.appendChild(host)
  overlayHost = host
  overlayRoot = root
  return root
}

// 하이라이트는 실제 페이지의 입력 요소에 직접 클래스를 붙여야 해서, shadow root 안이 아니라
// 페이지 document에 스타일을 주입한다 (배지/드롭다운은 우리 오버레이 안이라 shadow root로 격리).
function ensureHighlightStyle() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = HIGHLIGHT_STYLE_ID
  style.textContent = `
    .af-highlight-success { outline: 2px solid #2e7d32 !important; outline-offset: 1px !important; }
    .af-highlight-low { outline: 2px solid #e67e22 !important; outline-offset: 1px !important; }
  `
  document.head.appendChild(style)
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function describeFieldForReport(match: FieldMatch): string {
  const clues = match.field.clues
  return clues.labelText || clues.ariaLabel || clues.placeholder || clues.nameOrId || '(라벨 없음)'
}

function renderBanner(results: FillResult[]) {
  const root = ensureOverlayRoot()
  root.querySelector('.af-banner')?.remove()

  const total = results.length
  const filled = results.filter((r) => r.status === 'filled').length
  const unmatched = results.filter((r) => r.status === 'unmatched')

  const banner = el('div', 'af-banner')
  const summaryText = unmatched.length
    ? `${total}개 필드 중 ${filled}개 입력됨, ${unmatched.length}개 미인식`
    : `${total}개 필드 중 ${filled}개 입력됨`
  banner.appendChild(el('div', 'af-banner-summary', summaryText))

  if (unmatched.length > 0) {
    const list = el('ul', 'af-banner-unmatched-list')
    unmatched.forEach((r) => list.appendChild(el('li', undefined, describeFieldForReport(r.match))))
    banner.appendChild(list)
  }

  const closeButton = el('button', 'af-banner-close', '×')
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', '닫기')
  closeButton.addEventListener('click', () => banner.remove())
  banner.appendChild(closeButton)

  root.appendChild(banner)
}

function applyHighlights(results: FillResult[], highlightEnabled: boolean) {
  ensureHighlightStyle()
  results.forEach((r) => {
    const element = r.match.field.element
    element.classList.remove('af-highlight-success', 'af-highlight-low')
    if (!highlightEnabled || r.status !== 'filled') return
    element.classList.add(r.match.confidence === 'low' ? 'af-highlight-low' : 'af-highlight-success')
  })
}

// 옵션 페이지의 항목 목록과 같은 요약 규칙(shared/schema.ts)을 재사용해서, 스왑 드롭다운에
// 보이는 라벨이 옵션 페이지 카드와 어긋나지 않게 한다.
function describeEntry(section: ArraySectionKey, entry: Record<string, unknown>): string {
  const { title, subtitle } = summarizeArrayEntry(section, entry)
  return subtitle ? `${title} · ${subtitle}` : title
}

interface SwapGroup {
  section: ArraySectionKey
  matches: FieldMatch[]
}

function buildSwapGroups(results: FillResult[]): Map<string, SwapGroup> {
  const groups = new Map<string, SwapGroup>()
  for (const r of results) {
    if (r.status !== 'filled' || !r.entryId || !r.match.section || r.match.section === 'basic') continue
    const section = r.match.section as ArraySectionKey
    const key = `${section}:${r.entryId}`
    const existing = groups.get(key)
    if (existing) {
      existing.matches.push(r.match)
    } else {
      groups.set(key, { section, matches: [r.match] })
    }
  }
  return groups
}

function closeDropdown() {
  if (!activeDropdown) return
  activeDropdown.cleanup()
  activeDropdown.element.remove()
  activeDropdown = null
}

function openDropdown(
  anchor: HTMLElement,
  section: ArraySectionKey,
  entries: Record<string, unknown>[],
  excludeId: string,
  onSelect: (entry: Record<string, unknown>) => void,
) {
  closeDropdown()
  const root = ensureOverlayRoot()

  const dropdown = el('div', 'af-dropdown')
  const rect = anchor.getBoundingClientRect()
  dropdown.style.top = `${rect.bottom + 4}px`
  dropdown.style.left = `${rect.left}px`

  const others = entries.filter((entry) => String(entry.id) !== excludeId)
  if (others.length === 0) {
    dropdown.appendChild(el('div', 'af-dropdown-empty', '교체할 다른 항목이 없습니다.'))
  } else {
    others.forEach((entry) => {
      const item = el('button', 'af-dropdown-item', describeEntry(section, entry))
      item.type = 'button'
      item.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelect(entry)
      })
      dropdown.appendChild(item)
    })
  }

  root.appendChild(dropdown)

  // 배지와 마찬가지로 fixed 위치라 스크롤하면 앵커에서 어긋나므로, 드롭다운이 열린 채로
  // 스크롤되면 다시 위치를 잡는 대신 닫아버린다 (열려 있는 동안 항목을 고르는 짧은 상호작용이라 충분하다).
  const closeOnScroll = () => closeDropdown()
  const closeOnOutsideClick = (event: MouseEvent) => {
    if (!dropdown.contains(event.target as Node)) closeDropdown()
  }
  window.addEventListener('click', closeOnOutsideClick, { capture: true })
  window.addEventListener('scroll', closeOnScroll, { capture: true, passive: true })
  window.addEventListener('resize', closeOnScroll)
  activeDropdown = {
    element: dropdown,
    cleanup: () => {
      window.removeEventListener('click', closeOnOutsideClick, { capture: true })
      window.removeEventListener('scroll', closeOnScroll, { capture: true })
      window.removeEventListener('resize', closeOnScroll)
    },
  }
}

function attachSwapControls(results: FillResult[], profile: Profile, highlightEnabled: boolean) {
  const root = ensureOverlayRoot()
  root.querySelectorAll('.af-badge').forEach((n) => n.remove())
  closeDropdown()
  badgeRepositionCleanup?.()
  badgeRepositionCleanup = null

  const badges: { badge: HTMLButtonElement; target: Element }[] = []

  for (const [entryKey, group] of buildSwapGroups(results)) {
    const entries = getEntries(profile, group.section)
    if (entries.length <= 1) continue

    let currentEntryId = entryKey.split(':')[1]

    group.matches.forEach((match) => {
      const badge = el('button', 'af-badge', '⇄')
      badge.type = 'button'
      badge.title = '다른 항목으로 교체'

      const rect = match.field.element.getBoundingClientRect()
      badge.style.top = `${rect.top - 8}px`
      badge.style.left = `${rect.right - 8}px`

      badge.addEventListener('click', (event) => {
        event.stopPropagation()
        openDropdown(badge, group.section, entries, currentEntryId, (chosenEntry) => {
          group.matches.forEach((m) => {
            if (!m.key) return
            const result = fillFieldWithValue(m, chosenEntry[m.key])
            m.field.element.classList.remove('af-highlight-success', 'af-highlight-low')
            if (highlightEnabled && result.status === 'filled') {
              m.field.element.classList.add(m.confidence === 'low' ? 'af-highlight-low' : 'af-highlight-success')
            }
          })
          currentEntryId = String(chosenEntry.id)
          closeDropdown()
        })
      })

      root.appendChild(badge)
      badges.push({ badge, target: match.field.element })
    })
  }

  if (badges.length > 0) {
    // 배지는 position: fixed라 뷰포트 좌표로 한 번 찍어두면 스크롤/리사이즈 후 대상 필드와
    // 어긋난다 — 매번 실제 요소 위치를 다시 읽어 따라가게 한다.
    const reposition = () => {
      badges.forEach(({ badge, target }) => {
        const rect = target.getBoundingClientRect()
        badge.style.top = `${rect.top - 8}px`
        badge.style.left = `${rect.right - 8}px`
      })
    }
    window.addEventListener('scroll', reposition, { capture: true, passive: true })
    window.addEventListener('resize', reposition)
    badgeRepositionCleanup = () => {
      window.removeEventListener('scroll', reposition, { capture: true })
      window.removeEventListener('resize', reposition)
    }
  }
}

export function showAutofillOverlay(results: FillResult[], profile: Profile, settings: Settings) {
  applyHighlights(results, settings.highlightFilledFields)
  renderBanner(results)
  attachSwapControls(results, profile, settings.highlightFilledFields)
}

export function clearAutofillOverlay() {
  closeDropdown()
  badgeRepositionCleanup?.()
  badgeRepositionCleanup = null
  overlayRoot?.querySelectorAll('.af-banner, .af-badge').forEach((n) => n.remove())
}

export function removeOverlayHost() {
  closeDropdown()
  badgeRepositionCleanup?.()
  badgeRepositionCleanup = null
  overlayHost?.remove()
  overlayHost = null
  overlayRoot = null
}
