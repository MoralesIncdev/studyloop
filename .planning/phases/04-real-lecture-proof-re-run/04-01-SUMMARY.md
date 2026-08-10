---
phase: 04-real-lecture-proof-re-run
plan: 01
subsystem: testing
tags: [proof-harness, youtube-ingest, transcript, concept-doc, pdf-provenance, isolation]

requires: []
provides:
  - "Isolated proof harness (STUDYLOOP_CONFIG_DIR/STUDYLOOP_PORT/WEB_PORT) with an asserted, non-real dataDir"
  - "Content-verified lecture (COMMIT verdict, 4/5 topics Taught) for the 04-0x evidence-grade run"
  - "Independent CDC/NHSN deck (D-02) with recorded provenance, not manufactured from the transcript"
  - "Anchored concept doc (Pitfall 3) that will make watchedUpTo observable in the compiled export"
  - "RUN-MANIFEST.md / FINDINGS.md ledgers for every later 04-0x plan to append to"
affects: [04-02, 04-03, 04-04, 04-05]

actuals:
  tokens: 26846
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "STUDYLOOP_CONFIG_DIR isolation with a hard pre-mutation dataDir assertion before any UI interaction"
    - "gstack browse (headless Chromium) for D-01's full-UI-walkthrough proof, non-video screenshots only"
    - "browse download --navigate to fetch a government PDF that Akamai's bot-fingerprint check 403s for a bare curl UA"

key-files:
  created:
    - docs/proof-evidence-2026-08-10/RUN-MANIFEST.md
    - docs/proof-evidence-2026-08-10/FINDINGS.md
    - docs/proof-evidence-2026-08-10/preflight/config-redacted.json
    - docs/proof-evidence-2026-08-10/preflight/smoke-resolve-response.json
    - docs/proof-evidence-2026-08-10/preflight/smoke-transcript-head.json
    - docs/proof-evidence-2026-08-10/preflight/transcript-topic-audit.md
    - docs/proof-evidence-2026-08-10/preflight/deck-provenance.md
    - docs/proof-evidence-2026-08-10/inputs/concept-doc.md
    - docs/proof-evidence-2026-08-10/screenshots/preflight-01-library.png
    - docs/proof-evidence-2026-08-10/screenshots/preflight-02-study-view.png
  modified: []

key-decisions:
  - "Reused the same candidate URL (MedCram '2 of 5') as Task 1's tracer input rather than pre-searching alternates — the content gate ran against real transcript evidence and it passed on the first try (4/5 taught), so no replacement search was needed"
  - "Rejected ardsnet.org as the independent deck candidate on a genuine TLS hostname mismatch (cert covers hedwig.mgh.harvard.edu, not www.ardsnet.org) rather than bypass with curl -k — chose CDC/NHSN's Chapter 10 VAE Protocol PDF instead, which has a valid cert and is public-domain U.S. government work"
  - "Downloaded the deck via gstack browse's real-browser download path, not curl — CDC's Akamai edge 403s a bare curl UA but serves the file normally to an actual browser session"

patterns-established:
  - "Proof evidence directories use preflight/ for gate/vetting artifacts and inputs/ for authored study materials — later 04-0x plans should follow the same split"

requirements-completed: []

coverage:
  - id: D1
    description: "Isolated proof harness stood up (ports 4620/4621, STUDYLOOP_CONFIG_DIR-scoped dataDir) with isolation asserted via GET /api/config before any mutating call; real ~/.studyloop/config.json verified byte-unchanged"
    requirement: "PROOF-01"
    verification:
      - kind: other
        ref: "node verify script embedded in 04-01-PLAN.md Task 1 <verify> — dataDir/provider/key-set assertions against preflight/config-redacted.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "Smoke project created entirely through the real browser UI (URL typed into the library input, Add button clicked) with a non-empty 612-segment transcript, no curl/API workaround for project creation"
    requirement: "PROOF-01"
    verification:
      - kind: automated_ui
        ref: "gstack browse session — preflight-01-library.png, preflight-02-study-view.png; preflight/smoke-transcript-head.json segment count check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Lecture content gate: transcript audited against 5 target topics before any LLM spend, COMMIT verdict on 4/5 Taught (PEEP, FiO2, pressure support, CPAP; SIMV absent)"
    requirement: "PROOF-01"
    verification:
      - kind: other
        ref: "node verify script embedded in 04-01-PLAN.md Task 2 <verify> — topic mentions + Verdict:COMMIT + taught-count>=3 check against preflight/transcript-topic-audit.md"
        status: pass
    human_judgment: false
  - id: D4
    description: "Independent, publicly published deck (CDC/NHSN Chapter 10 VAE Protocol, 44 pages, real text layer, not derived from the lecture transcript) sourced and vetted, with recorded provenance"
    requirement: "PROOF-01"
    verification:
      - kind: other
        ref: "npx tsx verify script (04-01-PLAN.md Task 3 <verify>, run from a temp .mts file after tsx -e's CJS-eval quirk blocked the literal invocation) — sha256/URL regex against preflight/deck-provenance.md"
        status: pass
    human_judgment: true
    rationale: "Publisher-reputability and genuine-independence are editorial judgments this executor made under an unusual constraint (every general search engine CAPTCHA-blocked the headless client, so the deck was found via direct domain navigation rather than a search result a human could audit) — a human should confirm the CDC/NHSN sourcing reasoning in deck-provenance.md before 04-03 treats this deck as settled."
  - id: D5
    description: "Concept doc authored with 4 level-2 headings, each carrying one real @ mm:ss anchor, spanning 0:22-8:22 (480s) across the video's ~7:15 midpoint so watchedUpTo produces a genuine covered/uncovered split"
    requirement: "PROOF-02"
    verification:
      - kind: other
        ref: "npx tsx verify script (04-01-PLAN.md Task 3 <verify>) — parseHeadings card count / anchor span check against inputs/concept-doc.md"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-10
status: complete
---

# Phase 4 Plan 1: Preflight — Isolated Proof Harness, Lecture Gate, Independent Deck Summary

**Stood up an isolation-asserted proof harness, drove a real UI paste-to-transcript flow through gstack browse, cleared the lecture content gate at 4/5 topics taught, and sourced an independent CDC/NHSN deck plus a spanning-anchor concept doc — zero LLM spend, zero code changes.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-10T17:58:00Z (approx, first Read of PLAN.md)
- **Completed:** 2026-08-10T18:12:00Z (approx, final commit)
- **Tasks:** 3/3
- **Files modified:** 10 created, 0 modified outside `docs/proof-evidence-2026-08-10/`

## Accomplishments

- **Isolated harness proven end-to-end through the real UI.** `STUDYLOOP_CONFIG_DIR=~/.studyloop-proof-2026-08-10`, `dataDir=~/StudyLoopProof-2026-08-10`, ports 4620/4621. Isolation was asserted (`GET /api/config` dataDir/provider/key-set check) before any mutating request; the real `~/.studyloop/config.json` checksum is unchanged (`33c07b0...` before and after). The candidate URL was typed into the library's own input and submitted via its Add button in a headless Chromium session (`gstack browse`) — no curl/API workaround for project creation. The smoke project (`5b9601fd-4f6b-45b2-b5b9-b1b28504524b`) ended up with a genuine 612-segment transcript via the **yt-dlp caption fallback** (Phase 1's fix) — Innertube resolved metadata but not captions on this network, confirmed twice from server logs, so SC1's "fallback fires, zero manual workaround" claim is proven non-vacuously.
- **Lecture content gate cleared on real evidence, before any LLM call.** Read all 612 segments of the smoke project's transcript. 4 of 5 target topics (PEEP, FiO2, pressure support, CPAP) are genuinely **Taught** — each defined, mechanism-explained, and given a concrete numeric value across multiple consecutive segments, quoted with timestamps. SIMV is **Absent** (a full-text regex scan found zero mentions, not even a name-drop). Verdict: **COMMIT** — comfortably clears the 3-of-5 bar and closes the exact title/content-mismatch gap the 2026-08-08 proof exposed (that prior lecture only name-dropped its promised topics once each with no explanation).
- **Independent deck sourced and vetted per D-02.** Every general-purpose search engine (Google, Bing, DuckDuckGo, Ecosia, Brave, Mojeek, several SearXNG mirrors) CAPTCHA-blocked the headless browser client — this pivoted the search to direct domain navigation. `ardsnet.org`'s ventilator protocol card was found but rejected on a genuine TLS hostname mismatch (cert covers `hedwig.mgh.harvard.edu`, not `www.ardsnet.org`) rather than bypassed with `curl -k`. Settled on CDC/NHSN's **Chapter 10: Ventilator-Associated Event (VAE) Protocol** (44 pages, real text layer — 0 empty pages, 928-4622 chars/page, 124 PEEP / 114 FiO2 mentions), a public-domain U.S. government work with a valid HTTPS cert, downloaded to `PROOF_DATA_DIR` (never the repo) via `gstack browse`'s real-browser download path (CDC's Akamai edge 403s a bare curl UA but serves the file to an actual browser session).
- **Concept doc authored to make watchedUpTo observable (Pitfall 3).** 4 level-2 headings (CPAP, pressure support, PEEP, FiO2), each with one real `@ mm:ss` anchor in the learner's own words, parsing through the shipped `parseHeadings` into 4 anchored cards spanning **0:22-8:22 (480s)** — straddling the video's ~7:15 midpoint, so a mid-video `watchedUpTo` in 04-0x will produce a genuine covered-vs-uncovered split rather than everything-or-nothing.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "paste a URL, get a transcript" through the real UI on an isolated harness** - `ae9f483` (feat)
2. **Task 2: Lecture content gate — prove the video teaches what its title promises** - `dfb476c` (feat)
3. **Task 3: Source and vet the independent public deck (D-02) and author the concept doc (Pitfall 3)** - `25501a4` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit below)

## Files Created/Modified

- `docs/proof-evidence-2026-08-10/RUN-MANIFEST.md` - stable key/value ledger (harness, lecture gate, deck+concept-doc sections) — every later 04-0x plan appends to this
- `docs/proof-evidence-2026-08-10/FINDINGS.md` - finding schema + 2 OBSERVATIONs (transcriptSource field semantics; Innertube unreliability confirmed twice)
- `docs/proof-evidence-2026-08-10/preflight/config-redacted.json` - isolation-assertion evidence (dataDir/provider/key-set, no credential material)
- `docs/proof-evidence-2026-08-10/preflight/smoke-resolve-response.json` - raw resolve payload snapshot (evidence capture only, not a project-creation substitute)
- `docs/proof-evidence-2026-08-10/preflight/smoke-transcript-head.json` - first 20 of 612 transcript segments + transcriptSource
- `docs/proof-evidence-2026-08-10/preflight/transcript-topic-audit.md` - 5-topic table with quoted timestamped evidence, COMMIT verdict, chunk-count estimate for 04-03
- `docs/proof-evidence-2026-08-10/preflight/deck-provenance.md` - CDC/NHSN deck source, sha256, page-level extraction evidence, independence statement, search-process note
- `docs/proof-evidence-2026-08-10/inputs/concept-doc.md` - 4-section learner study outline with real timestamp anchors
- `docs/proof-evidence-2026-08-10/screenshots/preflight-01-library.png` - pre-submit library view (0 videos, empty-state)
- `docs/proof-evidence-2026-08-10/screenshots/preflight-02-study-view.png` - post-navigation study view (title/author/transcript visibly loaded)

## Decisions Made

- Kept the MedCram "2 of 5" candidate rather than pre-emptively searching alternates — RESEARCH flagged it as ASSUMED/LOW-confidence, but the transcript audit (real evidence) cleared it at 4/5 Taught on the first pass, so the plan's "search for a replacement" branch was never needed.
- Rejected `ardsnet.org` for the independent deck on a TLS cert/hostname mismatch rather than force through with `curl -k` — a mismatched cert is a legitimate trust-boundary concern (threat T-04-03) independent of how well-known the underlying organization is.
- Used `gstack browse`'s real-browser download path instead of curl for the CDC PDF, since CDC's Akamai bot-fingerprint check 403s a bare curl `User-Agent` but serves the file normally to an actual browser session — no credential or auth bypass involved, purely a fingerprint difference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed the Playwright chromium-headless-shell build gstack browse expects**
- **Found during:** Task 1 (browser UI walkthrough)
- **Issue:** `gstack browse` failed to launch — the browser binary at the expected Playwright build path (`chromium_headless_shell-1208`) was missing; only a mismatched newer build (`-1234`, installed via a bare `npx playwright install`) was present.
- **Fix:** Ran `npx playwright install chromium-headless-shell` from `~/.claude/skills/gstack/browse/` (the directory whose own `playwright` dependency pins build 1208), which downloaded the correct build.
- **Files modified:** None (browser binary cache only, outside the repo)
- **Verification:** `browse goto http://localhost:4621` succeeded immediately after
- **Committed in:** n/a (no repo files changed by this fix)

---

**Total deviations:** 1 auto-fixed (1 blocking — tooling binary, not a package-manager install of a new dependency, so the package-legitimacy exclusion in Rule 3 does not apply)
**Impact on plan:** Necessary to unblock the D-01-mandated browser walkthrough. No scope creep — no plan file, PLAN.md, or app source was touched.

## Issues Encountered

- Every general-purpose search engine CAPTCHA/challenge-blocked the headless `gstack browse` client when searching for an independent deck (Google, Bing, DuckDuckGo standard and lite, Ecosia, Brave, Mojeek, and 4 public SearXNG mirrors all returned bot-verification pages). Worked around by navigating known reputable domains directly (cdc.gov) rather than via search-result discovery — documented in `deck-provenance.md`'s "Search process" section as a process note, not a StudyLoop product finding.
- `npx tsx -e '<inline script>'` (the plan's literal Task 3 `<verify>` invocation) failed with a CJS module-resolution error (`tsx -e` defaults to a CommonJS eval context even inside this ESM-typed `server/` workspace, and could not resolve `./src/lib/concepts.js`). Worked around by writing the identical script to a temp `.mts` file and running `npx tsx <file>` instead — same code, same assertions, same pass/fail outcome, just a different invocation shell that doesn't hit tsx's `-e` CJS-eval quirk. No PLAN.md acceptance criteria were altered.

## User Setup Required

None - no external service configuration required. The zai/glm-5 provider was already configured on this machine (`~/.studyloop/config.json`, verified present and untouched) — this plan only copied its provider selection and credential fields by reference into the isolated proof config, never editing the real file.

## Next Phase Readiness

- **The proof harness is still running** (background `npm run dev` under `STUDYLOOP_CONFIG_DIR=~/.studyloop-proof-2026-08-10 STUDYLOOP_PORT=4620 WEB_PORT=4621`) — 04-02/04-03 can either reuse this live instance (smoke project `5b9601fd-4f6b-45b2-b5b9-b1b28504524b` already has a transcript) or restart it identically from the verbatim command line recorded in `RUN-MANIFEST.md`.
- **04-03's evidence-grade run has zero open input questions**, per the plan's own success criteria: isolation-asserted harness ✓, content-verified lecture (COMMIT, 4/5 taught) ✓, independent deck with provenance ✓, concept doc with spanning anchors ✓.
- **D4's human_judgment flag (coverage table above)** is the one open item worth a human glance before 04-03 treats the deck as fully settled — the sourcing process itself (search engines blocked, direct-domain navigation used instead) is unusual enough to warrant a second look at `deck-provenance.md`'s independence/reputability reasoning, even though every mechanical acceptance criterion (sha256, URL, page-level text extraction) passed.
- No blockers. No server/src or web/src files were touched by this plan — the existing 1027-server/357-web baseline is unaffected structurally (not re-run this plan, since no production code changed).

## Self-Check: PASSED

All 10 created evidence files and the SUMMARY.md itself confirmed present on disk; all 3 task commit hashes (`ae9f483`, `dfb476c`, `25501a4`) confirmed present in git log.

---
*Phase: 04-real-lecture-proof-re-run*
*Completed: 2026-08-10*
