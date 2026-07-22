import { useState } from 'react'
import './popup.css'
import { MESSAGE_RUN_AUTOFILL, type RunAutofillRequest, type RunAutofillResult } from '../shared/messages'

type Status = 'idle' | 'running' | 'done' | 'error'

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<RunAutofillResult | null>(null)

  async function handleClick() {
    setStatus('running')
    setResult(null)

    const request: RunAutofillRequest = { type: MESSAGE_RUN_AUTOFILL }
    try {
      const response: RunAutofillResult = await chrome.runtime.sendMessage(request)
      setResult(response)
      setStatus(response.ok ? 'done' : 'error')
    } catch (error) {
      setResult({
        ok: false,
        totalCount: 0,
        filledCount: 0,
        skippedCount: 0,
        unmatchedLabels: [],
        error: error instanceof Error ? error.message : '확장 프로그램과 통신하지 못했습니다.',
      })
      setStatus('error')
    }
  }

  return (
    <div className="popup">
      <h1>자소서 자동입력</h1>

      <button type="button" onClick={handleClick} disabled={status === 'running'}>
        {status === 'running' ? '처리 중...' : '이 페이지에 자동 입력'}
      </button>

      <button type="button" className="link-button" onClick={() => chrome.runtime.openOptionsPage()}>
        내정보 입력하기
      </button>

      {status === 'done' && result && (
        <p className="banner banner-success">
          {result.totalCount}개 필드 중 {result.filledCount}개 입력됨
          {result.skippedCount > 0 && `, ${result.skippedCount}개 건너뜀`}
          {result.unmatchedLabels.length > 0 && `, ${result.unmatchedLabels.length}개 미인식`}
        </p>
      )}

      {status === 'error' && result && (
        <p className="banner banner-error">{result.error ?? '알 수 없는 오류가 발생했습니다.'}</p>
      )}
    </div>
  )
}
