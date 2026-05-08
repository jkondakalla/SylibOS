import { create } from 'zustand'
import { db } from '../lib/db'
import { todayKey } from '../lib/scheduler'
import type { Course, Segment, DailyLog, AppSettings } from '../types'

interface AppState {
  courses: Course[]
  segments: Record<string, Segment>
  dailyLogs: DailyLog[]
  settings: AppSettings

  // Course actions
  addCourse: (course: Course) => void
  removeCourse: (courseId: string) => void

  // Segment actions
  addSegment: (segment: Segment) => void
  completeSegment: (segmentId: string, quizScore: number) => void

  // Settings
  updateSettings: (patch: Partial<AppSettings>) => void

  // Hydrate from localStorage
  hydrate: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  courses: [],
  segments: {},
  dailyLogs: [],
  settings: db.getSettings(),

  hydrate: () => {
    set({
      courses: db.getCourses(),
      segments: db.getSegments(),
      dailyLogs: db.getDailyLogs(),
      settings: db.getSettings(),
    })
  },

  addCourse: (course) => {
    const courses = [...get().courses, course]
    db.saveCourses(courses)
    set({ courses })
  },

  removeCourse: (courseId) => {
    const courses = get().courses.filter(c => c.id !== courseId)
    // Remove associated segments
    const segments = { ...get().segments }
    Object.keys(segments).forEach(id => {
      if (segments[id].courseId === courseId) delete segments[id]
    })
    db.saveCourses(courses)
    db.saveSegments(segments)
    set({ courses, segments })
  },

  addSegment: (segment) => {
    const segments = { ...get().segments, [segment.id]: segment }

    // Mark the lecture as having a segment
    const courses = get().courses.map(course => {
      if (course.id !== segment.courseId) return course
      return {
        ...course,
        lectures: course.lectures.map(lec =>
          lec.id === segment.lectureId
            ? { ...lec, hasSegment: true, segmentId: segment.id }
            : lec
        ),
      }
    })

    db.saveSegments(segments)
    db.saveCourses(courses)
    set({ segments, courses })
  },

  completeSegment: (segmentId, quizScore) => {
    const now = Date.now()
    const segments = {
      ...get().segments,
      [segmentId]: {
        ...get().segments[segmentId],
        completedAt: now,
        quizScore,
      },
    }

    // Update course completedSegments count
    const seg = segments[segmentId]
    const courses = get().courses.map(course => {
      if (course.id !== seg.courseId) return course
      return { ...course, completedSegments: course.completedSegments + 1 }
    })

    // Log to today's daily log
    const today = todayKey()
    const logs = get().dailyLogs
    const existingIdx = logs.findIndex(l => l.date === today)
    let dailyLogs: DailyLog[]
    if (existingIdx >= 0) {
      dailyLogs = logs.map((l, i) =>
        i === existingIdx ? { ...l, segmentIds: [...l.segmentIds, segmentId] } : l
      )
    } else {
      dailyLogs = [...logs, { date: today, segmentIds: [segmentId] }]
    }

    db.saveSegments(segments)
    db.saveCourses(courses)
    db.saveDailyLogs(dailyLogs)
    set({ segments, courses, dailyLogs })
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    db.saveSettings(settings)
    set({ settings })
  },
}))
