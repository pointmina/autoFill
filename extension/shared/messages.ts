// 팝업 -> background: 지금 활성 탭에 자동입력을 실행해 달라는 요청
export const MESSAGE_RUN_AUTOFILL = 'RUN_AUTOFILL' as const

export interface RunAutofillRequest {
  type: typeof MESSAGE_RUN_AUTOFILL
}

// background -> content script: 주입된 스크립트에게 실제 파이프라인을 실행하라는 요청
export const MESSAGE_RUN_AUTOFILL_IN_PAGE = 'RUN_AUTOFILL_IN_PAGE' as const

export interface RunAutofillInPageRequest {
  type: typeof MESSAGE_RUN_AUTOFILL_IN_PAGE
}

export interface RunAutofillResult {
  ok: boolean
  totalCount: number
  filledCount: number
  skippedCount: number
  unmatchedLabels: string[]
  error?: string
}
