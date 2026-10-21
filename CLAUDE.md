# CLAUDE.md — Cernly Engineering Reference

**Read this file at the start of every development session. Consult the relevant section before making any change.**

For complex subsystem details, follow the links to `/docs` where indicated.

---

## 1. What Cernly Is

Cernly is an AI-powered website intelligence platform. Users submit a URL; Cernly runs a multi-analyzer scan (Lighthouse/PageSpeed, SEO, SSL, accessibility, UX), extracts findings at the element level, generates prioritized recommendations, and provides an AI assistant ("Ask Cernly") that answers questions grounded in the user's actual scan data.

**Primary user journeys:**

1. Submit a URL → receive a scored report with findings
2. Browse findings grouped by recommendation (font display, image sizing, etc.)
3. Ask Cernly a question tied to a specific finding or recommendation
4. Follow a Guided Fix plan tailored to a persona (owner, cms-admin, developer)
5. Rescan to verify improvements

**Framework and key dependencies** (verified from `package.json`):

| Dependency | Version | Role |
|---|---|---|
| Next.js | 14.2.5 | App Router, server + client components |
| @clerk/nextjs | ^5.3.5 | Authentication |
| pg | ^8.12.0 | PostgreSQL client |
| stripe | ^16.5.0 | Subscriptions/payments |
| @react-pdf/renderer | ^4.9.0 | PDF report export |
| sharp | ^0.35.5 | Image processing |
| lucide-react | ^0.447.0 | Icons |

---

## 2. Infrastructure and Deployment

**Cernly is hosted on DigitalOcean App Platform, NOT Vercel.**

Never assume Vercel infrastructure, recommend Vercel-specific debugging steps, or reference Vercel environment variable conventions.

| Detail | Status |
|---|---|
| Hosting platform | DigitalOcean App Platform (confirmed by project owner) |
| `.do/app.yaml` config file | **UNVERIFIED** — not found in repo; may exist in DO dashboard only |
| GitHub → DO deployment trigger | **UNVERIFIED** — assumed auto-deploy on push to main; verify in DO dashboard |
| Build command | **UNVERIFIED** — likely `npm run build`; confirm in DO App Settings |
| Start command | **UNVERIFIED** — likely `npm run start`; confirm in DO App Settings |
| Production logs | **UNVERIFIED** — access via DigitalOcean App Platform console → Runtime Logs |
| Deployment history | **UNVERIFIED** — access via DigitalOcean App Platform console → Activity tab |

**Environment variables** (verified from `.env.example`):

```
NEXT_PUBLIC_APP_URL          # Canonical app URL (e.g. https://cernly.ai)
DATABASE_URL                 # PostgreSQL connection string
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ANTHROPIC_API_KEY
PAGESPEED_API_KEY            # Google PageSpeed Insights
BRIGHTDATA_API_KEY           # Proxy for sites that block automated requests
```

**Never set in production:**

```
BYPASS_SCAN_LIMIT=true       # Skips monthly scan enforcement — dev/test only (.env.local)
```

---

## 3. Database and Persistence

**Technology:** PostgreSQL, accessed via the `pg` package. Connection string: `DATABASE_URL`.

**Schema baseline** (`db/schema.sql`): defines `reports` and `subscriptions` tables.

**All database access lives in `lib/store.js`** (37 KB). All DB-touching code should go through its exported functions — never raw SQL outside that file.

### Runtime column additions

Many columns were added after initial deploy via idempotent `ensure*()` functions in `lib/store.js`:

```
ensureSlugColumn()           # UUID-based public sharing slug
ensurePublicColumn()         # is_public flag for report sharing
ensureAssessmentColumns()    # assessment, assessment_status, site_type, ux_score, ux_insights
ensureRecommendationsTable()
ensureWorkItemsTable()
ensureGuidanceColumns()
```

`instrumentation.js` runs `ensureSlugColumn()` and `ensurePublicColumn()` on every server start (Node.js runtime only, via `instrumentationHook: true` in `next.config.mjs`).

### Migrations

`scripts/migrate.js` — custom migration runner. Tracks applied migrations in a `schema_migrations` table. Current migration: `001_add_site_type_ux_columns` (adds `site_type`, `ux_score`, `ux_insights` and backfills from old JSONB).

### Key tables and columns

**`reports`**: `id`, `url`, `scores` (JSONB), `issues` (JSONB), `ai_summary`, `lh_data`, `seo_data`, `ssl_data`, `a11y_data`, `paid`, `user_id`, `created_at`, `expires_at`, plus runtime-added: `slug` (UUID), `is_public`, `assessment`, `assessment_status`, `site_type`, `ux_score`, `ux_insights`

**`subscriptions`**: subscription status and Stripe linkage per user

**`recommendations`** (runtime-created): grouped recommendations with `fingerprint`, `finding_fingerprints[]`, `supporting_findings`

**`work_items`** (runtime-created): guided fix progress per recommendation per user

### Backward compatibility

`ensure*()` functions use `ADD COLUMN IF NOT EXISTS` — existing rows are never broken by schema additions. The migration runner only runs each file once.

See `lib/store.js` for the complete exported API.

---

## 4. Scan Pipeline

**Entry point:** `POST /api/analyze` (`app/api/analyze/route.js`)

**Verified execution order** (read directly from source):

```
1.  Auth (Clerk) — anonymous scans are allowed; userId may be null
2.  Scan limit pre-check — free plan: FREE_SCAN_LIMIT (3) scans/month (UTC)
    └─ Checks subscription and monthly count in parallel; fails fast before analyzers
3.  pg_advisory_try_lock — prevents duplicate concurrent scans for same user
4.  Parallel analyzers (all four run concurrently via Promise.allSettled):
    ├── runLighthouse()  → lib/analyzers/lighthouse.js  (PageSpeed Insights, mobile, 45s)
    ├── runSeoAudit()    → lib/analyzers/seo.js
    ├── runSslCheck()    → lib/analyzers/ssl.js
    └── runA11yCheck()   → lib/analyzers/a11y.js
5.  Score normalization + issue collection + assignIssueFingerprintIds()
    └─ Issues sorted by severity: critical → warning → info → good
6.  runAiSummary()  ← awaited synchronously (not background)
    └─ Produces: aiSummary, siteType, uxScore, uxInsights, aiInsights, sectionSummaries
7.  generateRecommendations()  ← runs AFTER AI summary (best-effort; errors return [])
8.  Release pg_advisory scan lock
9.  saveReport()  ← persists report, scores, issues, AI summary, UX data
    └─ Atomic advisory lock check prevents two free-plan scans racing through pre-check
10. saveRecommendations()  ← only if report saved AND recommendations exist
11. Stage 2: runAssessment()  ← awaited synchronously (~4–6 s additional latency)
    └─ Runs AFTER saveRecommendations so top_opportunity fingerprints reference
       confirmed DB entries. assessment_status: 'completed' | 'failed' | null
12. Return { scores, issues, recommendations, reportId, reportSlug, assessment, ... }
```

Stage 2 (`runAssessment`) runs synchronously and adds ~4–6 s to user-visible response time (total ~25–30 s, within Next.js serverless budget). It is not a background/async task.

**Report access:** `GET /api/report?slug=xxx` (`app/api/report/route.js`)
- Gate: owner OR `isPublic` OR active Stripe session
- Returns: `{ ...report, recommendations, isOwner }`

**Recommendation fingerprints** are stable identifiers like `performance-font-display`. Each recommendation carries a `finding_fingerprints[]` array (e.g. `['lh:font-display']`) that maps individual findings to their parent recommendation.

**Finding fingerprint format:** `${source}:${auditId}` — e.g. `lh:font-display`

See `lib/recommendations.js` for `RECOMMENDATION_GROUPS`, grouping logic, and prioritization.

---

## 5. AI Architecture

### Ask Cernly (`/api/ask`)

**Route:** `app/api/ask/route.js`

#### Model configuration

**Model fallback chain** (verified from source — `MODEL_PREFERENCE` array in route):

```javascript
const MODEL_PREFERENCE = [
  'claude-haiku-5-5',           // Try first; 400/404 if account lacks access
  'claude-3-5-haiku-20241022',  // Widely accessible fallback
  'claude-3-haiku-20240307',    // Final fallback — correct dated ID
];
```

**Important distinction:**
- These model IDs are verified as present in source code.
- Whether a given model is **available to the Anthropic account** must be confirmed by a live API request. A 400 response on the first model typically means the account does not have access to that model — not necessarily a malformed request. Check the `error.type` field in the response body to distinguish `model_not_found` from a genuine request error before treating it as a fallback signal.
- To verify account-level model availability, make a minimal test request and inspect the response.

#### Timeout budget

- **Per-model timeout:** 25 s (`AbortSignal.timeout(25000)`)
- **Maximum theoretical budget:** ~75 s (3 models × 25 s each, if all time out)
- In practice, 400/404 failures are near-instant; the worst case is three consecutive timeouts.

#### HTTP error handling

| Status | Action |
|---|---|
| 400, 404 | Retry next model (model unavailable for this key) |
| 429 | Retry next model (rate limit) |
| 503, 529 | Retry next model (server-side load) |
| 401 | Abort loop (invalid API key — same key will fail on all models) |
| 403 | Abort loop (permissions) |
| Other 4xx | Abort loop |

#### Context assembly

1. Load report from DB by `reportId`
2. Load recommendations separately via `getRecommendationsByReport()`
3. If `findingFingerprintId` is provided, auto-resolve to parent `recFingerprint` via `finding_fingerprints[]`
4. Build system prompt: scores, top recommendations (up to 6), matched rec with full evidence, focus finding, element context, assessment, active guided fix step
5. Trim to 12,000-char limit if exceeded (logs original length before trim)

**Correlation ID:** every request generates `reqId` (base36 timestamp + random suffix). All log lines carry `[Ask API] [reqId]`. Error responses include `_debug: { reqId, stage, ... }` — see diagnostics section for sanitization requirements.

#### Context integrity rule

**Ask Cernly must not present generic guidance as personalized analysis when it was asked a question that originated from a specific report, recommendation, finding, or affected element and the required context could not be retrieved.**

If context retrieval fails:
- The failure must be logged (verified: `console.error` at the catch block in `route.js`)
- The current implementation continues with empty context, which may produce a generic-sounding answer

**Engineering requirement for future changes:** When `reportId` is present and context retrieval fails, the response must either:
1. Retry or recover the context, or
2. Clearly disclose to the user that it could not access their scan data and that its answer is therefore general rather than specific to their site

Never silently substitute generic guidance for context-grounded analysis.

### Guided Fix Plans (`/api/guide-plan`)

**Route:** `app/api/guide-plan/route.js`

- Authenticated only
- Valid personas: `owner`, `cms-admin`, `developer` (`cms` is a legacy alias → normalized to `cms-admin`)
- Cache key: `(recFingerprint, userId, persona, planFingerprint)` — content-addressed
- Static fallback: `lib/static-guidance.js` (67 KB) if AI call fails or key is absent

### AI Summary and Assessment

`lib/analyzers/ai.js` — `runAiSummary()` and `runAssessment()`. `buildFallback()` used when `ANTHROPIC_API_KEY` is absent.

---

## 6. Design System

### Typography (verified from `app/layout.js`, `tailwind.config.js`, `app/globals.css`)

- Primary font: **Inter** (Google Fonts, `font-sans`)
- Monospace: **JetBrains Mono** (`font-mono`)
- Layout fonts loaded via Next.js font optimization: DM Sans (`--font-dm-sans`), Manrope (`--font-manrope`)

### Color tokens (verified from repository)

The following tokens are defined in `app/globals.css` and `tailwind.config.js`:

```css
/* Dark background palette */
--bg:         #080C14   /* body background */
--card:       #0D1526   /* card background */
--card-hover: #131E30
--border:     #1A2740
--border-sub: #243352
--text:       #E8EFF7   /* primary text */
--text-2:     #C8D5E6
--text-3:     #A8B8CE
--muted:      #8899B5

/* Brand */
--teal:   #00D4AA       /* primary accent */
--purple: #A78BFA       /* secondary accent */
```

Tailwind extended palette: `teal.*`, `purple.*`, `base.950–100`.

Gradients: `bg-brand-gradient` (teal → purple), `bg-brand-gradient-r`, `bg-card-gradient`

Shadows: `shadow-glow-teal`, `shadow-glow-purple`, `shadow-card`

### Design conventions

**Use existing tokens and components.** These CSS tokens define what the repository provides. The actual visual treatment of the authenticated dashboard and report interfaces — including any light-surface areas — is the source of truth for UI decisions in those contexts.

**Do not introduce dark treatments arbitrarily** into the Guided Fix drawer, report tabs, overlays, or other interfaces that currently use light surfaces. Match the existing treatment of the interface area you are working in. If unsure of the current visual convention in a given interface, inspect the component before making changes.

---

## 7. Mandatory Engineering Workflow

### Before changing code

1. Read `CLAUDE.md`.
2. Inspect the relevant existing implementation (read the actual file — not recollections or summaries).
3. Trace the complete data flow end-to-end.
4. Identify dependencies and potential regressions.
5. Distinguish confirmed defects from hypotheses.
6. Define measurable acceptance criteria before writing any code.

### While implementing

1. Make focused, minimal changes.
2. Preserve existing functionality.
3. Validate DB and API contracts.
4. Add or update tests.
5. Handle loading, empty, error, and success states.
6. Never hide critical failures behind misleading generic responses.

### Before declaring completion

1. Run `npm run lint` and `npm run build`.
2. Run relevant unit tests: `node __tests__/<file>.mjs`
3. Run relevant browser-level tests (see §8).
4. Verify affected API contracts.
5. Verify the user journey in a running application when environment permits.
6. Confirm deployment status if access exists.
7. Explicitly identify anything that could not be verified.

**A passing unit test, successful build, or clean commit does NOT establish that a feature works in production.**

---

## 8. Testing

**Unit test framework:** Node.js built-in `assert/strict`. No Jest, Mocha, or other test runners.

**Run a unit test file:**
```bash
node __tests__/<filename>.mjs
```

**Unit test files** (verified from `__tests__/`):

| File | Coverage |
|---|---|
| `recommendations.test.mjs` | Recommendation grouping and prioritization |
| `scoring.test.mjs` | Score calculation |
| `regressions.test.mjs` | Regression guard for previously fixed bugs |
| `stage0-5.test.mjs` | Scan pipeline stages |
| `milestone1.test.mjs` | Milestone 1 feature set |
| `ask-api-resilience.mjs` | Ask API model fallback, auth abort, timeout, empty response, rec failure |
| `chip-context-regression.mjs` | Finding chip → Ask Cernly context forwarding |
| `group-key-regression.mjs` | Recommendation group key stability |
| `a11y-element-evidence.mjs` | Accessibility element evidence collection |
| `items-persistence.mjs` | Work item persistence |
| `alias-hooks.mjs` / `alias-loader.mjs` | Module alias resolution |

### Browser-level testing

Unit tests cannot verify the complete user journey through the browser. Critical flows must also be covered by browser-level tests.

**Framework:** Playwright is the recommended framework if adopted (**UNVERIFIED** — not yet confirmed as installed; check `package.json` before assuming it is available). If Playwright is not yet installed, document that requirement as a gap and prioritize adding it.

**Flows requiring browser-level coverage:**

| Flow | What to verify |
|---|---|
| Ask Cernly — chip click | Clicking a contextual question chip sends `findingFingerprintId` in the POST body; response contains evidence-specific text, not generic guidance |
| Ask Cernly — report context | `reportId` is included; response references actual domain/findings from that report |
| Guided Fix — initialization | Plan generates for each persona; steps render correctly |
| Guided Fix — progress persistence | Completing a step persists to DB; page reload preserves state |
| Scan → report | Submitting a URL produces a report with scores and at least one recommendation |
| Auth gate | Unauthenticated users cannot access `/dashboard`; scan limit is enforced for free plan |

### Verification tiers — keep these separate

| Tier | What it establishes |
|---|---|
| Unit test (`.mjs`) | Helper logic, classification, data transformation |
| Browser test (Playwright) | Full user journey, rendering, API integration |
| Live AI integration test | Actual Anthropic API connectivity (run separately, not in CI) |
| Manual production check | Feature working at cernly.ai with real data |

**Mocked AI tests do not establish live Anthropic connectivity.** Maintain separate live integration tests (not run in CI) to verify that the API key is valid, the account can reach the configured models, and responses are non-empty. Never conflate passing mocked tests with confirmed production AI functionality.

Do not claim tests passed unless they were actually executed.

---

## 9. Debugging and Incident Handling

**When a feature fails:**

1. Reproduce the failure.
2. Capture the actual error (browser DevTools Network tab, `_debug` field in API error responses, server logs).
3. Trace the request: frontend → API route → DB query → external service.
4. Use `reqId` from `_debug.reqId` to find correlated server log lines (`[Ask API] [reqId]`).
5. Identify the root cause using evidence — not speculation.
6. Implement the smallest reliable correction.
7. Add a regression test.
8. Verify the complete affected workflow.

Do not apply speculative fixes in sequence without diagnosing the root cause.

### `_debug` response field — sanitization requirements

`/api/ask` returns a `_debug` field on error responses: `{ reqId, stage, status?, errorType?, lastErr?, lastStatus? }`.

This field is returned to the browser and visible in DevTools. It must be kept safe:

- **Never include** in `_debug`: full prompt text, DB error messages, SQL queries, credentials, API keys, auth tokens, raw exception stack traces, or user PII.
- `lastErr` (set to the last error message string) **may leak internal error detail** if a DB or network error message reaches it. Review any change that expands what is placed into `lastErr` or `_debug` before shipping.
- `errorType` comes from the Anthropic error response body (`error.type`) — safe to include.
- `reqId` is a random identifier — safe to include.
- `stage` is a hardcoded string constant — safe to include.

If the `_debug` field ever needs to expose more context for production diagnosis, route that detail to server logs only (tagged with `reqId`) and keep `_debug` minimal.

**Never log:** API keys, auth tokens, private user content, or full prompt text.

**Accessing logs:**

- **Development:** `npm run dev` → terminal stdout; search for `[Ask API] [reqId]`
- **Production:** DigitalOcean App Platform → Runtime Logs (**UNVERIFIED** — confirm tab name in DO console)

---

## 10. Reporting Standards

For every completed task, provide:

- What was changed and why
- Root cause (for bug fixes)
- Files modified
- Tests executed and results
- Build result (`npm run build`)
- Commit hash
- Deployment status (if known)
- What was actually verified
- What still requires manual or production verification

**Distinguish these states clearly:**

| State | Meaning |
|---|---|
| Implemented | Code written |
| Tested | Automated tests passed (specify which) |
| Committed | In version control |
| Deployed | Running on DigitalOcean |
| Verified in production | Manually confirmed working at cernly.ai |

Never use "fixed" or "fully working" when only the implementation has been completed.

---

## 11. Keeping This Document Accurate

Update `CLAUDE.md` (and linked `/docs` files) whenever a change materially affects:

- Infrastructure or deployment configuration
- Database schema or migration strategy
- AI model identifiers or fallback chain
- API contracts (`/api/ask`, `/api/analyze`, `/api/report`, `/api/guide-plan`)
- Authentication or plan-gating logic
- Test infrastructure

For complex architecture detail, create `/docs/<topic>.md` and link from the relevant section above. Keep this root file concise enough to read at the start of a session.
