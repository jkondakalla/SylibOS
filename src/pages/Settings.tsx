import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/api'
import { db } from '../lib/db'
import { useTheme } from '../lib/theme'
import { Card, Button, Icon, Field, Input, Segmented, cx } from '../components/ui'
import type { AIProvider } from '../types'

const PROVIDERS: Array<{ value: AIProvider; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'lazuros', label: 'LazurOS' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'claude', label: 'Claude' },
]

function SettingCard({ icon, title, desc, children }: {
  icon: Parameters<typeof Icon>[0]['name']; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <Card className="p-6 animate-fade-up">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <Icon name={icon} size={19} />
        </span>
        <div>
          <h2 className="font-display text-[17px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{desc}</p>
        </div>
      </div>
      {children}
    </Card>
  )
}

export default function Settings() {
  const { settings, updateSettings } = useAppStore()
  const { theme, setTheme } = useTheme()
  const role = useAuthStore(s => s.user?.role)
  const [saved, setSaved] = useState(false)
  const [running, setRunning] = useState(false)
  const [jobResult, setJobResult] = useState<string | null>(null)

  function set<K extends keyof typeof settings>(key: K, value: typeof settings[K]) {
    updateSettings({ [key]: value } as Partial<typeof settings>)
    setSaved(true)
    setTimeout(() => setSaved(false), 1400)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10">
      <header className="mb-7 flex items-center justify-between animate-fade-up">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.02em] text-ink">Settings</h1>
        <span className={cx(
          'inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok transition-opacity',
          saved ? 'opacity-100' : 'opacity-0',
        )}>
          <Icon name="check" size={15} strokeWidth={2.5} /> Saved
        </span>
      </header>

      <div className="space-y-4">
        <SettingCard icon="sun" title="Appearance" desc="Light is calmer for daytime reading; dark for low light.">
          <Segmented<'light' | 'dark'>
            value={theme}
            onChange={setTheme}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          />
        </SettingCard>

        <SettingCard icon="target" title="Daily goal" desc="How many lessons you aim to finish each day.">
          <div className="flex items-center gap-4">
            <input type="range" min={1} max={10} value={settings.dailyGoal}
              onChange={e => set('dailyGoal', Number(e.target.value))}
              className="flex-1" />
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft font-display text-xl font-semibold text-accent-ink tabular-nums">
              {settings.dailyGoal}
            </span>
          </div>
        </SettingCard>

        <SettingCard icon="sparkles" title="AI provider"
          desc="Generates quizzes and practice tasks from each lecture.">
          <Segmented<AIProvider> value={settings.aiProvider} onChange={v => set('aiProvider', v)} options={PROVIDERS} full />

          <div className="mt-5">
            {settings.aiProvider === 'lazuros' && (
              <div className="space-y-4">
                <Field label="LazurOS URL" hint="The gateway base URL, e.g. your hub's /api/lazuros path.">
                  <Input value={settings.lazurosUrl} placeholder="https://your-hub.domain/api/lazuros"
                    onChange={e => set('lazurosUrl', e.target.value)} />
                </Field>
                <Field label="API token" hint="Shared LazurOS bearer token.">
                  <Input type="password" value={settings.lazurosToken} placeholder="Bearer token"
                    onChange={e => set('lazurosToken', e.target.value)} />
                </Field>
                <Field label="Model">
                  <Input value={settings.ollamaModel} placeholder="llama3.2"
                    onChange={e => set('ollamaModel', e.target.value)} />
                </Field>
              </div>
            )}

            {settings.aiProvider === 'ollama' && (
              <div className="space-y-4">
                <Field label="Ollama URL">
                  <Input value={settings.ollamaUrl} placeholder="http://localhost:11434"
                    onChange={e => set('ollamaUrl', e.target.value)} />
                </Field>
                <Field label="Model">
                  <Input value={settings.ollamaModel} placeholder="llama3"
                    onChange={e => set('ollamaModel', e.target.value)} />
                </Field>
              </div>
            )}

            {settings.aiProvider === 'claude' && (
              <Field label="Claude API key" hint="Stored in your browser only. Avoid on shared machines.">
                <Input type="password" value={settings.claudeApiKey} placeholder="sk-ant-..."
                  onChange={e => set('claudeApiKey', e.target.value)} />
              </Field>
            )}

            {settings.aiProvider === 'none' && (
              <div className="rounded-xl border border-line bg-card-2 px-4 py-3">
                <p className="text-[13px] text-muted">
                  Placeholder quizzes are used. Connect a provider for questions written from the actual lecture content.
                </p>
              </div>
            )}
          </div>

          {settings.aiProvider !== 'none' && role === 'admin' && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button variant="soft" size="sm" disabled={running}
                icon={running ? <Icon name="clock" size={14} /> : <Icon name="lightning" size={14} />}
                onClick={async () => {
                  setRunning(true); setJobResult(null)
                  try { await api.triggerNightlyJob(); setJobResult('Job started — lessons will fill in shortly.') }
                  catch { setJobResult('Could not start the job.') }
                  finally { setRunning(false) }
                }}>
                {running ? 'Running…' : 'Run AI job now'}
              </Button>
              {jobResult && <span className="text-[12px] text-muted">{jobResult}</span>}
            </div>
          )}
        </SettingCard>

        <Card className="border-danger/25 p-6 animate-fade-up">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
              <Icon name="trash" size={18} />
            </span>
            <div>
              <h2 className="font-display text-[17px] font-semibold text-ink">Local cache</h2>
              <p className="mt-0.5 text-[13px] text-muted">Clears this device's copy. Your server data stays intact.</p>
            </div>
          </div>
          <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />}
            onClick={() => { if (confirm('Clear local cache? Server data is unaffected.')) { db.clear(); window.location.reload() } }}>
            Clear local cache
          </Button>
        </Card>
      </div>
    </div>
  )
}
