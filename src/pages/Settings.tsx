import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { db } from '../lib/db'
import type { AIProvider } from '../types'

const card: React.CSSProperties = {
  background: '#18181f', border: '1px solid #2a2a35', borderRadius: 14, padding: 20, marginBottom: 12,
}

export default function Settings() {
  const { settings, updateSettings } = useAppStore()
  const [saved, setSaved] = useState(false)

  function set<K extends keyof typeof settings>(key: K, value: typeof settings[K]) {
    updateSettings({ [key]: value } as Partial<typeof settings>)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Settings</h1>
        {saved && <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>Saved</span>}
      </div>

      {/* Daily goal */}
      <div style={card}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#e8e8ee' }}>Daily goal</h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>How many lessons to complete each day</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <input
            type="range" min={1} max={10}
            value={settings.dailyGoal}
            onChange={e => set('dailyGoal', Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', minWidth: 20, textAlign: 'right' }}>{settings.dailyGoal}</span>
        </div>
      </div>

      {/* AI Provider */}
      <div style={card}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#e8e8ee' }}>AI provider</h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>Used to generate quizzes and tasks from lecture content</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['none', 'lazuros', 'ollama', 'claude'] as AIProvider[]).map(p => (
            <button
              key={p}
              onClick={() => set('aiProvider', p)}
              style={{
                flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                background: settings.aiProvider === p ? '#818cf820' : 'transparent',
                borderColor: settings.aiProvider === p ? '#818cf8' : '#2a2a35',
                color: settings.aiProvider === p ? '#c7d2fe' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >
              {p === 'none' ? 'None' : p === 'lazuros' ? 'LazurOS' : p === 'ollama' ? 'Ollama' : 'Claude API'}
            </button>
          ))}
        </div>

        {settings.aiProvider === 'lazuros' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 6 }}>LazurOS URL</label>
              <input
                type="text" value={settings.lazurosUrl}
                onChange={e => set('lazurosUrl', e.target.value)}
                placeholder="https://your-hub.domain/api/lazuros"
                style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a35', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8e8ee', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 6 }}>API token</label>
              <input
                type="password" value={settings.lazurosToken}
                onChange={e => set('lazurosToken', e.target.value)}
                placeholder="Generate in ORDECK Settings → API Tokens"
                style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a35', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8e8ee', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 6 }}>Model</label>
              <input
                type="text" value={settings.ollamaModel}
                onChange={e => set('ollamaModel', e.target.value)}
                placeholder="llama3.2"
                style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a35', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8e8ee', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}

        {settings.aiProvider === 'ollama' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 6 }}>Ollama URL</label>
              <input
                type="text" value={settings.ollamaUrl}
                onChange={e => set('ollamaUrl', e.target.value)}
                placeholder="http://localhost:11434"
                style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a35', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8e8ee', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 6 }}>Model</label>
              <input
                type="text" value={settings.ollamaModel}
                onChange={e => set('ollamaModel', e.target.value)}
                placeholder="llama3"
                style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a35', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8e8ee', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}

        {settings.aiProvider === 'claude' && (
          <div>
            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 6 }}>Claude API key</label>
            <input
              type="password" value={settings.claudeApiKey}
              onChange={e => set('claudeApiKey', e.target.value)}
              placeholder="sk-ant-..."
              style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a35', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8e8ee', outline: 'none', boxSizing: 'border-box' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#4b5563' }}>Stored in localStorage — do not use in a shared environment.</p>
          </div>
        )}

        {settings.aiProvider === 'none' && (
          <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>Placeholder quizzes will be generated. Connect an AI provider for real content.</p>
        )}
      </div>

      {/* Danger zone */}
      <div style={{ ...card, borderColor: '#7f1d1d40' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#e8e8ee' }}>Data</h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>Clear all courses and progress from this device</p>
        <button
          onClick={() => {
            if (confirm('Delete all courses and progress? This cannot be undone.')) {
              db.clear()
              window.location.reload()
            }
          }}
          style={{ background: '#7f1d1d30', border: '1px solid #7f1d1d60', color: '#f87171', fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
        >
          Clear all data
        </button>
      </div>
    </div>
  )
}
