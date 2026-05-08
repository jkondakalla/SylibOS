import JSZip from 'jszip'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { Course, Lecture } from '../types'
import type { AppSettings } from '../types'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractTitle(html: string, filename: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    // Strip site suffix like " | MIT OpenCourseWare"
    const t = titleMatch[1].split('|')[0].trim()
    if (t.length > 2) return t
  }
  for (const tag of ['h1', 'h2']) {
    const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    if (m) {
      const t = stripHtml(m[1]).trim()
      if (t.length > 2 && t.length < 120) return t
    }
  }
  const base = filename.replace(/\.[^.]+$/, '').split('/').pop() ?? ''
  return base.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function extractMetaContent(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')
  const m = html.match(re)
  return m ? m[1].trim() : ''
}

function extractVideoUrl(html: string): string | undefined {
  const yt = html.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+/)
  if (yt) return yt[0]
  const embed = html.match(/https?:\/\/(?:www\.)?youtube\.com\/embed\/([\w-]+)/)
  if (embed) return `https://www.youtube.com/watch?v=${embed[1]}`
  const archive = html.match(/https?:\/\/archive\.org\/(?:details|download)\/[\w./-]+/)
  if (archive) return archive[0]
}

// ── MIT OCW filename parsing ────────────────────────────────────────────────

// MIT OCW PDFs are named:  {32-char-hash}_{COURSECODE}_{TYPE}{NUMBER}[{variant}].pdf
// e.g. f5bfda06e197c3be37bb46cb27dd83db_MIT18_01SCF10_Ses74b.pdf

// Terms that mark non-lecture files (anywhere in the name after course prefix)
const EXCLUDE_TERMS = ['exam', 'sol', 'soln', 'ans', 'answer', 'pset', 'prb', 'problem', 'quiz', 'syllabus', 'calendar']

interface OcwFile {
  zipPath: string
  type: string      // 'ses' | 'lec' | 'rec' | ...
  sessionId: string // '1', '74b', '1a', etc.
}

function parseOcwFilename(zipPath: string): OcwFile | null {
  const raw = zipPath.split('/').pop() ?? zipPath
  // Strip 32-char hex content-hash prefix that MIT OCW prepends
  const name = raw
    .replace(/^[0-9a-f]{32}[_-]/i, '')
    .replace(/\.pdf$/i, '')
    .toLowerCase()

  // Must match: ..._{type}{digits}{optional-single-letter}  (at end of name)
  const m = name.match(/_(ses|lec|rec|notes|reading)(\d+)([a-z]?)$/)
  if (!m) return null

  const type = m[1]
  const digits = m[2]
  const letter = m[3] // single letter variant like 'a', 'b' — or empty

  // Reject if the full name contains exclusion terms
  if (EXCLUDE_TERMS.some(t => name.includes(t))) return null

  // Reject if the part after the type+number contains multi-letter suffixes
  // (catches edge cases like "ses31sol" where letter would be 's' but 'ol' follows)
  // We already anchored to end-of-string with $, so this is safe.

  return { zipPath, type, sessionId: digits + letter }
}

function sessionTitle(type: string, sessionId: string): string {
  const labels: Record<string, string> = { ses: 'Session', lec: 'Lecture', rec: 'Recitation' }
  return `${labels[type] ?? type} ${sessionId.toUpperCase()}`
}

// ── Syllabus / calendar parsing ─────────────────────────────────────────────

interface SessionInfo {
  title: string
  unit: string
  section?: string
}

/**
 * Parse an MIT OCW calendar or syllabus HTML page.
 * Returns a map from normalised session ID → {title, unit}.
 * Works by scanning all <tr> rows in the page for:
 *   • unit-header rows  (colspan or "Unit N:" / "Part N:" text)
 *   • session rows      (first cell = ID, second cell = topic)
 */
function parseSyllabusHtml(html: string): Map<string, SessionInfo> {
  const map = new Map<string, SessionInfo>()
  let currentUnit = 'Lectures'
  let currentSection: string | undefined = undefined

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]

  for (const [, rowHtml] of rows) {
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(([, inner]) => stripHtml(inner).replace(/\s+/g, ' ').trim())
      .filter(c => c.length > 0)

    if (cells.length === 0) continue

    const hasColspan = /colspan\s*=\s*["']?[2-9]/.test(rowHtml)

    if (hasColspan || (cells.length === 1 && cells[0].length > 4)) {
      const candidate = cells[0]
      if (
        /unit|part|section|chapter|week/i.test(candidate) ||
        !/^\d/.test(candidate)
      ) {
        // "Part X" without "Unit" → sub-section within the current unit
        if (/\bpart\b/i.test(candidate) && !/\bunit\b/i.test(candidate)) {
          currentSection = candidate
        } else {
          currentUnit = candidate
          currentSection = undefined
        }
        continue
      }
    }

    // Session row: first cell is a session identifier
    if (cells.length >= 2) {
      const rawId = cells[0]
      const topic = cells[1]

      if (/^(ses|lec|topic|#|week|date|session)/i.test(rawId)) continue
      if (rawId.length > 10) continue

      const parts = rawId.split(/[-–&,\s]+/).map(s => s.trim().toLowerCase())

      for (const part of parts) {
        if (/^[a-z]?\d+[a-z]?$/.test(part)) {
          map.set(part, { title: topic, unit: currentUnit, section: currentSection })
        }
      }
    }
  }

  return map
}

function findSyllabusPath(allFiles: string[]): string | undefined {
  // Prefer calendar over syllabus; prefer HTML pages subfolder
  const candidates = allFiles.filter(p => {
    const lower = p.toLowerCase()
    return (
      (lower.endsWith('.html') || lower.endsWith('.htm')) &&
      (lower.includes('calendar') || lower.includes('syllabus') || lower.includes('schedule'))
    )
  })
  // Prefer the one with "calendar" in the name
  return (
    candidates.find(p => p.toLowerCase().includes('calendar')) ??
    candidates[0]
  )
}

function matchSession(
  sessionId: string,
  syllabusMap: Map<string, SessionInfo>,
): SessionInfo | null {
  // Exact match
  const exact = syllabusMap.get(sessionId)
  if (exact) return exact
  // Try without trailing letter suffix: "74b" → "74"
  const noLetter = sessionId.replace(/[a-z]$/, '')
  if (noLetter !== sessionId) return syllabusMap.get(noLetter) ?? null
  return null
}

// ── PDF text extraction ─────────────────────────────────────────────────────

async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data }).promise
  const pageCount = Math.min(pdf.numPages, 30)
  const parts: string[] = []
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .filter((item): item is TextItem => 'str' in item)
      .map(item => item.str)
      .join(' ')
    parts.push(text)
  }
  return parts.join('\n').replace(/\s{2,}/g, ' ').trim().slice(0, 8000)
}

// ── HTML-based lecture detection (non-PDF courses) ──────────────────────────

function isHtmlLecturePath(path: string): boolean {
  const lower = path.toLowerCase()
  if (!lower.endsWith('.html') && !lower.endsWith('.htm')) return false
  if (lower.includes('index')) return false
  const folders = ['lecture', 'lec', 'notes', 'readings', 'slides', 'recitation']
  const parts = lower.split('/')
  return (
    parts.some(p => folders.some(f => p.startsWith(f))) ||
    /^(lec|lecture|class|session|rec)\d/.test(parts[parts.length - 1])
  )
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ParseProgress {
  stage: 'reading' | 'extracting' | 'done'
  current: number
  total: number
  message: string
}

export async function parseCourseZip(
  file: File,
  _settings: AppSettings,
  onProgress?: (p: ParseProgress) => void,
): Promise<Course> {
  onProgress?.({ stage: 'reading', current: 0, total: 1, message: 'Reading ZIP…' })

  const zip = await JSZip.loadAsync(file)
  const allFiles = Object.keys(zip.files).filter(p => !zip.files[p].dir)

  // ── Course metadata from index page ────────────────────────────────────────
  const indexPath = allFiles.find(p => {
    const lower = p.toLowerCase()
    return (
      lower.match(/^[^/]*\/(index\.html?|course_info\.html?)$/) ||
      lower === 'index.html' ||
      lower === 'index.htm'
    )
  })

  let courseTitle = file.name.replace(/\.zip$/i, '').replace(/[-_]/g, ' ')
  let instructor = ''
  let description = ''
  let subject = ''
  let level = ''

  if (indexPath) {
    const indexHtml = await zip.files[indexPath].async('string')
    const t = extractTitle(indexHtml, indexPath)
    if (t && t.length < 120) courseTitle = t
    instructor =
      extractMetaContent(indexHtml, 'author') ||
      (indexHtml.match(/instructor[s]?[:\s]+([^\n<]{2,60})/i)?.[1]?.trim() ?? '')
    description =
      extractMetaContent(indexHtml, 'description') || stripHtml(indexHtml).slice(0, 300)
    subject = extractMetaContent(indexHtml, 'subject')
    level = indexHtml.match(/undergrad|graduate|grad/i)?.[0] ?? ''
  }

  const courseId = randomId()
  const lectures: Lecture[] = []

  // ── Pass 1: MIT OCW deterministic parsing ───────────────────────────────────
  const allPdfs = allFiles.filter(p => p.toLowerCase().endsWith('.pdf'))
  const ocwFiles = allPdfs.map(parseOcwFilename).filter((f): f is OcwFile => f !== null)

  if (ocwFiles.length >= 3) {
    // Load syllabus for title/unit lookup
    let syllabusMap = new Map<string, SessionInfo>()
    const sylPath = findSyllabusPath(allFiles)
    if (sylPath) {
      const sylHtml = await zip.files[sylPath].async('string')
      syllabusMap = parseSyllabusHtml(sylHtml)
    }

    // Sort by type then session number so lectures come in course order
    ocwFiles.sort((a, b) => {
      const typeOrder: Record<string, number> = { ses: 0, lec: 0, rec: 1 }
      const tDiff = (typeOrder[a.type] ?? 2) - (typeOrder[b.type] ?? 2)
      if (tDiff !== 0) return tDiff
      // Numeric sort on session ID: "9" < "10" < "74b"
      const aNum = parseInt(a.sessionId, 10)
      const bNum = parseInt(b.sessionId, 10)
      if (aNum !== bNum) return aNum - bNum
      return a.sessionId.localeCompare(b.sessionId)
    })

    const matched = ocwFiles.filter(f => matchSession(f.sessionId, syllabusMap) !== null).length
    onProgress?.({
      stage: 'extracting',
      current: 0,
      total: ocwFiles.length,
      message: sylPath
        ? `Found ${ocwFiles.length} lectures (${matched}/${syllabusMap.size} matched from syllabus)…`
        : `Found ${ocwFiles.length} lectures (no syllabus — using session IDs)…`,
    })

    for (let i = 0; i < ocwFiles.length; i++) {
      const f = ocwFiles[i]
      const info = matchSession(f.sessionId, syllabusMap)
      const title = info?.title ?? sessionTitle(f.type, f.sessionId)
      const unit = info?.unit ?? (f.type === 'rec' ? 'Recitations' : 'Lectures')

      onProgress?.({
        stage: 'extracting',
        current: i + 1,
        total: ocwFiles.length,
        message: `Extracting ${i + 1}/${ocwFiles.length}: ${title}…`,
      })

      try {
        const bytes = await zip.files[f.zipPath].async('uint8array')
        const content = await extractPdfText(bytes)
        if (content.length < 50) continue

        lectures.push({
          id: randomId(),
          courseId,
          title,
          unit,
          section: info?.section,
          order: lectures.length + 1,
          content,
          hasSegment: false,
        })
      } catch {
        // Skip unreadable PDFs
      }
    }
  }

  // ── Pass 2: HTML lecture files ──────────────────────────────────────────────
  if (lectures.length === 0) {
    const htmlPaths = allFiles.filter(isHtmlLecturePath).sort()
    onProgress?.({
      stage: 'extracting',
      current: 0,
      total: htmlPaths.length,
      message: `Found ${htmlPaths.length} HTML lectures…`,
    })
    for (let i = 0; i < htmlPaths.length; i++) {
      const path = htmlPaths[i]
      onProgress?.({
        stage: 'extracting',
        current: i + 1,
        total: htmlPaths.length,
        message: `Extracting lecture ${i + 1}/${htmlPaths.length}…`,
      })
      const html = await zip.files[path].async('string')
      const content = stripHtml(html).slice(0, 8000)
      if (content.length < 50) continue
      lectures.push({
        id: randomId(),
        courseId,
        title: extractTitle(html, path),
        unit: '',
        order: i + 1,
        content,
        videoUrl: extractVideoUrl(html),
        hasSegment: false,
      })
    }
  }

  // ── Pass 3: All non-index HTML (last resort) ────────────────────────────────
  if (lectures.length === 0) {
    const htmlFiles = allFiles
      .filter(p => (p.endsWith('.html') || p.endsWith('.htm')) && !p.toLowerCase().includes('index'))
      .sort()
    for (let i = 0; i < htmlFiles.length; i++) {
      const path = htmlFiles[i]
      const html = await zip.files[path].async('string')
      const content = stripHtml(html).slice(0, 8000)
      if (content.length < 50) continue
      lectures.push({
        id: randomId(),
        courseId,
        title: extractTitle(html, path),
        unit: '',
        order: i + 1,
        content,
        videoUrl: extractVideoUrl(html),
        hasSegment: false,
      })
    }
  }

  onProgress?.({ stage: 'done', current: lectures.length, total: lectures.length, message: 'Done!' })

  return {
    id: courseId,
    title: courseTitle,
    description,
    instructor,
    subject,
    level,
    importedAt: Date.now(),
    lectures,
    completedSegments: 0,
  }
}
