import type { Course, Segment, DailyLog, AppSettings } from '../types'

let _baseUrl = ''
let _token = ''

export const api = {
  configure(baseUrl: string, token = '') {
    _baseUrl = baseUrl.replace(/\/$/, '')
    _token = token
  },

  get configured() {
    return _baseUrl.length > 0
  },

  async _fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    }
    return fetch(`${_baseUrl}${path}`, { ...init, headers })
  },

  async getCourses(): Promise<Course[]> {
    const r = await this._fetch('/api/courses')
    if (!r.ok) throw new Error(`GET /api/courses → ${r.status}`)
    return r.json()
  },

  async createCourse(course: Course): Promise<void> {
    const r = await this._fetch('/api/courses', { method: 'POST', body: JSON.stringify(course) })
    if (!r.ok) throw new Error(`POST /api/courses → ${r.status}`)
  },

  async deleteCourse(id: string): Promise<void> {
    const r = await this._fetch(`/api/courses/${id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error(`DELETE /api/courses/${id} → ${r.status}`)
  },

  async getSegments(): Promise<Record<string, Segment>> {
    const r = await this._fetch('/api/segments')
    if (!r.ok) throw new Error(`GET /api/segments → ${r.status}`)
    return r.json()
  },

  async createSegment(segment: Segment): Promise<void> {
    const r = await this._fetch('/api/segments', { method: 'POST', body: JSON.stringify(segment) })
    if (!r.ok) throw new Error(`POST /api/segments → ${r.status}`)
  },

  async patchSegment(id: string, patch: Partial<Segment> & { courseId?: string }): Promise<void> {
    const r = await this._fetch(`/api/segments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (!r.ok) throw new Error(`PATCH /api/segments/${id} → ${r.status}`)
  },

  async getDailyLogs(): Promise<DailyLog[]> {
    const r = await this._fetch('/api/daily-logs')
    if (!r.ok) throw new Error(`GET /api/daily-logs → ${r.status}`)
    return r.json()
  },

  async upsertDailyLog(log: DailyLog): Promise<void> {
    const r = await this._fetch('/api/daily-logs', { method: 'POST', body: JSON.stringify(log) })
    if (!r.ok) throw new Error(`POST /api/daily-logs → ${r.status}`)
  },

  async getSettings(): Promise<Partial<AppSettings>> {
    const r = await this._fetch('/api/settings')
    if (!r.ok) throw new Error(`GET /api/settings → ${r.status}`)
    return r.json()
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    const r = await this._fetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
    if (!r.ok) throw new Error(`PUT /api/settings → ${r.status}`)
  },

  async triggerNightlyJob(): Promise<void> {
    const r = await this._fetch('/api/admin/run-nightly', { method: 'POST' })
    if (!r.ok) throw new Error(`POST /api/admin/run-nightly → ${r.status}`)
  },
}
