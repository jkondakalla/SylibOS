import Database from 'better-sqlite3'

const DB_PATH = process.env.DB_PATH ?? 'opencourseflow.db'
export const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id                 TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    instructor         TEXT NOT NULL DEFAULT '',
    subject            TEXT NOT NULL DEFAULT '',
    level              TEXT NOT NULL DEFAULT '',
    imported_at        INTEGER NOT NULL,
    completed_segments INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS lectures (
    id         TEXT PRIMARY KEY,
    course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    unit       TEXT NOT NULL DEFAULT '',
    section    TEXT,
    ord        INTEGER NOT NULL DEFAULT 0,
    content    TEXT NOT NULL DEFAULT '',
    video_url  TEXT,
    has_segment INTEGER NOT NULL DEFAULT 0,
    segment_id TEXT
  );

  CREATE TABLE IF NOT EXISTS segments (
    id            TEXT PRIMARY KEY,
    lecture_id    TEXT NOT NULL,
    course_id     TEXT NOT NULL,
    lecture_title TEXT NOT NULL,
    course_title  TEXT NOT NULL,
    unit          TEXT NOT NULL DEFAULT '',
    section       TEXT,
    generated_at  INTEGER NOT NULL,
    quiz          TEXT NOT NULL DEFAULT '[]',
    tasks         TEXT NOT NULL DEFAULT '[]',
    completed_at  INTEGER,
    quiz_score    INTEGER
  );

  CREATE TABLE IF NOT EXISTS daily_logs (
    date         TEXT PRIMARY KEY,
    segment_ids  TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS settings (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL DEFAULT '{}'
  );
  INSERT OR IGNORE INTO settings (id, data) VALUES (1, '{}');
`)

// ── Courses ──────────────────────────────────────────────────────────────────

export function getCourses() {
  const courses = db.prepare('SELECT * FROM courses ORDER BY imported_at DESC').all()
  return courses.map(c => ({
    ...c,
    importedAt: c.imported_at,
    completedSegments: c.completed_segments,
    lectures: db.prepare('SELECT * FROM lectures WHERE course_id = ? ORDER BY ord').all(c.id).map(normLecture),
  }))
}

export function getCourse(id) {
  const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(id)
  if (!c) return null
  return {
    ...c,
    importedAt: c.imported_at,
    completedSegments: c.completed_segments,
    lectures: db.prepare('SELECT * FROM lectures WHERE course_id = ? ORDER BY ord').all(id).map(normLecture),
  }
}

export const insertCourse = db.transaction((course) => {
  db.prepare(`
    INSERT OR REPLACE INTO courses (id, title, description, instructor, subject, level, imported_at, completed_segments)
    VALUES (@id, @title, @description, @instructor, @subject, @level, @imported_at, @completed_segments)
  `).run({
    id: course.id,
    title: course.title,
    description: course.description ?? '',
    instructor: course.instructor ?? '',
    subject: course.subject ?? '',
    level: course.level ?? '',
    imported_at: course.importedAt ?? Date.now(),
    completed_segments: course.completedSegments ?? 0,
  })

  for (const lec of (course.lectures ?? [])) {
    db.prepare(`
      INSERT OR REPLACE INTO lectures (id, course_id, title, unit, section, ord, content, video_url, has_segment, segment_id)
      VALUES (@id, @course_id, @title, @unit, @section, @ord, @content, @video_url, @has_segment, @segment_id)
    `).run({
      id: lec.id,
      course_id: course.id,
      title: lec.title,
      unit: lec.unit ?? '',
      section: lec.section ?? null,
      ord: lec.order ?? 0,
      content: lec.content ?? '',
      video_url: lec.videoUrl ?? null,
      has_segment: lec.hasSegment ? 1 : 0,
      segment_id: lec.segmentId ?? null,
    })
  }
})

export const deleteCourse = db.transaction((id) => {
  db.prepare('DELETE FROM segments WHERE course_id = ?').run(id)
  db.prepare('DELETE FROM courses WHERE id = ?').run(id)
})

// ── Segments ─────────────────────────────────────────────────────────────────

export function getSegments() {
  const rows = db.prepare('SELECT * FROM segments').all()
  const out = {}
  for (const s of rows) out[s.id] = normSegment(s)
  return out
}

export function insertSegment(seg) {
  db.prepare(`
    INSERT OR REPLACE INTO segments
      (id, lecture_id, course_id, lecture_title, course_title, unit, section, generated_at, quiz, tasks, completed_at, quiz_score)
    VALUES
      (@id, @lecture_id, @course_id, @lecture_title, @course_title, @unit, @section, @generated_at, @quiz, @tasks, @completed_at, @quiz_score)
  `).run({
    id: seg.id,
    lecture_id: seg.lectureId,
    course_id: seg.courseId,
    lecture_title: seg.lectureTitle,
    course_title: seg.courseTitle,
    unit: seg.unit ?? '',
    section: seg.section ?? null,
    generated_at: seg.generatedAt ?? Date.now(),
    quiz: JSON.stringify(seg.quiz ?? []),
    tasks: JSON.stringify(seg.tasks ?? []),
    completed_at: seg.completedAt ?? null,
    quiz_score: seg.quizScore ?? null,
  })

  db.prepare('UPDATE lectures SET has_segment = 1, segment_id = ? WHERE id = ?')
    .run(seg.id, seg.lectureId)
}

export function patchSegment(id, patch) {
  if (patch.completedAt !== undefined) {
    db.prepare('UPDATE segments SET completed_at = ?, quiz_score = ? WHERE id = ?')
      .run(patch.completedAt, patch.quizScore ?? null, id)
  }
  if (patch.quiz !== undefined) {
    db.prepare('UPDATE segments SET quiz = ?, tasks = ? WHERE id = ?')
      .run(JSON.stringify(patch.quiz), JSON.stringify(patch.tasks ?? []), id)
  }
}

export function updateCourseCompletedSegments(courseId, delta) {
  db.prepare('UPDATE courses SET completed_segments = completed_segments + ? WHERE id = ?')
    .run(delta, courseId)
}

// ── Daily logs ───────────────────────────────────────────────────────────────

export function getDailyLogs() {
  return db.prepare('SELECT * FROM daily_logs ORDER BY date DESC').all()
    .map(r => ({ date: r.date, segmentIds: JSON.parse(r.segment_ids) }))
}

export function upsertDailyLog(log) {
  db.prepare('INSERT OR REPLACE INTO daily_logs (date, segment_ids) VALUES (?, ?)')
    .run(log.date, JSON.stringify(log.segmentIds ?? []))
}

// ── Settings ─────────────────────────────────────────────────────────────────

// Env-var defaults for the nightly AI job. Any value saved via PUT /api/settings
// (from the frontend) takes precedence because it's merged last via spread below.
const ENV_SETTINGS_DEFAULTS = {
  aiProvider:   process.env.AI_PROVIDER  ?? 'none',
  ollamaUrl:    process.env.OLLAMA_URL   ?? 'http://localhost:11434',
  ollamaModel:  process.env.OLLAMA_MODEL ?? 'llama3.2',
  lazurosUrl:   process.env.LAZUROS_URL  ?? '',
  lazurosToken: process.env.LAZUROS_TOKEN ?? '',
  dailyGoal:    2,
}

export function getSettings() {
  const row = db.prepare('SELECT data FROM settings WHERE id = 1').get()
  const stored = row ? JSON.parse(row.data) : {}
  return { ...ENV_SETTINGS_DEFAULTS, ...stored }
}

export function saveSettings(settings) {
  db.prepare('UPDATE settings SET data = ? WHERE id = 1').run(JSON.stringify(settings))
}

// ── Normalise DB rows to frontend shape ───────────────────────────────────────

function normLecture(r) {
  return {
    id: r.id,
    courseId: r.course_id,
    title: r.title,
    unit: r.unit,
    section: r.section ?? undefined,
    order: r.ord,
    content: r.content,
    videoUrl: r.video_url ?? undefined,
    hasSegment: r.has_segment === 1,
    segmentId: r.segment_id ?? undefined,
  }
}

function normSegment(r) {
  return {
    id: r.id,
    lectureId: r.lecture_id,
    courseId: r.course_id,
    lectureTitle: r.lecture_title,
    courseTitle: r.course_title,
    unit: r.unit,
    section: r.section ?? undefined,
    generatedAt: r.generated_at,
    quiz: JSON.parse(r.quiz),
    tasks: JSON.parse(r.tasks),
    completedAt: r.completed_at ?? undefined,
    quizScore: r.quiz_score ?? undefined,
  }
}

// ── Helpers for nightly job ───────────────────────────────────────────────────

export function getLecturesWithoutSegments() {
  return db.prepare(`
    SELECT l.*, c.title AS course_title
    FROM lectures l
    JOIN courses c ON c.id = l.course_id
    WHERE l.has_segment = 0 AND l.content != ''
  `).all().map(r => ({
    id: r.id,
    courseId: r.course_id,
    courseTitle: r.course_title,
    title: r.title,
    unit: r.unit,
    section: r.section ?? undefined,
    content: r.content,
  }))
}
