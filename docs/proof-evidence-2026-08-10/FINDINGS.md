# Real-Lecture Proof Findings — 2026-08-10

Every finding uses this schema:

- **ID** — sequential (`F-01`, `F-02`, ...)
- **Severity** — `MAJOR` (blocks a success criterion or requires a workaround) / `MINOR` (works but rough) / `OBSERVATION` (notable, non-blocking)
- **UI step** — which UI step failed or needed a workaround (or "n/a" for a non-UI observation)
- **Repro** — exact steps to reproduce
- **Workaround used?** — yes/no, and what

Per D-01: any UI step that cannot be completed in the UI is itself a finding, not something to smooth over with an API call.

---

## F-01 — OBSERVATION — `transcriptSource` field is a declared-path category, not a resolve-branch indicator

- **Severity:** OBSERVATION
- **UI step:** n/a (evidence-capture reading, not a UI failure)
- **Repro:** `GET /api/transcript?projectId=<id>` after creating a YouTube project returns `transcriptSource: "youtube"`. This value comes from `transcriptSourceForDeclaredPath()` (`server/src/lib/transcriptChain.ts:67`), which classifies the *declared transcript path's shape* (`captions.json` -> `"youtube"`) — it does NOT distinguish whether the captions were populated by Innertube directly or by the yt-dlp fallback route (`routes/youtube.ts:45-63`). The actual branch that fired for this run is only visible in server logs (`"youtube resolve: innertube metadata-only, trying yt-dlp for captions"`), not in any API response field.
- **Workaround used?** No — RUN-MANIFEST.md records the branch from the server log line directly rather than inferring it from `transcriptSource`, per RESEARCH Pitfall 1's instruction to document whichever branch actually fired.
- **Impact:** None on this run's evidence (the log line is authoritative and was captured), but future proof re-runs relying on `transcriptSource` alone to claim "the fallback fired" would be making an unsupported claim. Not a code defect — the field was never designed for this purpose, just noting the terminology gap for later report writers.

---

## F-02 — OBSERVATION — Innertube caption endpoint unreliable on this network, confirmed twice this run

- **Severity:** OBSERVATION
- **UI step:** n/a
- **Repro:** Both the UI-driven project-creation resolve call and the separate evidence-capture `POST /api/youtube/resolve` call for the same video (`K0maLgTzIto`) logged `"innertube metadata-only, trying yt-dlp for captions"` — Innertube never once returned usable captions for this video on this machine/network across two independent calls.
- **Workaround used?** No — this is the Phase 1 fallback (Bug 1 fix) working as designed, not a workaround. No manual yt-dlp invocation, VTT parsing, or curl step was performed by the operator; the server did it automatically inside the resolve route.
- **Impact:** None — SC1's "zero manual workarounds" claim is genuinely proven here (not vacuously, since the fallback branch is exactly what fired), consistent with the 2026-08-08 proof's own finding that Innertube is unreliable from this network.

---

## F-03 — OBSERVATION — Resolve-branch confirmation relies on elapsed time, not a captured server log line, in this executor's session

- **Severity:** OBSERVATION
- **UI step:** n/a (evidence-capture limitation, not a UI failure)
- **Repro:** 04-01 confirmed the fallback branch via a literal server log line (`"youtube resolve: innertube metadata-only, trying yt-dlp for captions"`) because that plan's executor session had direct access to the harness's foreground/background process output. This 04-03 task's executor is a fresh subagent spawned without a handle on that background process's stdout stream, so the same log line could not be captured directly. The branch is instead inferred from `POST /api/youtube/resolve` returning in 18795ms — an order of magnitude slower than Innertube's <2s warm-cache path documented in `server/src/routes/youtube.ts`'s own header comment, and consistent with a yt-dlp subprocess spawn (which the RESEARCH doc's own chunk-count estimate assumed could take up to its 30s timeout).
- **Workaround used?** No — the project was still created entirely through the real UI paste-then-submit flow (2 learner actions); this finding is about evidence-capture provenance, not about the learner-facing flow needing a workaround.
- **Impact:** Low. The elapsed-time signal is strong circumstantial evidence (F-02 already established Innertube is unreliable twice on this exact video/network from 04-01's own log capture), but a strict reader should treat "yt-dlp fallback fired" for this specific 04-03 run as inferred-from-timing rather than log-confirmed. Does not affect SC1's zero-manual-workaround claim, only the confidence level of the branch-attribution claim for this specific run.

---

## F-04 — MINOR — Per-page slide char counts differ ~3.3% between 04-01's standalone extraction script and this run's real upload-route extraction, same file

- **Severity:** MINOR
- **UI step:** n/a (evidence-capture comparison, not a UI failure — the actual UI attach flow worked cleanly, see Task 2 body)
- **Repro:** Same PDF (sha256 `6f4b1cf1...` unchanged, confirmed before upload), same page count (44), same `emptyPageCount` (0) in both runs. But per-page character counts differ on every one of the 44 pages — this run (via the real `POST /api/projects/:id/slides` route, `PdfParseSlideExtractor.extract`) yields 128,726 total chars; 04-01's preflight vetting script (an ephemeral `npx tsx` temp file, not committed, per 04-01-SUMMARY.md's own deviation note) recorded 133,096 total chars for the identical file — a consistent ~3.3% shortfall, same direction on every page (this run always lower). Full per-page arrays: this run `[4465,3815,2815,3788,3155,3114,3067,2489,3038,2201,3477,3288,2736,1032,2836,3292,3128,2879,3098,1074,4484,3742,2527,2463,2843,2704,997,1951,3538,875,977,3077,3987,3299,3590,3248,3121,3276,3127,3538,3101,3505,3959,2010]` vs 04-01 `[4435,3872,2902,3839,3259,3185,3148,2606,3094,2402,3615,3388,2841,1079,2876,3460,3257,2973,3254,1105,4622,3811,2548,2514,2906,2799,1022,2014,3676,928,1030,3123,4188,3627,3782,3433,3255,3427,3281,3621,3200,3596,4057,2046]`.
- **Workaround used?** No — the deck was attached entirely through the UI's own "Attach slides (PDF)" control (`gstack browse upload`, one action). The mismatch is between two *measurement* runs, not a flaw in the attach flow itself.
- **Impact:** Low-to-none on SC2. This run's number is the one that matters going forward — it is the actual production route's output, the exact channel `lib/analysis.ts`'s `buildSlideContextBlock` will read from for the real analysis in Task 3. The likely cause is that 04-01's ephemeral, uncommitted vetting script (deleted after that plan's Task 3 commit) used a `getTextContent()` call with different `normalizeWhitespace`/`disableCombineTextItems` options than the shipped route's exact `{ normalizeWhitespace: false, disableCombineTextItems: false }` — both scripts import the same `pdf-parse/lib/pdf-parse.js` module, so a config difference in the ephemeral script is the most plausible explanation for a small, uniformly-signed delta rather than a route-level regression. Recorded per the plan's own instruction not to average this away; not investigated further since 04-01's script no longer exists to diff against and the production route's own output is authoritative for what the analysis will actually consume.

---

## F-05 — OBSERVATION — Real clinical analysis recorded zero "evidence: both" units; the deck's narrower topical scope is the likely explanation, not a bug

- **Severity:** OBSERVATION
- **UI step:** n/a (analysis-output observation, not a UI failure — the analyze flow itself completed cleanly through the "Analyze" pill, see Task 3 body)
- **Repro:** `run/clinical-analysis.json` — all 18 units carry `evidence: "transcript"`; none are `"slides"` or `"both"`, despite the CDC/NHSN deck being genuinely attached and folded into every chunk's prompt (`slidePages` was non-empty; the model was instructed per the system prompt's own field description to mark `"both"` when slide text "plausibly contributed" to a specific unit). The model made this judgment itself — nothing in the pipeline forces `evidence: "transcript"` as a fallback beyond the prompt's own stated default.
- **Workaround used?** No — this is the real, unmodified model output from the live zai/glm-5 call.
- **Impact:** Likely benign but worth surfacing for 04-05's adversarial pass rather than silently treating "0 evidence:both" as a data quality problem. The most plausible explanation: the CDC/NHSN deck is a VAE *surveillance* protocol document (PEEP/FiO2 threshold definitions for infection-control reporting) — topically narrower and differently framed than the lecture's ventilation-modes teaching content. 04-01's own `deck-provenance.md` already flagged this as "not a full substitute for the lecture's broader mode coverage" when the deck was vetted. A genuinely independent deck that only partially topically overlaps producing zero "both" units on THIS specific lecture+deck pairing is a plausible honest outcome, not evidence of a broken slide-fold-in path (the deck's page-range text was confirmed present in the chunk prompts via source read in Task 2, and the model did use it as the RESEARCH's own field description authorizes it to). 04-05 should judge whether any unit's content plausibly drew on the deck's specific PEEP/FiO2 threshold language even though the model didn't tag it as such — that would be a labeling-fidelity finding distinct from this one.
