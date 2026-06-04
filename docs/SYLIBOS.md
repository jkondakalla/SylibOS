# SylibOS — Service Documentation

**On-disk location:** `SylibOS/`  
**TrueNAS path (prod):** `/mnt/Luna/Webhost/jkOS/SylibOS/`  
**TrueNAS path (staging):** `/mnt/Luna/Webhost/jkOS-staging/SylibOS/`  
**URL (prod):** `https://sylibos.jkos.net`  
**URL (staging):** `https://staging.jkos.net/sylib`  
**Containers (prod):** `sylibos-frontend` (nginx SPA) + `sylibos-api` (Express backend) on `jkos-internal`  
**Containers (staging):** `staging-sylibos-frontend` + `staging-sylibos-api` on `nginx-staging-proxy`  
**Ports:** Frontend :80, Backend :8004 (internal), exposed via nginx  
**Tech:** React 19 · TypeScript · Vite · Zustand · Tailwind 4 · React Router + Node.js ESM · better-sqlite3 · node-cron  
**Last updated:** 2026-06-04 (unified theme + effects system)

> **On-disk directory:** `SylibOS/` — all Docker container names, networks, volume paths, and UI branding use `sylibos`.

---

## 1. Purpose

SylibOS is a self-hosted MIT OpenCourseWare (OCW) study scheduler. It:
- Hosts a **Course Library** — a curated catalog of OCW courses ingested via the Python pipeline, browsable by all authenticated users
- Lets users **add courses** from the library to their personal learning plan with one click
- Generates AI-powered study materials (quiz questions, 2-minute tasks) for each lecture via a nightly cron job
- Tracks daily study progress, streaks, and completion per user per course
- Presents a lesson player with PDF viewer, AI quiz, and daily task list

All user data is **per-user** — scoped by `req.user.sub` from the jkOS Auth JWT. The library catalog is shared and read-only at runtime.

---

## 2. Architecture Overview

SylibOS is a **standalone app** — it is NOT a Module Federation federated component. Reason: SylibOS uses React 19, while ORDECK uses React 18 as a singleton. They cannot share a React instance via Module Federation. In the ORDECK unified portal, SylibOS is embedded as an `<iframe>` tile.

### Two-Container Deployment

| Container | Image | Serves |
|-----------|-------|--------|
| `sylibos-frontend` | `nginx:alpine` from `SylibOS/Dockerfile` | Vite SPA at `:80` |
| `sylibos-api` | `node:20-alpine` from `SylibOS/backend/Dockerfile` | Express API at `:8004` |

The frontend SPA calls the backend via relative paths (`/api/*`, `/health`) — nginx (the standalone reverse proxy) routes `sylibos.jkos.net/api/*` to `sylibos-api:8004` and `sylibos.jkos.net/` to `sylibos-frontend:80`.

### Two Databases

| File | Purpose | Access |
|------|---------|--------|
| `/data/sylibos.db` | Per-user data: courses, lectures, segments, daily logs, settings | Read + write by the API |
| `/data/library.db` | Shared library catalog: courses, units, lectures, asset BLOBs | Read-only by the API; written only by the Python pipeline |

Both files live on the `/mnt/Luna/Backends/SylibOS-Data:/data` Docker volume.

---

## 3. Frontend Architecture

### Entry Point: `src/main.tsx`

React Router app with a single `Layout` wrapper route:

```
Layout (auth gate + nav bar)
  ├── /            → Home (today's lesson, streak, progress)
  ├── /library     → Library (browse and add courses from the shared catalog)
  ├── /course/:id  → CoursePage (lecture list for an added course)
  ├── /lesson/:id  → Lesson (lesson player: PDF, video, quiz, tasks)
  └── /settings    → Settings (AI provider, daily goal)
```

### State Management: Zustand

**`src/store/appStore.ts`** — Primary app state: courses, segments, dailyLogs, settings.
- Hydrates by calling the backend API on mount (always, no configure step needed)
- All mutations write to localStorage as a cache AND call the backend
- Falls back to localStorage cache if backend is unreachable
- `hydrate()` is called explicitly after adding a library course so CoursePage immediately finds the new course in the store

**`src/store/authStore.ts`** — Auth state: user, status (`loading|ready|unauthenticated`), `init()`.

### Auth Flow (`src/store/authStore.ts` + `src/api/auth.ts`)

```
Layout mounts
→ useAuthStore.init() called (wrapped in try/catch — network errors redirect to login, not hang)
→ getMe() → GET /api/auth/me { credentials: 'include' }  ← own backend (not jkos-auth directly)
  → 200: set user, status='ready'
  → non-200: refreshToken() → POST https://auth.jkos.net/auth/refresh
    → refreshed: getMe() again
      → 200: status='ready'
      → non-200: redirectToLogin(), status='unauthenticated'
    → network error: redirectToLogin(), status='unauthenticated'
→ Layout shows loading spinner until status='ready'
→ Hydrates appStore (calls backend API) only when status='ready'
```

**`src/api/auth.ts` exports:**
- `getMe()` → calls `GET /api/auth/me` (own backend, same origin) → `JkosUser | null`
- `refreshToken()` → `POST https://auth.jkos.net/auth/refresh` → `boolean`
- `redirectToLogin()` → redirects to `${VITE_JKOS_AUTH_URL}/auth/login?redirect_to=${window.location.href}`
- `logout()` → calls `POST /auth/logout`, redirects to `${AUTH_URL}/auth/login`

**`JkosUser` type:**
```typescript
interface JkosUser {
  id: string        // jkOS Auth user database integer PK, as string
  email: string
  name: string
  avatar_url: string | null
  role: string
}
```

### API Layer (`src/lib/api.ts`)

All API calls go through `apiFetch` — a fetch wrapper that:
- Uses `credentials: 'include'` to send the `jkos_token` cookie
- Calls relative URLs (`/api/...`) — same origin as the frontend
- Handles `TOKEN_EXPIRED` (401) by calling `POST auth.jkos.net/auth/refresh` and retrying once
- Deduplicates concurrent refresh attempts with a singleton Promise (prevents refresh storms)
- On unresolvable 401, calls `redirectToLogin()`

The **`call<T>`** function wraps `apiFetch`, parses JSON, and throws on non-2xx. It is exported so the library API module can use it directly. The `api` object (also exported) contains all the existing course/segment/settings methods.

**`src/lib/libraryApi.ts`** — Typed wrappers for the three library endpoints, using `call`:
- `listLibrary()` → `GET /api/library` → `LibraryCourse[]`
- `getLibraryCourse(slug)` → `GET /api/library/:slug` → `LibraryCoursePreview`
- `addLibraryCourse(slug)` → `POST /api/library/:slug/add` → `{ courseId, alreadyAdded }`

### Library Page (`src/pages/Library.tsx`)

Browse the shared course catalog, filter by subject, preview a course's unit/lecture breakdown, and add a course to the personal plan. The Add action:
1. Calls `POST /api/library/:slug/add` (server-side fan-out copies course + lectures into sylibos.db)
2. Calls `hydrate()` to refresh the Zustand store
3. Navigates to `/course/:courseId`

The page is idempotent — adding a course that was already added returns the existing course ID without creating duplicates.

The **PreviewModal** shows the actual API error message if the course preview fails to load, rather than a generic fallback.

### Loading State (in `Layout.tsx`)

While `status === 'loading'` or `status === 'unauthenticated'` (redirect in progress), Layout renders a centered spinner with theme-aware background. Routes are never rendered until `status === 'ready'`.

### Design System (`src/lib/theme.ts` · `src/index.css` · `src/components/ui.tsx`)

SylibOS uses a **reading-room aesthetic** — warm parchment tones in light mode, cool slate in dark. The system is driven by CSS custom properties on `<html data-theme>`:

```
Light: --color-paper #fbfaf7, --color-accent var(--accent-base, #0e7c66)
Dark:  --color-paper #121318, --color-accent color-mix(in oklab, var(--accent-base) 60%, #fff)
```

**`src/lib/theme.ts`** — two layers of theming:

1. **Local schemes** — `applyScheme(id)` sets `data-theme` and `--accent-base` from a preset (`reading-room`, `sandstone`, `nocturne`, `velvet`). `useTheme()` reads `settings.scheme` from Zustand, exposes `setScheme` / `setTheme` / `toggle`. `index.html` applies the saved scheme before first paint to avoid flash.

2. **jkOS suite theme** — `applyJkOSTheme(theme)` overrides accent from jkAuth cross-app preferences. Called in `authStore.ts` after profile load. Theme object (simplified): `{ mode: 'light'|'dark'|'system', primary: string, secondary: string }`. Sets `--accent-base` and `--accent-secondary` on `:root`; `data-theme` is set from the effective mode.

### CRT Overlay Effects

`Layout.tsx` calls `useJkOSPreferences()` to get current effects settings and passes them to `SettingsPanel`. Overlay components (`FilmGrain`, `Halation`, `ScanLines`, `Artifacts` in `src/components/Overlays.tsx`) are rendered conditionally based on `effects`:

- `Halation` defines an SVG filter `id="sylib-halation"`. The root `div.min-h-screen` has `filter: url(#sylib-halation)` applied when halation is active in dark mode.
- **`SettingsPanel` is prop-driven** — receives all prefs from Layout; does not call `useJkOSPreferences()` internally. One profile fetch per page load.

**`src/api/auth.ts`** exports the shared `JkOSTheme`, `EffectsPreferences`, `LazurPreferences` types along with `normaliseTheme()` for migrating old 4-color format preferences.

**`src/components/ui.tsx`** — shared component library. Key components and their props:

| Component | Key Props | Notes |
|-----------|-----------|-------|
| `Button` | `variant` (primary/soft/outline/ghost/danger), `size` (sm/md/lg), `icon` (ReactNode), `full` | `icon` renders before children |
| `Card` | `hover`, `glow` (CSS color string), HTML div attrs | `hover` enables lift shadow on hover |
| `Badge` | `color` (CSS color), `className` | No `variant` prop — use `color` or default (accent-soft) |
| `Icon` | `name` (IconName), `size`, `strokeWidth`, `className` | Inline SVG; see type union for available names |
| `EmptyState` | `icon` (IconName), `title`, `body`, `action` | Uses `body` not `description` |
| `Spinner` | `size` | Spinning ring using border trick |
| `Bar`, `Ring` | `value` (0–1), `color`, ... | Progress primitives |
| `Segmented` | `options`, `value`, `onChange`, `full` | Pill-style tab switcher |
| `Field`, `Input` | Standard form helpers | `Field` wraps `label + hint` |
| `ThemeToggle` | `className` | Sun/moon toggle, reads from `useTheme()` |

Available `IconName` values: `chevron` `check` `flame` `book` `upload` `settings` `sun` `moon` `play` `pause` `arrow-right` `arrow-left` `x` `sparkles` `layers` `clock` `trash` `target` `logout` `plus` `cap` `dot` `lightning`

**Fonts:** Fraunces (display/headers) + Hanken Grotesk (body), loaded from Google Fonts CDN in `index.html`.

**Library page styles** live at the bottom of `src/index.css` under the `/* Library page */` block. CSS class prefix is `library-`.

### Lecture Slicing (`src/lib/sliceLecture.ts`)

`sliceLecture(lectureId, title, content)` deterministically splits a lecture's text into ~150-word reading chunks (Slice[]). IDs are stable (`${lectureId}#${n}`), so `db.getSliceProgress` / `db.setSliceProgress` (localStorage-only) can resume a reader mid-lecture across sessions without any backend call.

**This is a view-layer transform only** — it does not affect the DB schema, backend API, or AI pipeline.

### Build-Time Env Vars

```
VITE_JKOS_AUTH_URL → https://auth.jkos.net  (baked into JS bundle at build time via Dockerfile ARG)
```

---

## 4. Backend Architecture

### `backend/index.js` — Express API (ESM)

ES module (`"type": "module"` in package.json). All imports use `import`.

**Middleware stack (in order):**
```javascript
app.set('trust proxy', 1)                               // correct IP from nginx X-Forwarded-For
app.use(cors({ origin: SHELL_URL, credentials: true })) // SHELL_URL = https://sylibos.jkos.net
app.use(express.json({ limit: '20mb' }))
app.use(cookieParser())

// Open library.db (read-only) and run sylibos.db migrations at boot:
const lib = openLibraryDb(process.env.LIBRARY_DB_PATH || '/data/library.db')
runLibraryMigrations(db)

// PUBLIC routes — before auth middleware:
app.get('/health', ...)                        // health check
attachLibraryAssetRoute(app, lib)              // GET /api/library/asset/:id — PDF BLOBs

// Auth (all routes below require jkos_token cookie):
const authMiddleware = JKOS_AUTH_PUBLIC_KEY
  ? jkosAuth({ publicKey: JKOS_AUTH_PUBLIC_KEY })
  : (req, _res, next) => { req.user = { sub: 1, role: 'admin' }; next() } // dev fallback
app.use(authMiddleware)

// AUTHENTICATED routes:
attachLibraryRoutes(app, { lib, db })          // GET/POST /api/library/*
app.get('/api/auth/me', ...)                   // returns req.user minus iss/iat/exp/sub; id = String(sub)
// ... all other course/segment/settings routes
```

### `backend/library.js` — Library Runtime

Opens `library.db` read-only and handles:
- `GET /api/library` — returns the full catalog annotated with `added: true/false` per user (checks `source_slug` on `courses`)
- `GET /api/library/:slug` — returns unit/lecture titles for the preview modal (no content)
- `POST /api/library/:slug/add` — fan-out: copies course + lectures from `library.db` into `sylibos.db` in one transaction; idempotent (returns existing `courseId` if already added)
- `GET /api/library/asset/:assetId` (public) — streams a PDF BLOB from `library.db`; `Cache-Control: public, max-age=86400, immutable`

The **fan-out** in `addCourseForUser`:
1. Inserts one row into `courses` (with `source_slug = slug` to track library origin)
2. Inserts one row per lecture into `lectures`, pulling content/videos/resources from `library.db`
3. Sets `has_segment = 0` on every copied lecture so the nightly job generates quizzes automatically
4. Asset bytes stay in `library.db`; lecture rows store `assets` as a JSON array with `/api/library/asset/:id` URLs

### `backend/migrations.js` — Boot-Time Migrations

Runs at every API boot before routes are served. Idempotent (`ALTER TABLE` is no-op if column exists):
```sql
ALTER TABLE courses ADD COLUMN source_slug TEXT
ALTER TABLE lectures ADD COLUMN videos    TEXT NOT NULL DEFAULT '[]'
ALTER TABLE lectures ADD COLUMN assets    TEXT NOT NULL DEFAULT '[]'
ALTER TABLE lectures ADD COLUMN resources TEXT NOT NULL DEFAULT '[]'
CREATE INDEX IF NOT EXISTS idx_courses_user_source ON courses(user_id, source_slug)
```

### `backend/jkos-auth.js` — ESM Auth Middleware

ES module version of the canonical `jkos-auth/middleware/index.js`. Identical logic but uses `export function jkosAuth(opts)` instead of `module.exports`. Cannot use the CommonJS version directly because `"type": "module"` treats all `.js` as ESM.

### `backend/db.js` — Database Layer

Exports all DB functions. All data is scoped by `userId` (`String(req.user.sub)`). Uses synchronous `better-sqlite3` calls (blocking; no `await`).

### `backend/ai.js` — AI Provider Abstraction

Exports `generateSegmentContent(settings, title, content, unit, courseTitle)`.  
Tries providers in order based on `settings.aiProvider`:
1. `lazuros` → `callLazuros(url, token, model, ...)` → `POST /api/generate`
2. `ollama` → `callOllama(url, model, ...)` → `POST /api/generate` direct
3. Falls through to `mockContent(title)` on any failure (guaranteed non-null return)

After parsing the AI JSON response, `validateAiResponse` verifies that `quiz` and `tasks` are both arrays. If the AI returns a structurally invalid response (missing fields, wrong types), it throws and the caller falls through to `mockContent` — malformed data is never stored.

**Mock content** is always generated if AI fails — the nightly job never crashes.

### Nightly Cron Job

Scheduled via `node-cron` at `NIGHTLY_CRON` (default: `0 2 * * *` = 2am daily).

```
runNightlyJob()
  → guard: if already running, log and return (prevents double-processing from manual trigger + cron overlap)
  → getLecturesWithoutSegments()  (returns lectures with userId from courses JOIN, where has_segment = 0 AND content != '')
  → for each lecture:
      → getSettings(lec.userId)   (per-user AI settings)
      → generateSegmentContent(settings, ...)  (validates AI response structure before returning)
      → insertSegment({ id: randomUUID(), userId: lec.userId, ... })
```

Library-added lectures land with `has_segment = 0` and real `content`, so they are picked up by the nightly job automatically. No nightly-job changes were needed to support the library.

**IMPORTANT:** The nightly job uses `settings.lazurosToken` from the per-user database. This is a service-to-service call — sends `Authorization: Bearer LAZUROS_TOKEN` to LazurOS, **not** the `jkos_token` cookie. The nightly job bypasses jkOS Auth entirely by design.

---

## 5. Database Schema

### `sylibos.db` — Per-User Data

**File:** `/mnt/Luna/Backends/SylibOS-Data/sylibos.db`  
**Engine:** SQLite with WAL mode, foreign keys ON  
All tables created on startup with `CREATE TABLE IF NOT EXISTS`.

All data tables include a `user_id TEXT NOT NULL DEFAULT ''` column — data is scoped per user.

#### `courses`
```sql
CREATE TABLE courses (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL DEFAULT '',
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  instructor         TEXT NOT NULL DEFAULT '',
  subject            TEXT NOT NULL DEFAULT '',
  level              TEXT NOT NULL DEFAULT '',
  imported_at        INTEGER NOT NULL,
  completed_segments INTEGER NOT NULL DEFAULT 0,
  -- added by migrations.js at boot:
  source_slug        TEXT    -- non-null for library-added courses; identifies the library.db slug
);
```
`source_slug` is the key that links a user's course back to the library entry. The idempotency check for library adds queries `WHERE user_id = ? AND source_slug = ?`.

#### `lectures`
```sql
CREATE TABLE lectures (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT '',   -- unit title (e.g. "Unit 1: Derivatives")
  section     TEXT,                        -- optional sub-grouping within a unit
  ord         INTEGER NOT NULL DEFAULT 0,
  content     TEXT NOT NULL DEFAULT '',
  video_url   TEXT,                        -- single video URL (original/direct-import schema)
                                           -- normLecture falls back to videos[0].url for library courses
  has_segment INTEGER NOT NULL DEFAULT 0,  -- 0 = nightly job will process
  segment_id  TEXT,
  -- added by migrations.js at boot:
  videos      TEXT NOT NULL DEFAULT '[]',  -- JSON array of {provider, id, title} from library
  assets      TEXT NOT NULL DEFAULT '[]',  -- JSON array of {id, kind, title, filename, mime, url}
  resources   TEXT NOT NULL DEFAULT '[]'   -- JSON array of {title, url} external links
);
```
Note: `lectures` does NOT have a `user_id` column. User ownership is enforced through the `courses` FK — cascade delete removes lectures when a course is deleted.

The `has_segment = 0` filter in `getLecturesWithoutSegments()` is what the nightly job uses. Library-added lectures start with `has_segment = 0` and real content, so they are processed automatically.

#### `segments`
AI-generated study material for one lecture, per user:
```sql
CREATE TABLE segments (
  id            TEXT NOT NULL,
  user_id       TEXT NOT NULL DEFAULT '',
  lecture_id    TEXT NOT NULL,
  course_id     TEXT NOT NULL,
  lecture_title TEXT NOT NULL,
  course_title  TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT '',
  section       TEXT,
  generated_at  INTEGER NOT NULL,
  quiz          TEXT NOT NULL DEFAULT '[]',
  tasks         TEXT NOT NULL DEFAULT '[]',
  completed_at  INTEGER,
  quiz_score    INTEGER,
  PRIMARY KEY (id, user_id)
);
```

#### `daily_logs`
```sql
CREATE TABLE daily_logs (
  user_id     TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL,           -- ISO 'YYYY-MM-DD'
  segment_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (user_id, date)
);
```

#### `settings`
```sql
CREATE TABLE settings (
  user_id TEXT PRIMARY KEY,
  data    TEXT NOT NULL DEFAULT '{}'
);
```

**Settings JSON shape:**
```json
{
  "dailyGoal": 2,
  "ollamaUrl": "http://localhost:11434",
  "ollamaModel": "llama3.2",
  "lazurosUrl": "http://host.docker.internal:8080",
  "lazurosToken": "",
  "aiProvider": "lazuros",
  "theme": "dark"
}
```
`theme` is `'light' | 'dark'`. Stored per-user in the backend DB and mirrored in `sylibos:settings` localStorage. Backend seeds from env vars as defaults (`LAZUROS_URL`, `LAZUROS_TOKEN`, `AI_PROVIDER`).

### `library.db` — Shared Library Catalog

**File:** `/mnt/Luna/Backends/SylibOS-Data/library.db`  
**Owned by:** Python ingest pipeline (`preprocessor/db.py`)  
**Access:** Read-only at runtime (`better-sqlite3` opened with `{ readonly: true }`)

```sql
CREATE TABLE courses (
  slug           TEXT PRIMARY KEY,   -- e.g. "18-01sc-fall-2010"
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  instructor     TEXT NOT NULL DEFAULT '',
  subject        TEXT NOT NULL DEFAULT '',
  level          TEXT NOT NULL DEFAULT '',
  course_number  TEXT NOT NULL DEFAULT '',
  term           TEXT NOT NULL DEFAULT '',
  ocw_url        TEXT,
  layout_format  TEXT,
  used_ai_split  INTEGER NOT NULL DEFAULT 0,
  schema_version INTEGER NOT NULL DEFAULT 1,
  tool_version   TEXT,
  lecture_count  INTEGER NOT NULL DEFAULT 0,
  has_video      INTEGER NOT NULL DEFAULT 0,
  ingested_at    TEXT NOT NULL
);

CREATE TABLE units (
  id    TEXT PRIMARY KEY,
  slug  TEXT NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
  title TEXT NOT NULL,
  ord   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE lectures (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
  unit_id    TEXT REFERENCES units(id) ON DELETE CASCADE,
  unit_title TEXT NOT NULL DEFAULT '',
  section    TEXT,
  title      TEXT NOT NULL,
  ord        INTEGER NOT NULL DEFAULT 0,
  content    TEXT NOT NULL DEFAULT '',
  videos     TEXT NOT NULL DEFAULT '[]',  -- JSON array of {provider, id, title}
  resources  TEXT NOT NULL DEFAULT '[]'   -- JSON array of {title, url}
);

CREATE TABLE assets (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
  lecture_id TEXT REFERENCES lectures(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'other',
  title      TEXT NOT NULL DEFAULT '',
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL DEFAULT 'application/pdf',
  sha256     TEXT,
  bytes      BLOB NOT NULL                -- PDF bytes served via /api/library/asset/:id
);
```

**WAL mode** means a `load` from the pipeline is visible to the running API on the next query — no restart required for new courses. If you replace the file wholesale, restart the API.

---

## 6. Backend API

All routes except `/health` and `/api/library/asset/:id` require a valid `jkos_token` cookie (jkosAuth middleware).

### Existing Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `{ status: 'ok', service: 'sylibos-api' }` [public] |
| `GET` | `/api/auth/me` | Returns `{ user: { id, email, name, avatar_url, role } }` — JWT claims `sub/iat/exp/iss` are stripped |
| `GET` | `/api/courses` | All courses for the authenticated user |
| `POST` | `/api/courses` | Insert course (`userId` stamped from `req.user.sub`, never from body) |
| `GET` | `/api/courses/:id` | Single course (ownership enforced) |
| `DELETE` | `/api/courses/:id` | Delete course + cascade (ownership enforced) |
| `GET` | `/api/segments` | All segments as `Record<id, segment>` for the authenticated user |
| `POST` | `/api/segments` | Insert segment |
| `PATCH` | `/api/segments/:id` | Partial update (transactional); if `completedAt` is truthy, increments course counter |
| `GET` | `/api/daily-logs` | All daily logs for the authenticated user |
| `POST` | `/api/daily-logs` | Upsert daily log; `date` must be in `YYYY-MM-DD` format |
| `GET` | `/api/settings` | Current settings for the authenticated user |
| `PUT` | `/api/settings` | Replace settings for the authenticated user |
| `GET` | `/api/summary` | Dashboard widget summary (streak, progress, next lesson) |
| `POST` | `/api/import-manifest` | Import a `CourseManifest` JSON from the Python pipeline `--push-to` flag |
| `POST` | `/api/admin/run-nightly` | **Admin only.** Manually trigger nightly job; responds immediately, runs async. Skips if already running. |

### Library Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/library/asset/:assetId` | **public** | Stream a PDF BLOB from `library.db` |
| `GET` | `/api/library` | required | Full catalog; each entry includes `added: bool` for the current user |
| `GET` | `/api/library/:slug` | required | Unit/lecture preview for the modal (no lecture content) |
| `POST` | `/api/library/:slug/add` | required | Copy course into user's sylibos.db rows; idempotent |

**`POST /api/library/:slug/add` response:**
```json
{ "courseId": "uuid", "alreadyAdded": false }
```
If the user already has the course, `alreadyAdded: true` with the same `courseId`.

### `GET /api/summary` Response Shape
Used by the ORDECK widget tile:
```json
{
  "todayDone": 1,
  "dailyGoal": 2,
  "streak": 7,
  "activeCourse": { "title": "18.06 Linear Algebra", "total": 34, "done": 12, "pct": 35 },
  "nextLesson": { "segmentId": "uuid", "title": "Lecture 13: Eigenvalues" },
  "courseCount": 3
}
```

---

## 7. Python Preprocessor

**Location:** `SylibOS/preprocessor/`

The preprocessor has **two separate workflows** with different purposes and CLIs:

### Workflow A — Direct Import (existing, via `cli.py`)

Parses an OCW ZIP into a `CourseManifest` pydantic model and either saves JSON or posts it to `POST /api/import-manifest`, which creates a course directly in the user's `sylibos.db`.

```bash
# Output JSON to stdout:
python -m preprocessor path/to/course.zip

# Push directly to a user's account on the backend:
python -m preprocessor path/to/course.zip --push-to https://sylibos.jkos.net --token $TOKEN

# Save JSON to file:
python -m preprocessor path/to/course.zip -o manifest.json
```

Supports 6 different OCW ZIP layout formats. Uses `typer` CLI, `pydantic` models, `pdfplumber` for PDF extraction. The resulting course belongs to the user identified by `--token`.

### Workflow B — Library Ingestion (new, via `library_cli.py`)

Parses an OCW ZIP into the `library.db` canonical catalog. All users can then browse and add these courses from the Library page. This is the **recommended way to add courses** going forward.

```bash
# Step 1: Dry run — inspect structure and confidence score:
python -m preprocessor.library_cli inspect COURSE.zip --course-number 18.01SC --term "Fall 2010"

# Step 2a: Clean STEM course (numbered lectures, videos, notes):
python -m preprocessor.library_cli build COURSE.zip --course-number 18.01SC --term "Fall 2010"
python -m preprocessor.library_cli load  ./build/18-01sc-fall-2010

# Step 2b: Irregular/flat humanities course (AI split fallback):
python -m preprocessor.library_cli build COURSE.zip --course-number 21H.336 --ai \
    --ai-url http://<desktop-ip>:11434
python -m preprocessor.library_cli load  ./build/<slug>
```

Default `library.db` path: `/mnt/Luna/Backends/SylibOS-Data/library.db` (or `$LIBRARY_DB_PATH`).

**Do not point `--ai` at LazurOS while it is returning hardcoded stub responses.** Point it at the real Ollama on the GPU desktop. Clean STEM courses do not call the model at all.

**Re-ingesting a course** (e.g. after fixing selector issues): `load` is an upsert keyed by slug — it deletes the old subtree and replaces it in one transaction. Users who already added the course keep their per-user rows (and their progress). They will not see updated content until they remove and re-add the course.

#### Library Ingestion Modules (new, in `preprocessor/`)

| Module | Purpose |
|--------|---------|
| `ir.py` | Dataclasses: `Course`, `Unit`, `Lecture`, `Asset` — the normalized IR |
| `util.py` | Helpers: `slugify`, YouTube ID extraction, asset classification |
| `extract.py` | HTML extractor: ZIP → `Page` objects (title, text, PDFs, videos) |
| `structure.py` | Heuristic grouper: `Page[]` → `Course` IR + confidence score |
| `assets.py` | Extracts PDF bytes from the ZIP into the build directory |
| `ai_split.py` | AI structural fallback (Ollama) — only when confidence < threshold |
| `validate.py` | JSON Schema + integrity checks — blocks bad data before `load` |
| `report.py` | Human-readable report for the review gate |
| `db.py` | `library.db` layer: schema SQL + `upsert_course()` |
| `library_cli.py` | CLI entrypoint for `inspect` / `build` / `load` |
| `schema/library.schema.json` | Draft-07 JSON Schema for the course IR |

---

## 8. Course Import Flow

### Library path (primary for curated content)

1. Admin runs `python -m preprocessor.library_cli build COURSE.zip ...` and `load` to populate `library.db`
2. User visits `/library`, browses the catalog, clicks "Add" on a course
3. Frontend calls `POST /api/library/:slug/add`
4. Backend fan-out copies course + lectures from `library.db` into `sylibos.db` with `has_segment = 0`
5. Store is hydrated and user is navigated to `/course/:courseId`
6. Nightly cron job picks up the new lectures (has_segment = 0 filter) and generates quizzes

### Python preprocessor path (direct import, per-user)

1. Run `python -m preprocessor path/to/course.zip --push-to https://sylibos.jkos.net --token $TOKEN`
2. Produces a `CourseManifest` JSON and posts it to `POST /api/import-manifest`
3. Backend converts manifest → course + lectures in one transaction, stamps `userId` from the token
4. Nightly cron job (or "Run AI job now" in Settings) generates segments for all unprocessed lectures

---

## 9. Environment Variables

### Backend (`SylibOS/.env`, mounted via `env_file`)

| Variable | Required | Notes |
|----------|----------|-------|
| `JKOS_AUTH_PUBLIC_KEY` | Yes | RS256 public key from jkos-auth |
| `SHELL_URL` | Yes | `https://sylibos.jkos.net` — used for CORS |
| `PORT` | Defaults `8004` | Set in docker-compose environment block |
| `DB_PATH` | Defaults `sylibos.db` | Set to `/data/sylibos.db` in docker-compose |
| `LIBRARY_DB_PATH` | Defaults `/data/library.db` | Path to the shared library catalog. The `/data` volume is already mounted — add `LIBRARY_DB_PATH=/data/library.db` to `.env` |
| `NIGHTLY_CRON` | Defaults `0 2 * * *` | Standard cron syntax |
| `AI_PROVIDER` | Defaults `none` | `lazuros` \| `ollama` \| `none` |
| `LAZUROS_URL` | For AI | `http://host.docker.internal:8080` |
| `LAZUROS_TOKEN` | For AI | Must match `LazurOS/.env` and `BeigeBoard/.env` |
| `OLLAMA_URL` | For direct Ollama | `http://host.docker.internal:11434` |
| `OLLAMA_MODEL` | For direct Ollama | `llama3.2` |

### Frontend (baked at build time as ARG)

| Variable | Value |
|----------|-------|
| `VITE_JKOS_AUTH_URL` | `https://auth.jkos.net` |

---

## 10. Docker Details

### `SylibOS/Dockerfile` (frontend)
```dockerfile
FROM node:20-alpine AS builder
ARG VITE_JKOS_AUTH_URL=https://auth.jkos.net
ENV VITE_JKOS_AUTH_URL=$VITE_JKOS_AUTH_URL
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# SPA fallback configured inline
```

### `SylibOS/backend/Dockerfile`
```dockerfile
FROM node:20-alpine
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY *.js ./
ENV NODE_ENV=production
EXPOSE 8004
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:8004/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
CMD ["node", "index.js"]
```

### `docker-compose.yml` highlights

**Prod** (`SylibOS/docker-compose.yml`) has `name: jkos-prod-sylibos` at the top level to prevent Docker Compose from confusing the prod and staging projects (both directories are named `SylibOS`).

```yaml
name: jkos-prod-sylibos
services:
  sylibos-api:
    env_file: .env
    environment:
      PORT: "8004"
      DB_PATH: /data/sylibos.db
    volumes:
      - ${SYLIBOS_DATA_PATH:-/mnt/Luna/Backends/SylibOS-Data}:/data
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

**Staging** compose uses `container_name: staging-sylibos-*` and joins `nginx-staging-proxy`.

`LIBRARY_DB_PATH=/data/library.db` is already set in `.env`. The `/data` volume is already mounted, so no compose change is needed.

---

## 11. Staging Configuration

### Env var differences from prod

| Variable | Prod value | Staging value |
|----------|-----------|--------------|
| `JKOS_AUTH_URL` | `https://auth.jkos.net` | `https://staging.jkos.net/auth` |
| `VITE_JKOS_AUTH_URL` | `https://auth.jkos.net` | `https://staging.jkos.net/auth` |
| `VITE_APP_ORIGIN` | `https://sylibos.jkos.net` | `https://staging.jkos.net/sylib` |
| `SHELL_URL` | `https://sylibos.jkos.net` | `https://staging.jkos.net` |
| `SYLIBOS_DATA_PATH` | `/mnt/Luna/Backends/SylibOS-Data` | `/mnt/Luna/Backends-Staging/SylibOS-Data` |

### Vite base path (staging branch only)

The staging branch sets `base: '/sylib/'` in `vite.config.ts` so the SPA asset URLs include the path prefix. The prod branch has no `base` set (served from root).

---

## 12. Key Notes for Agents

- **TypeScript fixes (applied to main and staging branches):**
  - `src/components/Layout.tsx`: removed duplicate `initials()` function definition — there were two identical declarations causing a TypeScript error. Keep only the first.
  - `src/lib/db.ts`: `AppSettings` default changed to `scheme: 'nocturne'`. Valid `SchemeId` values are `'reading-room' | 'sandstone' | 'nocturne' | 'velvet'`. `'dark'` is NOT a valid `SchemeId` (it was the old string).
- **ESM vs CJS:** The backend uses `"type": "module"`. All imports must use `import`, not `require`. The `jkos-auth.js` file is the ESM adaptation of the canonical middleware.
- **All user data is per-user:** `req.user.sub` (string) is the `user_id` key on every user data table. Never omit it. The `userId` is always stamped server-side from `req.user.sub`, never accepted from the request body.
- **`library.db` is read-only at runtime:** `openLibraryDb` opens it with `{ readonly: true, fileMustExist: true }`. Do not add write paths to the API for `library.db`. All writes go through the Python pipeline.
- **`lectures` table has no `user_id` column:** User ownership of lectures is enforced through the `courses` FK. The nightly job recovers `user_id` by joining `lectures` with `courses`.
- **`source_slug` is the library link:** A course row with `source_slug IS NOT NULL` came from the library. The catalog's `added` flag queries `WHERE user_id = ? AND source_slug IS NOT NULL`.
- **Frontend always connects to backend:** There is no "local-only" mode. All API calls use `credentials: 'include'` at relative URLs. Authentication is via jkOS cookie.
- **Nightly job picks up library lectures automatically:** Every lecture copied by the fan-out lands with `has_segment = 0` and real `content`. `getLecturesWithoutSegments()` filters on `has_segment = 0 AND content != ''`. No nightly-job changes were needed.
- **Nightly job uses service-to-service auth:** The cron job uses `LAZUROS_TOKEN` bearer auth, not `jkos_token`. Never add jkOS Auth cookie checking to the nightly job path.
- **`better-sqlite3` is synchronous:** All DB calls are blocking (no `await`). Intentional — SQLite is fast enough.
- **Segment generation is idempotent:** `getLecturesWithoutSegments()` only returns lectures with `has_segment = 0`. Already-processed lectures are never regenerated. `insertSegment` uses `INSERT OR IGNORE` — a duplicate segment ID (e.g. from a race or replay) is silently skipped; it cannot overwrite a segment belonging to a different user.
- **`patchSegment` is a transaction:** Both the `completedAt` and `quiz` UPDATEs run inside a single `db.transaction()` — no partial state if one fails.
- **`completedAt` truthiness check:** `PATCH /api/segments/:id` only increments `completed_segments` when `completedAt` is truthy (a real timestamp). Sending `completedAt: null` does not increment the counter.
- **Video fallback for library courses:** `normLecture` reads `video_url` first; if that is null (which it always is for library-sourced lectures), it falls back to the first URL in the `videos` JSON column. Library courses with video links therefore show their video player in the lesson page.
- **Settings "Run AI job now" is admin-only:** The button in `/settings` is only rendered when `user.role === 'admin'`. Non-admins no longer see it.
- **ORDECK context:** In the ORDECK docker-compose, `SHELL_URL` must be set to `https://jkos.net` (not `sylibos.jkos.net`) so CORS accepts requests from the ORDECK shell.
- **IDs:** All resource IDs (courses, lectures, segments) use `crypto.randomUUID()` on both frontend and backend. Do not use `Math.random()`-based IDs anywhere in this codebase.
- **Design system:** UI components live in `src/components/ui.tsx`. Always import `Button`, `Card`, `Icon`, `Badge`, `EmptyState`, `Spinner`, etc. from there. `Badge` takes `color` (optional CSS string), not `variant`. `EmptyState` uses `body` prop, not `description`. `Icon` accepts only the named icons listed in the type union — check before using a new icon name.
- **Library CSS:** Library page styles use the `library-` CSS class prefix, defined at the bottom of `src/index.css`. Do not add inline styles to Library components — extend the `library-` block in `index.css`.
- **Theme:** `settings.theme` (`'light' | 'dark'`) is stored in both the backend DB and localStorage. Read/write it only through `useTheme()` from `src/lib/theme.ts`.
- **Slice progress is local-only:** `db.getSliceProgress` / `db.setSliceProgress` in `src/lib/db.ts` use `sylibos:sliceProgress` in localStorage. Never sent to the backend.
- **`call<T>` is exported:** If you add new API endpoints on the frontend, use `call<ReturnType>('/api/...')` from `src/lib/api.ts` rather than raw `fetch`. It handles auth cookies, token refresh, and JSON parsing.
