import {
  MESSAGE_RUN_AUTOFILL,
  MESSAGE_RUN_AUTOFILL_IN_PAGE,
  type RunAutofillRequest,
  type RunAutofillResult,
} from '../shared/messages'

chrome.runtime.onInstalled.addListener(() => {
  console.log('[자소서 자동입력] 확장 설치됨')
})

// vite.content.config.ts가 scanner/matcher/filler/overlay를 이 고정 경로 하나로 번들링한다.
const CONTENT_SCRIPT_PATH = 'content/autofill.js'

async function runAutofillOnActiveTab(): Promise<RunAutofillResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    return {
      ok: false,
      totalCount: 0,
      filledCount: 0,
      skippedCount: 0,
      unmatchedLabels: [],
      error: '활성 탭을 찾을 수 없습니다.',
    }
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_SCRIPT_PATH] })
    const response = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_RUN_AUTOFILL_IN_PAGE })
    return response as RunAutofillResult
  } catch {
    return {
      ok: false,
      totalCount: 0,
      filledCount: 0,
      skippedCount: 0,
      unmatchedLabels: [],
      error: '이 페이지에는 스크립트를 실행할 수 없습니다.',
    }
  }
}

chrome.runtime.onMessage.addListener((message: RunAutofillRequest, _sender, sendResponse) => {
  if (message.type !== MESSAGE_RUN_AUTOFILL) return

  runAutofillOnActiveTab().then(sendResponse)
  return true
})
