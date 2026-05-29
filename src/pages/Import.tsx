import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseCourseZip, type ParseProgress } from '../lib/courseParser'
import { generateLessonContent } from '../lib/aiService'
import { useAppStore } from '../store/appStore'
import type { Segment } from '../types'

function randomId() {
  return crypto.randomUUID()
}

export default function Import() {
  const navigate = useNavigate()
  const { settings, addCourse, addSegment } = useAppStore()
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<ParseProgress | null>(null)
  const [genStatus, setGenStatus] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a ZIP file from MIT OpenCourseWare.')
      return
    }
    setError(null)

    try {
      const course = await parseCourseZip(file, settings, setProgress)

      if (course.lectures.length === 0) {
        setError("No lectures found in this ZIP. Make sure it's a valid MIT OCW download.")
        setProgress(null)
        return
      }

      addCourse(course)

      setGenStatus({ current: 0, total: course.lectures.length })
      for (let i = 0; i < course.lectures.length; i++) {
        const lec = course.lectures[i]
        setGenStatus({ current: i + 1, total: course.lectures.length })
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
        } catch {
          // skip failed lecture
        }
      }

      setGenStatus(null)
      navigate(`/course/${course.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse ZIP file.')
      setProgress(null)
      setGenStatus(null)
    }
  }

  const isProcessing = (progress !== null && progress.stage !== 'done') || genStatus !== null

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Import Course</h1>
      <p style={{ margin: '0 0 28px', fontSize: 13, color: '#6b7280' }}>
        Download a course ZIP from <span style={{ color: '#818cf8' }}>ocw.mit.edu</span>, then upload it here.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => !isProcessing && inputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#818cf8' : '#2a2a35'}`,
          borderRadius: 16, padding: '48px 24px', textAlign: 'center',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          background: isDragging ? '#818cf810' : '#18181f',
          transition: 'all 0.2s', opacity: isProcessing ? 0.6 : 1,
        }}
      >
        <input ref={inputRef} type="file" accept=".zip" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <div style={{ fontSize: 44, marginBottom: 12 }}>📦</div>
        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500, color: '#e8e8ee' }}>Drop MIT OCW ZIP here</p>
        <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>or click to browse</p>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 16, background: '#7f1d1d20', border: '1px solid #7f1d1d50', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Parse progress */}
      {progress && progress.stage !== 'done' && (
        <div style={{ marginTop: 20, background: '#18181f', border: '1px solid #2a2a35', borderRadius: 12, padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 500, color: '#e8e8ee' }}>{progress.message}</p>
          <div style={{ height: 4, background: '#2a2a35', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%', background: '#818cf8', borderRadius: 2, transition: 'width 0.3s',
                width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '5%',
              }}
            />
          </div>
        </div>
      )}

      {/* AI generation progress */}
      {genStatus && (
        <div style={{ marginTop: 12, background: '#18181f', border: '1px solid #2a2a35', borderRadius: 12, padding: 20 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500, color: '#e8e8ee' }}>Generating lessons…</p>
          <p style={{ margin: '0 0 12px', fontSize: 11, color: '#4b5563' }}>
            {genStatus.current}/{genStatus.total} lectures processed
            {settings.aiProvider === 'none' && ' · configure AI in Settings for real content'}
          </p>
          <div style={{ height: 4, background: '#2a2a35', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#7c3aed', borderRadius: 2, transition: 'width 0.3s', width: `${(genStatus.current / genStatus.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ marginTop: 28, background: '#18181f', border: '1px solid #2a2a35', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          How to download from MIT OCW
        </h3>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#6b7280', lineHeight: 2 }}>
          <li>Go to <span style={{ color: '#818cf8' }}>ocw.mit.edu</span> and find a course</li>
          <li>Look for "Download course materials" on the course page</li>
          <li>Click the ZIP download link</li>
          <li>Upload the downloaded ZIP here</li>
        </ol>
      </div>
    </div>
  )
}
