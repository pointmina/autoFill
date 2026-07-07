# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Implementation is well underway. The original product/technical plan was `자소서_자동입력_확장프로그램_기획안.md` (Korean, "job application auto-fill Chrome extension plan") — **that file no longer exists in the repo or in git history**, so section references below (§3, §4.2, F-12, etc.) are unverifiable against a source doc; treat this file as the source of truth instead. One known deviation from the original plan: popup/options UI uses **React**, not Vue.

Build: `npm install`, then `npm run build` (outputs to `dist/`). Load `dist/` as an unpacked extension via `chrome://extensions`. `npm run dev` runs Vite watch mode for popup/options only (see build note below for why the content script isn't covered by it). There are no lint or test scripts in this project currently.

**Build is two passes, not one** — `vite.config.ts` (via `@crxjs/vite-plugin`) builds popup/options/background as ESM, which is what crx's manifest rewriting expects. The content script (`extension/content/index.ts`, pulling in scanner/matcher/filler/overlay) is injected at runtime via `chrome.scripting.executeScript({ files: [...] })`, which requires a single dependency-free classic script — Rollup can't emit that format in the same pass as the ESM entries. `vite.content.config.ts` is a second, separate Vite config that bundles just the content script as IIFE to a fixed path, `dist/content/autofill.js`. `npm run build` runs both passes; `npm run build:content` reruns just the second one. `extension/background/service-worker.ts` hardcodes that path in `CONTENT_SCRIPT_PATH` — if the content entry point moves or the content config's `entryFileNames` changes, update both together.

## What this project is

A Chrome extension (Manifest V3) that auto-fills job-application forms (자소서: Korean cover-letter/application forms) across arbitrary hiring sites (사람인, 잡코리아, 원티드, 그리팅, 나인하이어, company career pages, etc.) using a single locally-stored profile. It reads form field labels/placeholders/names, matches them against a Korean/English synonym dictionary, and writes values — never reads existing page data out, never submits forms.

## Architecture

```
extension/
├─ manifest.json            # MV3, permissions: storage, activeTab, scripting
├─ popup/                   # React — profile CRUD + "fill this page" trigger
├─ options/                 # React — detailed settings, JSON backup/restore
├─ content/
│  ├─ index.ts              # pipeline entry point injected via chrome.scripting.executeScript
│  ├─ scanner.ts            # collects input/textarea/select elements + extracts clues
│  ├─ matcher.ts            # synonym-dictionary matching + confidence scoring + section inference
│  ├─ filler.ts             # writes values (native-setter + event dispatch), date reformatting, split-field grouping
│  └─ overlay.ts            # shadow-DOM highlight badges, entry-swap dropdown, result banner — implemented, not just planned
├─ background/
│  └─ service-worker.ts     # keyboard shortcut, message routing (CONTENT_SCRIPT_PATH)
├─ options/
│  ├─ extractText.ts        # options-page-only: File → raw text (txt via File.text(), pdf via pdfjs-dist, docx via mammoth)
│  ├─ sections/ImportSection.tsx        # "가져오기" tab: upload → parse → review/edit → one atomic profile update
│  └─ components/ImportReviewList.tsx   # checkbox include/exclude + EntryForm-based edit for not-yet-saved draft entries
└─ shared/
   ├─ schema.ts             # data model types (StorageSchema: version, profile, settings) + shared helpers:
   │                        #   normalizeText, SectionKey, SECTION_HEADINGS (also used by content/matcher.ts and
   │                        #   resumeParser.ts so DOM matching and text-parsing can't drift onto different keyword lists),
   │                        #   sortEntriesByKeyDesc, summarize*Entry/summarizeArrayEntry, generateId
   ├─ resumeParser.ts       # pure text → ParsedResumeDraft (best-effort regex/dictionary-based resume parsing, no DOM/chrome API)
   ├─ storage.ts            # chrome.storage.local read/write helpers
   ├─ messages.ts           # popup↔background↔content message contract (RUN_AUTOFILL, RUN_AUTOFILL_IN_PAGE, RunAutofillResult)
   ├─ dictionary.ko.json    # field label synonym dictionary
   └─ valueAliases.ko.json  # value-level synonym dictionary (gender, schoolType, testName, etc.) for select/radio matching via bigram similarity
```

There is no `repeater.ts` — "add row" repeating-section expansion (F-30~33 in the original plan) is not implemented. Don't confuse this with the entry-swap logic already present in `filler.ts`/`overlay.ts`, which handles picking *which* existing entry fills a single-slot section, not adding new rows.

Stack: TypeScript, React + Vite (popup/options), vanilla TS for the content script (kept framework-free since it injects into arbitrary third-party pages), `chrome.storage.local` for persistence, `@crxjs/vite-plugin` for the build (vite root is set to `extension/`, output to `../dist`). Options-page-only deps: `pdfjs-dist` and `mammoth` (resume-import text extraction) — both bundle entirely into the extension (no CDN, no remote worker) to satisfy the no-network-requests constraint below; the pdf.js worker is loaded via a `?url` asset import (`pdfjs-dist/build/pdf.worker.min.mjs?url`), which Vite emits as a local hashed asset — no `web_accessible_resources` entry is needed since it's the options page loading its own bundled asset, not a content script reaching into extension resources.

The runtime flow is popup → background service worker → content script, coordinated entirely through the message contract in `shared/messages.ts`: the popup sends `RUN_AUTOFILL`, the service worker resolves the active tab and injects/messages the content script with `RUN_AUTOFILL_IN_PAGE`, and results flow back as `RunAutofillResult`.

## Non-negotiable design constraints

These come directly from the original plan's privacy/store-review strategy — preserve them in any implementation:

- **No network requests, ever.** All data lives in `chrome.storage.local`. No remote servers, no analytics, no remotely-loaded code (MV3 policy).
- **No `<all_urls>` / broad host permissions.** Use `activeTab` + `scripting` so the content script only injects into the tab the user explicitly acted on. `manifest.json` currently declares exactly `storage`, `activeTab`, `scripting` — keep it minimal.
- **Never auto-click submit/send buttons.** The extension only fills fields; the human always reviews and submits. It may auto-click "add row"/"add another" buttons to expand repeating sections (with a bounded retry via MutationObserver), but never a final submission control.
- **Write-oriented, not read-oriented.** The content script sets values and dispatches events; it does not read/exfiltrate existing form or page data.
- **Framework-compatible field writes on target pages.** Target sites may run React/Vue/etc; use the native-setter + `input`/`change` event dispatch pattern (`setNativeValue`/`setNativeChecked` in `filler.ts`) so values register on framework-controlled forms — not a fire-and-forget `value =` assignment.

## Data model

Single profile with 6 sections stored under one JSON document (`version`, `profile`, `settings`, per `shared/schema.ts`):
- `basic` — single object (name, contact, address, etc.)
- `education`, `certificate`, `career`, `language`, `award` — arrays, sorted newest-first

When a target form has only one slot for a multi-entry section, default to the most recent entry and offer a click-to-swap overlay (`overlay.ts`) that replaces the whole entry group at once — never mix fields from two different entries into one row.

## Field-matching design

Clue extraction priority (`scanner.ts`): linked `<label>` → `aria-label` → `placeholder` → `name`/`id` → nearby text (table headers, preceding `<th>`/`<div>`). `matcher.ts` scores matches by confidence (high/medium/low: exact label match > partial match > name/id guess); low-confidence fills should still populate the field but be visually flagged (orange highlight) rather than silently trusted. Section context (e.g. disambiguating "acquired date" in a certificate block vs. a language-test block) is resolved by `inferSection`, which walks up the DOM to the nearest section heading — required, not optional, since the same field label recurs across sections.

Two dictionaries drive matching, both kept as data rather than code so they can grow without touching matcher logic:
- `dictionary.ko.json` — maps field *labels* to canonical field keys.
- `valueAliases.ko.json` — maps canonical *enum values* (e.g. gender, school type, test name) to their display synonyms, used when filling select/radio inputs via bigram similarity scoring in `filler.ts`.

`filler.ts` also handles two behaviors beyond basic value assignment: date-format auto-detection/reformatting (inferring YYYYMMDD vs. YY.MM.DD-style targets from placeholder/maxlength) and split-field grouping (e.g. a phone number spread across three adjacent inputs).

## Resume file import (options page, "가져오기" tab)

Lets the user upload a resume (txt/pdf/docx only — no OCR/images) instead of typing every field by
hand. `extractText.ts` gets raw text out of the file; `shared/resumeParser.ts` (`parseResumeText`)
then does **best-effort** regex/dictionary-based extraction into a `ParsedResumeDraft` — it reuses
`dictionary.ko.json` for "라벨: 값" line matching and `valueAliases.ko.json` for enum detection
(school type, status, isCurrent, test name, etc.), scoped by section via the same `SECTION_HEADINGS`
keyword list `content/matcher.ts` uses for DOM section inference.

This parsing is necessarily much less reliable than the DOM-based field matcher (free-text resumes
have no consistent structure — see the accuracy-limitations comment at the top of `resumeParser.ts`),
so **nothing is ever auto-saved**: `ImportSection.tsx` always routes parsed results through an
editable review screen (reusing each array section's own `fields`/`createEmpty` — exported from
`EducationSection.tsx` etc. for this reason — plus `summarize*Entry` for the draft list) before the
user explicitly confirms. On confirm, everything (basic info + all 5 array sections) is written via
one atomic `saveProfile` call in `App.tsx`'s `handleImport` — never as several sequential per-section
saves, since `saveProfile` fully replaces the stored profile rather than merging per key, so chaining
saves from a stale closure would silently drop earlier-saved sections.

## Acceptance bar

Any implementation work should be checked against these criteria before considering a feature done — notably: field-recognition rate ≥80% on labeled fields across 5+ major hiring platforms, zero network requests (verify via DevTools), and correct restoration of profile data through a full JSON export/import round-trip.
