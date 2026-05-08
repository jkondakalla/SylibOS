import { useMemo, useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { generateLessonContent } from '../lib/aiService'
import type { Lecture, Segment } from '../types'

const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488']

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

type SectionGroup = { name: string | undefined; lectures: Lecture[] }
type UnitGroup = { unit: string; color: string; unitNum: number; sections: SectionGroup[]; total: number; done: number }

export default function CoursePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { courses, segments, settings, addSegment, removeCourse } = useAppStore()
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const course = courses.find(c => c.id === id)

  useEffect(() => {
    if (!course) navigate('/')
  }, [course, navigate])

  const unitGroups = useMemo<UnitGroup[]>(() => {
    if (!course) return []
    const groups: UnitGroup[] = []
    const unitIdx: Record<string, number> = {}

    for (const lec of course.lectures) {
      const unit = lec.unit || 'Lectures'
      if (unitIdx[unit] === undefined) {
        unitIdx[unit] = groups.length
        groups.push({ unit, color: PALETTE[groups.length % PALETTE.length], unitNum: groups.length + 1, sections: [], total: 0, done: 0 })
      }
      const ug = groups[unitIdx[unit]]
      ug.total++
      const seg = lec.segmentId ? segments[lec.segmentId] : null
      if (seg?.completedAt) ug.done++

      const sec = lec.section
      const last = ug.sections[ug.sections.length - 1]
      if (!last || last.name !== sec) {
        ug.sections.push({ name: sec, lectures: [lec] })
      } else {
        last.lectures.push(lec)
      }
    }
    return groups
  }, [course, segments])

  // Expand first unit by default
  useEffect(() => {
    if (unitGroups.length > 0) {
      setExpandedUnits(new Set([unitGroups[0].unit]))
    }
  }, [unitGroups.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleUnit(unit: string) {
    setExpandedUnits(prev => {
      const next = new Set(prev)
      next.has(unit) ? next.delete(unit) : next.add(unit)
      return next
    })
  }

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function generateForLecture(lectureId: string) {
    if (!course) return
    const lec = course.lectures.find(l => l.id === lectureId)
    if (!lec) return
    setGeneratingId(lectureId)
    try {
      const content = await generateLessonContent(settings, lec.title, lec.content)
      const segment: Segment = {
        id: randomId(),
        lectureId: lec.id,
        courseId: course.id,
        lectureTitle: lec.title,
        courseTitle: course.title,
        unit: lec.unit,
        section: lec.section,
        generatedAt: Date.now(),
        quiz: content.quiz,
        tasks: content.tasks,
      }
      addSegment(segment)
    } finally {
      setGeneratingId(null)
    }
  }

  function handleDelete() {
    if (!course) return
    if (confirm(`Delete "${course.title}"? This cannot be undone.`)) {
      removeCourse(course.id)
      navigate('/')
    }
  }

  if (!course) return null

  const total = course.lectures.length
  const completed = course.completedSegments
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {/* Back */}
      <Link to="/" style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 24 }}>
        ← Today
      </Link>

      {/* Course header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              {course.title}
            </h1>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {[course.instructor, course.level].filter(Boolean).join(' · ')}
            </div>
            {course.description && (
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#4b5563', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {course.description}
              </p>
            )}
          </div>
          <button
            onClick={handleDelete}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', fontSize: 12, padding: '4px 8px', borderRadius: 6, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
          >
            Delete
          </button>
        </div>

        {/* Overall progress bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
          <span>{total} lectures · {unitGroups.length} {unitGroups.length === 1 ? 'unit' : 'units'}</span>
          <span style={{ color: '#9ca3af', fontWeight: 500 }}>{pct}% complete</span>
        </div>
        <div style={{ height: 4, background: '#2a2a35', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#818cf8', borderRadius: 2, width: `${pct}%`, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Unit cards */}
      {unitGroups.map(ug => {
        const unitPct = ug.total > 0 ? Math.round((ug.done / ug.total) * 100) : 0
        const isExpanded = expandedUnits.has(ug.unit)
        const hasSections = ug.sections.some(s => s.name)

        return (
          <div key={ug.unit} style={{ background: '#18181f', border: '1px solid #2a2a35', borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
            {/* Unit header row */}
            <button
              onClick={() => toggleUnit(ug.unit)}
              style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: `${ug.color}20`, border: `1px solid ${ug.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: ug.color,
              }}>
                {ug.unitNum}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{ug.unit}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{ug.total} lessons · {ug.done} completed</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 60, height: 3, background: '#2a2a35', borderRadius: 2 }}>
                  <div style={{ width: `${unitPct}%`, height: '100%', background: ug.color, borderRadius: 2 }} />
                </div>
                <button
                  onClick={e => { e.stopPropagation(); navigate('/'); }}
                  style={{
                    fontSize: 11, background: `${ug.color}20`, border: `1px solid ${ug.color}40`,
                    borderRadius: 6, padding: '4px 10px', color: ug.color, cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  Study
                </button>
                <span style={{ color: '#4b5563', fontSize: 14, display: 'inline-block', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : '' }}>›</span>
              </div>
            </button>

            {/* Expanded: sections + lectures */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #2a2a35' }}>
                {ug.sections.map((sg, si) => {
                  const secKey = `${ug.unit}::${sg.name ?? si}`
                  const isSecCollapsed = collapsedSections.has(secKey)

                  return (
                    <div key={secKey}>
                      {/* Section header */}
                      {hasSections && sg.name && (
                        <button
                          onClick={() => toggleSection(secKey)}
                          style={{
                            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                            padding: '10px 20px 6px 72px', display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            {sg.name}
                          </span>
                          <span style={{ color: '#374151', fontSize: 14, display: 'inline-block', transition: 'transform 0.2s', transform: isSecCollapsed ? '' : 'rotate(90deg)' }}>›</span>
                        </button>
                      )}

                      {/* Lecture rows */}
                      {!isSecCollapsed && sg.lectures.map(lec => {
                        const seg = lec.segmentId ? segments[lec.segmentId] : null
                        const isDone = !!seg?.completedAt
                        const isGenerating = generatingId === lec.id

                        return (
                          <div
                            key={lec.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 20px 10px 72px',
                              borderBottom: '1px solid #1e1e28',
                            }}
                          >
                            <div style={{
                              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                              border: isDone ? 'none' : '1.5px solid #374151',
                              background: isDone ? ug.color : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isDone && <span style={{ fontSize: 9, color: '#fff' }}>✓</span>}
                            </div>
                            <span style={{ fontSize: 13, color: isDone ? '#4b5563' : '#9ca3af', flex: 1, textDecoration: isDone ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lec.title}
                            </span>

                            {seg && !isDone ? (
                              <Link
                                to={`/lesson/${seg.id}`}
                                style={{ fontSize: 11, background: `${ug.color}20`, border: `1px solid ${ug.color}40`, borderRadius: 6, padding: '4px 10px', color: ug.color, textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}
                              >
                                Start
                              </Link>
                            ) : !seg && !isDone ? (
                              <button
                                onClick={() => generateForLecture(lec.id)}
                                disabled={isGenerating}
                                style={{ fontSize: 11, border: '1px solid #2a2a35', borderRadius: 6, padding: '4px 10px', color: isGenerating ? '#4b5563' : '#6b7280', background: 'none', cursor: isGenerating ? 'default' : 'pointer', flexShrink: 0 }}
                              >
                                {isGenerating ? 'Generating…' : 'Generate'}
                              </button>
                            ) : (
                              <span style={{ fontSize: 10, color: '#374151', flexShrink: 0 }}>›</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
