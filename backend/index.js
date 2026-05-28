import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import cron from 'node-cron'
import { jkosAuth } from './jkos-auth.js'
import {
  getCourses, getCourse, insertCourse, deleteCourse,
  getSegments, insertSegment, patchSegment, updateCourseCompletedSegments,
  getDailyLogs, upsertDailyLog,
  getSettings, saveSettings,
  getLecturesWithoutSegments,
} from './db.js'
import { generateSegmentContent } from './ai.js'

const app = express()
const PORT = Number(process.env.PORT ?? 8004)
const NIGHTLY_CRON = process.env.NIGHTLY_CRON ?? '0 2 * * *'

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '20mb' }))
app.use(cookieParser())

// ── Health (public — before auth middleware) ───────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'opencourseflow-api' })
})

// ── Auth (all routes below this require a valid jkos_token cookie) ────────────

app.use(jkosAuth({ publicKey: process.env.JKOS_AUTH_PUBLIC_KEY ?? '' }))

// ── Courses ───────────────────────────────────────────────────────────────────

app.get('/api/courses', (_req, res) => {
  res.json(getCourses())
})

app.post('/api/courses', (req, res) => {
  const course = req.body
  if (!course?.id || !course?.title) {
    return res.status(400).json({ error: 'id and title required' })
  }
  insertCourse(course)
  res.status(201).json({ ok: true })
})

app.get('/api/courses/:id', (req, res) => {
  const course = getCourse(req.params.id)
  if (!course) return res.status(404).json({ error: 'Not found' })
  res.json(course)
})

app.delete('/api/courses/:id', (req, res) => {
  deleteCourse(req.params.id)
  res.json({ ok: true })
})

// ── Segments ──────────────────────────────────────────────────────────────────

app.get('/api/segments', (_req, res) => {
  res.json(getSegments())
})

app.post('/api/segments', (req, res) => {
  const seg = req.body
  if (!seg?.id || !seg?.lectureId) {
    return res.status(400).json({ error: 'id and lectureId required' })
  }
  insertSegment(seg)
  res.status(201).json({ ok: true })
})

app.patch('/api/segments/:id', (req, res) => {
  const patch = req.body
  patchSegment(req.params.id, patch)
  if (patch.completedAt !== undefined && patch.courseId) {
    updateCourseCompletedSegments(patch.courseId, 1)
  }
  res.json({ ok: true })
})

// ── Daily logs ────────────────────────────────────────────────────────────────

app.get('/api/daily-logs', (_req, res) => {
  res.json(getDailyLogs())
})

app.post('/api/daily-logs', (req, res) => {
  const log = req.body
  if (!log?.date) return res.status(400).json({ error: 'date required' })
  upsertDailyLog(log)
  res.status(201).json({ ok: true })
})

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => {
  res.json(getSettings())
})

app.put('/api/settings', (req, res) => {
  saveSettings(req.body)
  res.json({ ok: true })
})

// ── Summary (for ORDECK widget) ───────────────────────────────────────────────

app.get('/api/summary', (_req, res) => {
  const courses = getCourses()
  const segments = getSegments()
  const logs = getDailyLogs()
  const settings = getSettings()
  const dailyGoal = settings.dailyGoal ?? 2

  const today = new Date().toISOString().slice(0, 10)
  const todayLog = logs.find(l => l.date === today)
  const todayDone = todayLog?.segmentIds?.length ?? 0

  // Streak — includes today if today's goal is already met
  let streak = 0
  const d = new Date()
  for (let i = 0; i < 366; i++) {
    const key = d.toISOString().slice(0, 10)
    const log = logs.find(l => l.date === key)
    if (log && log.segmentIds.length >= dailyGoal) {
      streak++
      d.setDate(d.getDate() - 1)
    } else if (key === today) {
      d.setDate(d.getDate() - 1)  // today not done yet — check yesterday before breaking
    } else {
      break
    }
  }

  // Active course = most recently imported with incomplete segments
  const activeCourse = courses.find(c => c.completedSegments < c.lectures.length) ?? courses[0]
  let nextLesson = null
  if (activeCourse) {
    const todayDoneIds = new Set(todayLog?.segmentIds ?? [])
    for (const lec of activeCourse.lectures) {
      if (!lec.segmentId) continue
      const seg = segments[lec.segmentId]
      if (!seg || seg.completedAt || todayDoneIds.has(seg.id)) continue
      nextLesson = { segmentId: seg.id, title: seg.lectureTitle }
      break
    }
  }

  res.json({
    todayDone,
    dailyGoal,
    streak,
    activeCourse: activeCourse
      ? {
          title: activeCourse.title,
          total: activeCourse.lectures.length,
          done: activeCourse.completedSegments,
          pct: activeCourse.lectures.length > 0
            ? Math.round((activeCourse.completedSegments / activeCourse.lectures.length) * 100)
            : 0,
        }
      : null,
    nextLesson,
    courseCount: courses.length,
  })
})

// ── Nightly job ───────────────────────────────────────────────────────────────

async function runNightlyJob() {
  const settings = getSettings()
  const lectures = getLecturesWithoutSegments()

  if (lectures.length === 0) {
    console.log('[nightly] No unprocessed lectures found.')
    return
  }

  console.log(`[nightly] Processing ${lectures.length} lectures…`)

  let ok = 0, fail = 0
  for (const lec of lectures) {
    try {
      const content = await generateSegmentContent(settings, lec.title, lec.content, lec.unit, lec.courseTitle)

      insertSegment({
        id: Math.random().toString(36).slice(2, 10),
        lectureId: lec.id,
        courseId: lec.courseId,
        lectureTitle: lec.title,
        courseTitle: lec.courseTitle,
        unit: lec.unit,
        section: lec.section,
        generatedAt: Date.now(),
        quiz: content.quiz,
        tasks: content.tasks,
      })
      ok++
    } catch (e) {
      console.error(`[nightly] Failed for "${lec.title}":`, e.message)
      fail++
    }
  }

  console.log(`[nightly] Done — ${ok} generated, ${fail} failed.`)
}

cron.schedule(NIGHTLY_CRON, () => {
  console.log(`[nightly] Starting job (cron: ${NIGHTLY_CRON})`)
  runNightlyJob().catch(e => console.error('[nightly] Unexpected error:', e))
})

// ── Manifest import (from Python preprocessor output) ────────────────────────
//
// Accepts a CourseManifest JSON (as produced by the preprocessor) and converts
// it to the OCF Course format before inserting. The preprocessor can also POST
// directly to /api/courses using --push-to; this endpoint is for raw manifests.

app.post('/api/import-manifest', (req, res) => {
  const manifest = req.body
  if (!manifest?.units || !Array.isArray(manifest.units)) {
    return res.status(400).json({ error: 'Invalid manifest: units array required' })
  }

  const courseId = Math.random().toString(36).slice(2, 10)
  const lectures = []
  let order = 1

  for (const unit of manifest.units) {
    for (const session of unit.sessions) {
      if (session.is_assessment) continue  // skip assessment/exam sessions by default

      // Build content: overview + first lecture notes text
      const parts = [session.overview ?? '']
      const notes = (session.resources ?? []).find(r => r.primary_type === 'Lecture Notes')
      if (notes?.extracted_text) parts.push(notes.extracted_text)
      const content = parts.join('\n\n').slice(0, 8000).trim()

      // Video URL from first video resource
      const videoResource = (session.resources ?? []).find(r =>
        r.primary_type?.includes('Video') && r.file_path?.startsWith('http')
      )

      lectures.push({
        id:         Math.random().toString(36).slice(2, 10),
        courseId,
        title:      session.title,
        unit:       unit.title,
        section:    null,
        order:      order++,
        content,
        videoUrl:   videoResource?.file_path ?? null,
        hasSegment: false,
        segmentId:  null,
      })
    }
  }

  const description = [
    manifest.goals ?? '',
    manifest.prerequisites ? `Prerequisites: ${manifest.prerequisites}` : '',
  ].filter(Boolean).join('\n\n')

  const course = {
    id:                courseId,
    title:             manifest.title ?? 'Untitled Course',
    description,
    instructor:        '',
    subject:           manifest.department ?? '',
    level:             manifest.term ?? '',
    importedAt:        Date.now(),
    completedSegments: 0,
    lectures,
  }

  insertCourse(course)
  res.status(201).json({ ok: true, courseId, lectureCount: lectures.length })
})

// ── Manual trigger for nightly job ───────────────────────────────────────────

app.post('/api/admin/run-nightly', async (_req, res) => {
  res.json({ ok: true, message: 'Nightly job started' })
  runNightlyJob().catch(e => console.error('[nightly] Error from manual trigger:', e))
})

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[ocf-api] Running on port ${PORT}`)
  console.log(`[ocf-api] DB: ${process.env.DB_PATH ?? 'opencourseflow.db'}`)
  console.log(`[ocf-api] Auth: jkOS Auth RS256 (JKOS_AUTH_PUBLIC_KEY ${process.env.JKOS_AUTH_PUBLIC_KEY ? 'set' : 'MISSING'})`)
  console.log(`[ocf-api] Nightly cron: ${NIGHTLY_CRON}`)
})
