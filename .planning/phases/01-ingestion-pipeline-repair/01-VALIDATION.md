---
phase: 1
slug: ingestion-pipeline-repair
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6.0 (server), tests in `server/test/*.test.ts` |
| **Config file** | `server/vitest.config.ts` (`environment: "node"`, `include: ["test/**/*.test.ts"]`) |
| **Quick run command** | `npm run test -w server -- youtube` / `-- slides` (targeted) |
| **Full suite command** | `npm test` (server + web) |
| **Estimated runtime** | targeted ~seconds; full suite = 964 server + 345 web baseline (must not regress) |

---

## Sampling Rate

- **Per task commit:** targeted quick runs (`-- youtube`, `-- slides`)
- **Per wave merge:** `npm test` full suite
- **Phase gate:** full suite green + `npm run typecheck` in BOTH workspaces before `/gsd-verify-work` (phase touches `SlidesMeta`, mirrored server↔web)

## Requirements → Test Map

| Req ID | Behavior | Test | Exists? |
|--------|----------|------|---------|
| PIPE-01 | Innertube metadata-but-null-captions → yt-dlp caption fallback runs, captions merged | `server/test/youtube.test.ts` (route-level) | ❌ Wave 0 — file must be created |
| PIPE-01 | Total Innertube failure → yt-dlp legacy path; yt-dlp absent → `ytdlpMissing: true`, no throw | `server/test/ytdlp.test.ts:81-112` (lib layer ✅); route-level wiring (`routes/youtube.ts:76-84`) | partial — route branch untested |
| PIPE-01 | Captioned-YouTube fast path unchanged (regression) | same new `youtube.test.ts` | ❌ Wave 0 |
| PIPE-02 | Image-only PDF (all pages empty) → correct `emptyPageCount` | extend `server/test/slides.test.ts` w/ fixture PDF | ❌ Wave 0 |
| PIPE-02 | Text-layer PDF unchanged → `emptyPageCount: 0` | same file, counter-case | ❌ Wave 0 |
| PIPE-02 | UI warns when `emptyPageCount > 0` | manual/browser verification (no component-test norm in web workspace) | ❌ manual step in verify-work |

## Wave 0 Gaps

- [ ] `server/test/youtube.test.ts` — NEW: five branches (hit / metadata-only+fallback-succeeds / metadata-only+fallback-fails / total-miss+yt-dlp-succeeds / total-miss+yt-dlp-missing)
- [ ] `server/src/lib/ytdlp.ts` — add `__setResolveYoutubeForTests` DI hook (codebase's established DI pattern; needed for deterministic fallback-succeeds branch)
- [ ] `server/test/slides.test.ts` — extend with `emptyPageCount` cases against real `PdfParseSlideExtractor` using a tiny fixture PDF
- [ ] Framework install: none — Vitest already configured, suite green on `main`
