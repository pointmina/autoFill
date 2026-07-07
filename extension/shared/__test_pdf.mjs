import { readFile } from 'node:fs/promises'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const path = 'C:\\Users\\HP\\Desktop\\자료\\김민아\\김민아_이력서.pdf'
const data = new Uint8Array(await readFile(path))

const doc = await pdfjsLib.getDocument({ data, disableWorker: true }).promise
console.log('numPages:', doc.numPages)

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  console.log(`--- page ${i}: ${content.items.length} text items ---`)
  const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ')
  console.log(JSON.stringify(text.slice(0, 300)))
}
