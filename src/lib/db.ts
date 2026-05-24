import type { Course, Segment, DailyLog, AppSettings } from '../types'

const KEYS = {
  courses: 'ocf:courses',
  segments: 'ocf:segments',
  dailyLogs: 'ocf:dailyLogs',
  settings: 'ocf:settings',
} as const

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export const db = {
  getCourses: (): Course[] => load(KEYS.courses, []),
  saveCourses: (courses: Course[]) => save(KEYS.courses, courses),

  getSegments: (): Record<string, Segment> => load(KEYS.segments, {}),
  saveSegments: (segments: Record<string, Segment>) => save(KEYS.segments, segments),

  getDailyLogs: (): DailyLog[] => load(KEYS.dailyLogs, []),
  saveDailyLogs: (logs: DailyLog[]) => save(KEYS.dailyLogs, logs),

  getSettings: (): AppSettings => load(KEYS.settings, {
    dailyGoal: 2,
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    claudeApiKey: '',
    lazurosUrl: '',
    lazurosToken: '',
    aiProvider: 'none',
    theme: 'dark',
  }),
  saveSettings: (settings: AppSettings) => save(KEYS.settings, settings),

  clear: () => Object.values(KEYS).forEach(k => localStorage.removeItem(k)),
}
