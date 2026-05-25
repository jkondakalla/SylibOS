import { create } from 'zustand'
import { db } from '../lib/db'
import { api } from '../lib/api'
import { todayKey } from '../lib/scheduler'
import type { Course, Segment, DailyLog, AppSettings } from '../types'

const DEFAULT_SETTINGS: AppSettings = {
  dailyGoal: 2,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  claudeApiKey: '',
  lazurosUrl: '',
  lazurosToken: '',
  aiProvider: 'none',
  theme: 'dark',
  backendUrl: '',
  backendToken: '',
}

interface AppState {
  courses: Course[]
  segments: Record<string, Segment>
  dailyLogs: DailyLog[]
  settings: AppSettings

  addCourse: (course: Course) => void
  removeCourse: (courseId: string) => void
  addSegment: (segment: Segment) => void
  completeSegment: (segmentId: string, quizScore: number) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  hydrate: () => Promise<void>
}

function configureApi(settings: AppSettings) {
  if (settings.backendUrl) {
    api.configure(settings.backendUrl, settings.backendToken)
  }
}

function sortNewestFirst(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => b.importedAt - a.importedAt)
}

export const useAppStore = create<AppState>((set, get) => ({
  courses: [],
  segments: {},
  dailyLogs: [],
  settings: db.getSettings(),

  hydrate: async () => {
    const localSettings = db.getSettings()
    configureApi(localSettings)

    if (api.configured) {
      try {
        const [courses, segments, logs, remoteSettings] = await Promise.all([
          api.getCourses(),
          api.getSegments(),
          api.getDailyLogs(),
          api.getSettings(),
        ])
        const settings = { ...DEFAULT_SETTINGS, ...localSettings, ...remoteSettings }
        db.saveSettings(settings)
        set({ courses: sortNewestFirst(courses), segments, dailyLogs: logs, settings })
        return
      } catch (e) {
        console.warn('[store] Backend unreachable, falling back to localStorage:', e)
      }
    }

    set({
      courses: sortNewestFirst(db.getCourses()),
      segments: db.getSegments(),
      dailyLogs: db.getDailyLogs(),
      settings: localSettings,
    })
  },

  addCourse: (course) => {
    const courses = sortNewestFirst([...get().courses, course])
    db.saveCourses(courses)
    set({ courses })
    if (api.configured) {
      api.createCourse(course).catch(e => console.warn('[store] createCourse failed:', e))
    }
  },

  removeCourse: (courseId) => {
    const courses = get().courses.filter(c => c.id !== courseId)
    const segments = { ...get().segments }
    Object.keys(segments).forEach(id => {
      if (segments[id].courseId === courseId) delete segments[id]
    })
    db.saveCourses(courses)
    db.saveSegments(segments)
    set({ courses, segments })
    if (api.configured) {
      api.deleteCourse(courseId).catch(e => console.warn('[store] deleteCourse failed:', e))
    }
  },

  addSegment: (segment) => {
    const segments = { ...get().segments, [segment.id]: segment }

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
    if (api.configured) {
      api.createSegment(segment).catch(e => console.warn('[store] createSegment failed:', e))
    }
  },

  completeSegment: (segmentId, quizScore) => {
    const now = Date.now()
    const segments = {
      ...get().segments,
      [segmentId]: { ...get().segments[segmentId], completedAt: now, quizScore },
    }

    const seg = segments[segmentId]
    const courses = get().courses.map(course => {
      if (course.id !== seg.courseId) return course
      return { ...course, completedSegments: course.completedSegments + 1 }
    })

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

    if (api.configured) {
      const todayLog = dailyLogs.find(l => l.date === today)!
      api.patchSegment(segmentId, { completedAt: now, quizScore, courseId: seg.courseId })
        .catch(e => console.warn('[store] patchSegment failed:', e))
      api.upsertDailyLog(todayLog)
        .catch(e => console.warn('[store] upsertDailyLog failed:', e))
    }
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    db.saveSettings(settings)
    configureApi(settings)
    set({ settings })
    if (api.configured) {
      api.saveSettings(settings).catch(e => console.warn('[store] saveSettings failed:', e))
    }
  },
}))
