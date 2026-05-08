import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import type { QuizQuestion, Task } from '../types'

const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488']

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/)
  return m ? m[1] : null
}

// ── Quiz ──────────────────────────────────────────────────────────────────────

function QuizBlock({ questions, onComplete }: { questions: QuizQuestion[]; onComplete: (score: number) => void }) {
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [answers, setAnswers] = useState<boolean[]>([])

  const q = questions[current]
  const isLast = current === questions.length - 1

  function confirm() {
    if (selected === null) return
    setRevealed(true)
    const correct = selected === q.correctIndex
    const next = [...answers, correct]
    setAnswers(next)
    if (isLast) setTimeout(() => onComplete(next.filter(Boolean).length), 1200)
  }

  function advance() {
    setCurrent(c => c + 1)
    setSelected(null)
    setRevealed(false)
  }

  return (
    <div>
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {questions.map((_, i) => (
          <div key={i} style={{
            height: 4, flex: 1, borderRadius: 2,
            background: i < answers.length ? (answers[i] ? '#22c55e' : '#ef4444') : i === current ? '#818cf8' : '#2a2a35',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>Question {current + 1} of {questions.length}</p>
      <h3 style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 20, lineHeight: 1.5 }}>{q.question}</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {q.options.map((opt, idx) => {
          let bg = '#18181f', border = '#2a2a35', color = '#9ca3af'
          if (selected === idx && !revealed) { bg = '#818cf820'; border = '#818cf8'; color = '#c7d2fe' }
          if (revealed && idx === q.correctIndex) { bg = '#16a34a20'; border = '#22c55e'; color = '#86efac' }
          if (revealed && selected === idx && idx !== q.correctIndex) { bg = '#ef444420'; border = '#ef4444'; color = '#fca5a5' }
          return (
            <button
              key={idx}
              onClick={() => !revealed && setSelected(idx)}
              disabled={revealed}
              style={{ textAlign: 'left', padding: '12px 16px', background: bg, border: `1px solid ${border}`, borderRadius: 10, color, fontSize: 14, cursor: revealed ? 'default' : 'pointer', transition: 'all 0.15s' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 11, marginRight: 8, opacity: 0.5 }}>{['A','B','C','D'][idx]}</span>
              {opt}
            </button>
          )
        })}
      </div>

      {revealed && q.explanation && (
        <div style={{ background: '#1e1e28', border: '1px solid #2a2a35', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>Explanation</p>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>{q.explanation}</p>
        </div>
      )}

      {!revealed ? (
        <button
          onClick={confirm}
          disabled={selected === null}
          style={{ width: '100%', background: selected !== null ? '#818cf8' : '#2a2a35', color: '#fff', fontWeight: 600, padding: '12px', borderRadius: 10, border: 'none', cursor: selected !== null ? 'pointer' : 'default', fontSize: 14, transition: 'background 0.15s' }}
        >
          Check answer
        </button>
      ) : !isLast ? (
        <button
          onClick={advance}
          style={{ width: '100%', background: '#1e1e28', border: '1px solid #2a2a35', color: '#e8e8ee', fontWeight: 600, padding: '12px', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}
        >
          Next question →
        </button>
      ) : (
        <div style={{ textAlign: 'center', fontSize: 13, color: '#6b7280' }}>Finishing quiz…</div>
      )}
    </div>
  )
}

// ── Task Timer ────────────────────────────────────────────────────────────────

function TaskBlock({ tasks, onComplete }: { tasks: Task[]; onComplete: () => void }) {
  const [taskIdx, setTaskIdx] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(tasks[0].durationMinutes * 60)
  const [running, setRunning] = useState(false)
  const [completedTasks, setCompletedTasks] = useState<boolean[]>([])

  const task = tasks[taskIdx]
  const total = task.durationMinutes * 60
  const pct = ((total - secondsLeft) / total) * 100

  useEffect(() => {
    if (!running || secondsLeft <= 0) return
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearInterval(t)
  }, [running, secondsLeft])

  useEffect(() => {
    if (secondsLeft === 0) setRunning(false)
  }, [secondsLeft])

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60

  function markDone() {
    const next = [...completedTasks, true]
    setCompletedTasks(next)
    if (taskIdx < tasks.length - 1) {
      const nextTask = tasks[taskIdx + 1]
      setTaskIdx(taskIdx + 1)
      setSecondsLeft(nextTask.durationMinutes * 60)
      setRunning(false)
    } else {
      onComplete()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {tasks.map((_, i) => (
          <div key={i} style={{
            height: 4, flex: 1, borderRadius: 2,
            background: i < completedTasks.length ? '#22c55e' : i === taskIdx ? '#f59e0b' : '#2a2a35',
          }} />
        ))}
      </div>

      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Task {taskIdx + 1} of {tasks.length}</p>

      <div style={{ background: '#1e1e28', border: '1px solid #2a2a35', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <p style={{ color: '#e8e8ee', lineHeight: 1.7, margin: 0 }}>{task.description}</p>
      </div>

      {/* Timer */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ position: 'relative', width: 112, height: 112, marginBottom: 16 }}>
          <svg style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} width="112" height="112">
            <circle cx="56" cy="56" r="44" fill="none" stroke="#2a2a35" strokeWidth="8" />
            <circle cx="56" cy="56" r="44" fill="none"
              stroke={secondsLeft === 0 ? '#22c55e' : '#f59e0b'}
              strokeWidth="8"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={2 * Math.PI * 44 * (1 - pct / 100)}
              strokeLinecap="round"
              style={{ transition: running ? 'stroke-dashoffset 1s linear' : undefined }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#fff' }}>
              {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {secondsLeft > 0 && (
            <button
              onClick={() => setRunning(r => !r)}
              style={{ background: '#d97706', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {running ? 'Pause' : secondsLeft === total ? 'Start timer' : 'Resume'}
            </button>
          )}
          <button
            onClick={markDone}
            style={{ background: '#16a34a', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Done ✓
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lesson Page ───────────────────────────────────────────────────────────────

type Phase = 'content' | 'quiz' | 'tasks' | 'done'

export default function Lesson() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { segments, courses, completeSegment } = useAppStore()
  const [phase, setPhase] = useState<Phase>('content')
  const [quizScore, setQuizScore] = useState(0)

  const seg = id ? segments[id] : null
  const course = seg ? courses.find(c => c.id === seg.courseId) : null
  const lecture = course?.lectures.find(l => l.id === seg?.lectureId) ?? null

  // Unit color
  const unitColor = useMemo(() => {
    if (!course || !seg) return '#818cf8'
    const units = [...new Set(course.lectures.map(l => l.unit || 'Lectures'))]
    const idx = units.indexOf(seg.unit || 'Lectures')
    return PALETTE[Math.max(0, idx) % PALETTE.length]
  }, [course, seg])

  // Prev/next navigation
  const orderedSegIds = useMemo(
    () => (course?.lectures ?? []).filter(l => l.segmentId).map(l => l.segmentId!),
    [course?.lectures],
  )
  const segIdx = orderedSegIds.indexOf(id ?? '')
  const prevSegId = segIdx > 0 ? orderedSegIds[segIdx - 1] : null
  const nextSegId = segIdx < orderedSegIds.length - 1 ? orderedSegIds[segIdx + 1] : null

  useEffect(() => {
    if (!seg) navigate('/')
  }, [seg, navigate])

  const handleQuizDone = useCallback((score: number) => {
    setQuizScore(score)
    setPhase('tasks')
  }, [])

  const handleTasksDone = useCallback(() => setPhase('done'), [])

  const handleFinish = useCallback(() => {
    if (!seg) return
    completeSegment(seg.id, quizScore)
    navigate(`/course/${seg.courseId}`)
  }, [seg, quizScore, completeSegment, navigate])

  const handleFinishAndContinue = useCallback(() => {
    if (!seg || !nextSegId) return
    completeSegment(seg.id, quizScore)
    navigate(`/lesson/${nextSegId}`)
  }, [seg, quizScore, completeSegment, navigate, nextSegId])

  if (!seg) return null

  const phaseOrder: Phase[] = ['content', 'quiz', 'tasks', 'done']
  const phaseLabels: Record<Phase, string> = { content: 'Read', quiz: 'Quiz', tasks: 'Practice', done: 'Done' }
  const currentPhaseIdx = phaseOrder.indexOf(phase)

  const ytId = lecture?.videoUrl ? getYouTubeId(lecture.videoUrl) : null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px' }}>

      {/* Breadcrumb + prev/next */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4b5563' }}>
          <Link to="/" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 500 }}>Today</Link>
          <span>›</span>
          <Link to={`/course/${seg.courseId}`} style={{ color: unitColor, textDecoration: 'none' }}>{seg.unit || 'Lectures'}</Link>
          <span>›</span>
          <span style={{ color: '#6b7280' }}>{phaseLabels[phase]}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {prevSegId && (
            <Link to={`/lesson/${prevSegId}`} style={{ fontSize: 11, background: '#18181f', border: '1px solid #2a2a35', borderRadius: 7, padding: '5px 12px', color: '#6b7280', textDecoration: 'none' }}>
              ← Prev
            </Link>
          )}
          {nextSegId && (
            <Link to={`/lesson/${nextSegId}`} style={{ fontSize: 11, background: '#18181f', border: '1px solid #2a2a35', borderRadius: 7, padding: '5px 12px', color: '#6b7280', textDecoration: 'none' }}>
              Next →
            </Link>
          )}
        </div>
      </div>

      {/* Phase indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
        {(['content', 'quiz', 'tasks'] as Phase[]).map((p, i) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, transition: 'all 0.2s',
              background: phase === p ? unitColor : currentPhaseIdx > i ? '#16a34a20' : '#18181f',
              color: phase === p ? '#fff' : currentPhaseIdx > i ? '#86efac' : '#4b5563',
              border: `1px solid ${phase === p ? unitColor : currentPhaseIdx > i ? '#22c55e40' : '#2a2a35'}`,
            }}>
              {phaseLabels[p]}
            </div>
            {i < 2 && <div style={{ width: 20, height: 1, background: '#2a2a35' }} />}
          </div>
        ))}
      </div>

      {/* Lesson title */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: unitColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          {seg.unit || 'Lecture'}
          {seg.section ? ` · ${seg.section}` : ''}
        </div>
        <h1 style={{ margin: '0', fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          {seg.lectureTitle}
        </h1>
      </div>

      {/* ── Phase: Content ── */}
      {phase === 'content' && (
        <div>
          {/* Video */}
          {lecture?.videoUrl && (
            <div style={{ background: '#18181f', border: '1px solid #2a2a35', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
              {ytId ? (
                <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#0f0f13' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${ytId}`}
                    title={seg.lectureTitle}
                    frameBorder="0"
                    allowFullScreen
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  />
                </div>
              ) : (
                <a
                  href={lecture.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textDecoration: 'none' }}
                >
                  <span style={{ fontSize: 24 }}>▶</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#e8e8ee' }}>Watch lecture video</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{lecture.videoUrl}</p>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#4b5563' }}>↗</span>
                </a>
              )}
            </div>
          )}

          {/* Lecture notes */}
          <div style={{ marginBottom: 12, fontSize: 11, fontWeight: 600, color: '#4b5563', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Lecture Notes
          </div>
          <div style={{ background: '#18181f', border: '1px solid #2a2a35', borderRadius: 12, padding: 20, marginBottom: 24, maxHeight: 340, overflowY: 'auto' }}>
            {lecture?.content ? (
              <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {lecture.content}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: '#4b5563', fontStyle: 'italic' }}>
                Lecture content not available — review your materials before the quiz.
              </p>
            )}
          </div>

          <button
            onClick={() => setPhase('quiz')}
            style={{ width: '100%', background: unitColor, color: '#fff', fontWeight: 600, padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 15, letterSpacing: '-0.01em' }}
          >
            Ready — start quiz →
          </button>
        </div>
      )}

      {/* ── Phase: Quiz ── */}
      {phase === 'quiz' && (
        <div style={{ background: '#18181f', border: '1px solid #2a2a35', borderRadius: 16, padding: 24 }}>
          <QuizBlock questions={seg.quiz} onComplete={handleQuizDone} />
        </div>
      )}

      {/* ── Phase: Tasks ── */}
      {phase === 'tasks' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#1a1a12', border: '1px solid #f59e0b30', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <span style={{ fontSize: 18 }}>📝</span>
            <p style={{ margin: 0, fontSize: 13, color: '#fcd34d' }}>
              Quiz done — {quizScore}/{seg.quiz.length} correct. Now do the practice tasks.
            </p>
          </div>
          <div style={{ background: '#18181f', border: '1px solid #2a2a35', borderRadius: 16, padding: 24 }}>
            <TaskBlock tasks={seg.tasks} onComplete={handleTasksDone} />
          </div>
        </div>
      )}

      {/* ── Phase: Done ── */}
      {phase === 'done' && (
        <div style={{ background: '#18181f', border: '1px solid #2a2a35', borderRadius: 16, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#fff' }}>Lesson complete!</h2>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>
            Quiz score: <span style={{ color: '#fff', fontWeight: 600 }}>{quizScore}/{seg.quiz.length}</span>
          </p>
          <p style={{ margin: '0 0 28px', fontSize: 13, color: '#6b7280' }}>All practice tasks done</p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleFinish}
              style={{ background: '#1e1e28', border: '1px solid #2a2a35', color: '#9ca3af', fontWeight: 600, padding: '11px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}
            >
              Back to course
            </button>
            {nextSegId ? (
              <button
                onClick={handleFinishAndContinue}
                style={{ background: unitColor, border: 'none', color: '#fff', fontWeight: 600, padding: '11px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}
              >
                Complete & continue →
              </button>
            ) : (
              <button
                onClick={handleFinish}
                style={{ background: '#16a34a', border: 'none', color: '#fff', fontWeight: 600, padding: '11px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}
              >
                Save & finish
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
