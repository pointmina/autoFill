import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type ResumeFileKind = 'txt' | 'pdf' | 'docx'

// OS 파일 선택창이 주는 File.type(MIME)은 pdf/docx에서 신뢰할 수 없는 경우가 많아 확장자로 판단한다.
export function detectFileKind(file: File): ResumeFileKind | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt')) return 'txt'
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  return null
}

async function extractTextFromPdf(file: File): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const pageTexts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pageTexts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return pageTexts.join('\n')
}

async function extractTextFromDocx(file: File): Promise<string> {
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

export async function extractTextFromFile(file: File): Promise<string> {
  const kind = detectFileKind(file)
  switch (kind) {
    case 'txt':
      return file.text()
    case 'pdf':
      return extractTextFromPdf(file)
    case 'docx':
      return extractTextFromDocx(file)
    default:
      throw new Error('지원하지 않는 파일 형식입니다. txt, pdf, docx 파일만 업로드할 수 있습니다.')
  }
}
