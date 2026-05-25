import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { getTodayProgress, getStreak } from '../lib/scheduler'
import type { Lecture } from '../types'

const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488']

function GoalRing({ done, goal }: { done: number; goal: number }) {
  const pct = goal > 0 ? Math.min(done / goal, 1) : 0
  const r = 32
  const circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} width="80" height="80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#2a2a35" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={pct >= 1 ? '#22c55e' : '#818cf8'}
          strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
        {done}<span style={{ color: '#4b5563', fontSize: 11 }}>/{goal}</span>
      </span>
    </div>
  )
}

type SectionGroup = { name: string | undefined; lectures: Lecture[] }
type UnitGroup = {
  unit: string; color: string; unitNum: number
  sections: SectionGroup[]
  totalLecs: number; doneLecs: number; readyLecs: number
}

export default function Home() {
  const { courses, segments, dailyLogs, settings } = useAppStore()

  const { done, goal } = getTodayProgress(dailyLogs, settings.dailyGoal)
  const streak = getStreak(dailyLogs, settings.dailyGoal)

  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [activeUnitName, setActiveUnitName] = useState<string>('')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // Default to most-recently-imported course (store keeps courses sorted DESC)
  useEffect(() => {
    if (courses.length > 0 && !activeCourseId) {
      setActiveCourseId(courses[0].id)
    }
  }, [courses, activeCourseId])

  const activeCourse = courses.find(c => c.id === activeCourseId) ?? courses[0] ?? null

  const unitGroups = useMemo<UnitGroup[]>(() => {
    if (!activeCourse) return []
    const groups: UnitGroup[] = []
    const unitIdx: Record<string, number> = {}

    for (const lec of activeCourse.lectures) {
      const unit = lec.unit || 'Lectures'
      if (unitIdx[unit] === undefined) {
        unitIdx[unit] = groups.length
        groups.push({ unit, color: PALETTE[groups.length % PALETTE.length], unitNum: groups.length + 1, sections: [], totalLecs: 0, doneLecs: 0, readyLecs: 0 })
      }
      const ug = groups[unitIdx[unit]]
      ug.totalLecs++
      const seg = lec.segmentId ? segments[lec.segmentId] : null
      if (seg?.completedAt) ug.doneLecs++
      else if (seg) ug.readyLecs++

      const sec = lec.section
      const last = ug.sections[ug.sections.length - 1]
      if (!last || last.name !== sec) {
        ug.sections.push({ name: sec, lectures: [lec] })
      } else {
        last.lectures.push(lec)
      }
    }
    return groups
  }, [activeCourse, segments])

  // Auto-select first unit with ready lessons
  useEffect(() => {
    if (unitGroups.length === 0) return
    setActiveUnitName(prev => {
      if (prev && unitGroups.some(u => u.unit === prev)) return prev
      return unitGroups.find(u => u.readyLecs > 0)?.unit ?? unitGroups[0]?.unit ?? ''
    })
  }, [unitGroups])

  const activeUnit = unitGroups.find(u => u.unit === activeUnitName)

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (courses.length === 0) {
    return (
      <div style={{ maxWidth: 640, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>📚</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>No courses yet</h2>
        <p style={{ margin: '0 0 28px', fontSize: 14, color: '#6b7280' }}>Import a MIT OCW course ZIP to get started.</p>
        <Link to="/import" style={{ background: '#818cf8', color: '#fff', padding: '10px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
          Import Course →
        </Link>
      </div>
    )
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

      {/* Course header + streak/goal */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#818cf8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Currently studying
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeCourse.title}
          </h1>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {[activeCourse.instructor, activeCourse.level].filter(Boolean).join(' · ')}
            {activeCourse.instructor || activeCourse.level ? '' : `${activeCourse.lectures.length} lectures`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          {streak > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, padding: '6px 12px' }}>
              <span>🔥</span>
              <span style={{ color: '#fb923c', fontWeight: 600 }}>{streak}</span>
              <span style={{ color: 'rgba(251,146,60,0.7)', fontSize: 12 }}>day streak</span>
            </div>
          )}
          <GoalRing done={done} goal={goal} />
        </div>
      </div>

      {/* Active unit card */}
      {activeUnit ? (
        <div style={{
          background: '#18181f',
          border: `1px solid ${activeUnit.color}40`,
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Ambient glow */}
          <div style={{
            position: 'absolute', top: 0, right: 0, width: 220, height: 220,
            background: `radial-gradient(circle, ${activeUnit.color}18 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          {/* Unit header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: activeUnit.color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                Unit {activeUnit.unitNum}
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
                {activeUnit.unit}
              </h2>
            </div>
            <div style={{
              background: `${activeUnit.color}20`, border: `1px solid ${activeUnit.color}40`,
              borderRadius: 20, padding: '4px 12px', fontSize: 12, color: activeUnit.color, fontWeight: 600, flexShrink: 0,
            }}>
              {activeUnit.readyLecs > 0 ? `${activeUnit.readyLecs} ready` : `${activeUnit.doneLecs}/${activeUnit.totalLecs} done`}
            </div>
          </div>

          {/* Sections + lessons */}
          {activeUnit.sections.map((sg, si) => {
            const key = `${activeUnit.unit}::${sg.name ?? si}`
            const isCollapsed = collapsedSections.has(key)
            const hasSections = activeUnit.sections.some(s => s.name)

            return (
              <div key={key} style={{ marginBottom: 4 }}>
                {hasSections && sg.name && (
                  <button
                    onClick={() => toggleSection(key)}
                    style={{
                      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 0', color: '#9ca3af', fontSize: 12, fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'left',
                    }}
                  >
                    <span>{sg.name}</span>
                    <span style={{ transform: isCollapsed ? '' : 'rotate(90deg)', transition: 'transform 0.2s', fontSize: 14 }}>›</span>
                  </button>
                )}

                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                    {sg.lectures.map(lec => {
                      const seg = lec.segmentId ? segments[lec.segmentId] : null
                      const isDone = !!seg?.completedAt
                      return (
                        <div
                          key={lec.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 8, background: '#0f0f13' }}
                        >
                          <div style={{
                            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                            border: isDone ? 'none' : '1.5px solid #374151',
                            background: isDone ? activeUnit.color : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isDone && <span style={{ fontSize: 10, color: '#fff' }}>✓</span>}
                          </div>
                          <span style={{
                            fontSize: 13, flex: 1,
                            color: isDone ? '#4b5563' : '#d1d5db',
                            textDecoration: isDone ? 'line-through' : 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {lec.title}
                          </span>
                          {seg && !isDone && (
                            <Link
                              to={`/lesson/${seg.id}`}
                              style={{ background: activeUnit.color, color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, textDecoration: 'none', flexShrink: 0 }}
                            >
                              Start
                            </Link>
                          )}
                          {!seg && !isDone && (
                            <Link
                              to={`/course/${activeCourse.id}`}
                              style={{ border: '1px solid #2a2a35', color: '#6b7280', fontSize: 11, padding: '4px 12px', borderRadius: 6, textDecoration: 'none', flexShrink: 0 }}
                            >
                              Generate
                            </Link>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* View full course link */}
          <div style={{ marginTop: 12, borderTop: '1px solid #2a2a35', paddingTop: 12 }}>
            <Link
              to={`/course/${activeCourse.id}`}
              style={{ fontSize: 12, color: activeUnit.color, textDecoration: 'none', fontWeight: 500 }}
            >
              View full course →
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ background: '#18181f', border: '1px dashed #2a2a35', borderRadius: 16, padding: 32, textAlign: 'center', marginBottom: 24 }}>
          <p style={{ color: '#6b7280', marginBottom: 12, fontSize: 14 }}>No lessons generated yet.</p>
          <Link to={`/course/${activeCourse.id}`} style={{ background: '#818cf8', color: '#fff', padding: '8px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
            Open course to generate →
          </Link>
        </div>
      )}

      {/* Unit switcher */}
      {unitGroups.length > 1 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            All units
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {unitGroups.map(ug => {
              const isActive = ug.unit === activeUnitName
              const pct = ug.totalLecs > 0 ? Math.round((ug.doneLecs / ug.totalLecs) * 100) : 0
              return (
                <button
                  key={ug.unit}
                  onClick={() => setActiveUnitName(ug.unit)}
                  style={{
                    background: isActive ? `${ug.color}18` : '#18181f',
                    border: `1px solid ${isActive ? ug.color + '60' : '#2a2a35'}`,
                    borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                    textAlign: 'left', minWidth: 130, transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 11, color: isActive ? ug.color : '#4b5563', fontWeight: 600, marginBottom: 4 }}>
                    Unit {ug.unitNum}
                  </div>
                  <div style={{ fontSize: 12, color: isActive ? '#fff' : '#9ca3af', fontWeight: 500, marginBottom: 8, lineHeight: 1.3 }}>
                    {ug.unit}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 3, background: '#2a2a35', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: ug.color, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color: '#4b5563' }}>{pct}%</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Other courses */}
      {courses.length > 1 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Your courses
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {courses.map(course => {
              const isActive = course.id === activeCourse?.id
              const pct = course.lectures.length > 0 ? Math.round((course.completedSegments / course.lectures.length) * 100) : 0
              return (
                <div
                  key={course.id}
                  onClick={() => { setActiveCourseId(course.id); setActiveUnitName('') }}
                  style={{
                    background: isActive ? '#1e1e2a' : '#18181f',
                    border: `1px solid ${isActive ? '#818cf860' : '#2a2a35'}`,
                    borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: isActive ? '#fff' : '#e8e8ee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {course.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{course.lectures.length} lectures</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ width: 64, height: 3, background: '#2a2a35', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#818cf8', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#6b7280', minWidth: 28 }}>{pct}%</span>
                  </div>
                  <Link
                    to={`/course/${course.id}`}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 11, color: '#6b7280', border: '1px solid #2a2a35', padding: '4px 10px', borderRadius: 6, textDecoration: 'none', flexShrink: 0 }}
                  >
                    Open
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Single course: show open button */}
      {courses.length === 1 && (
        <div style={{ marginTop: 8 }}>
          <Link
            to={`/course/${activeCourse.id}`}
            style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}
          >
            View full course outline →
          </Link>
        </div>
      )}
    </div>
  )
}
