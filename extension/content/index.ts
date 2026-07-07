import { scanFields, type ScannedField } from './scanner'
import { matchFields } from './matcher'
import { fillFields } from './filler'
import { showAutofillOverlay, clearAutofillOverlay } from './overlay'
import { loadStorage } from '../shared/storage'
import { MESSAGE_RUN_AUTOFILL_IN_PAGE, type RunAutofillResult } from '../shared/messages'

declare global {
  interface Window {
    __autofillContentLoaded?: boolean
  }
}

function describeUnmatched(field: ScannedField): string {
  return field.clues.labelText || field.clues.placeholder || field.clues.nameOrId || '(라벨 없음)'
}

async function runPipeline(): Promise<RunAutofillResult> {
  const { profile, settings } = await loadStorage()

  const scanned = scanFields()
  const matches = matchFields(scanned)
  const results = fillFields(matches, profile)

  clearAutofillOverlay()
  showAutofillOverlay(results, profile, settings)

  return {
    ok: true,
    totalCount: results.length,
    filledCount: results.filter((r) => r.status === 'filled').length,
    unmatchedLabels: results
      .filter((r) => r.status === 'unmatched')
      .map((r) => describeUnmatched(r.match.field)),
  }
}

// 팝업 클릭마다 background가 이 스크립트를 다시 주입할 수 있으므로, 리스너가 중복
// 등록되지 않게 막는다 (이미 로드돼 있으면 기존 리스너가 다음 메시지도 처리한다).
if (!window.__autofillContentLoaded) {
  window.__autofillContentLoaded = true

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_RUN_AUTOFILL_IN_PAGE) return

    runPipeline()
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          totalCount: 0,
          filledCount: 0,
          unmatchedLabels: [],
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    return true
  })
}
