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

---

## F-06 — OBSERVATION — `gstack browse`'s @ref resolution is unreliable against this app's intentionally-duplicated unit-card DOM

- **Severity:** OBSERVATION
- **UI step:** n/a (evidence-capture tooling limitation, not an app failure — the underlying UI control worked correctly every time it was actually clicked)
- **Repro:** `UnitProposalCard` is deliberately shared between multiple call sites (Study Path rail, RightRail's Concepts card, and the AI-breakdown section under the transcript — see the component's own header comment), so the same unit renders 3× simultaneously in the live DOM. Several `browse fill`/`browse click` calls against `@e`-numbered refs either timed out (`Operation timed out: click: Timeout 5000ms exceeded`) or, in one case, a `skip` click intended for `pressure-support-range` silently landed on a different duplicate instance of `ac-mode-example-ventilator-settings` instead — locally revealing that untouched unit's card (no take, no attest) without ever persisting an attestations.json entry for it.
- **Workaround used?** Yes, but entirely a tooling-side one: switched from positional `@ref` targeting to a small `js`/`eval`-driven helper that locates each unit's card by its stable label text (first DOM match = the block that actually corresponds to the visible layout) and dispatches real `click()`/native-setter `input` events on that card's own controls. No API call ever substituted for a UI action; every attestation, note, capture, and compile step in this plan was still driven through a genuine DOM click/keystroke.
- **Impact:** None on the persisted evidence — cross-checked every intended state change against `GET /api/projects/:id/attestations` before treating it as done, and the one accidental local-only reveal (`ac-mode-example-ventilator-settings`) never persisted (confirmed absent from attestations.json), so it still counts correctly as "untouched" per the server's data model. Worth flagging for future proof runs: this app's deliberate multi-surface duplication of the same interactive component is a legitimate design choice, but it means naive ref-based browser automation needs the same "target the first/visible instance by stable content" discipline used here.

---

## F-07 — MINOR — Concept-doc attach 403s from the study view until the doc's absolute path is first added in Settings

- **Severity:** MINOR
- **UI step:** ConceptsDock's custom-path "Attach" control (study view → Concepts)
- **Repro:** Typing the concept doc's real absolute path (`/Users/antemo/studyloop/docs/proof-evidence-2026-08-10/inputs/concept-doc.md`) into ConceptsDock's free-text input and clicking Attach returned `403 conceptDoc.path is outside configured roots` — `isPathAllowedCanonical` (`server/src/lib/paths.ts`) requires an **exact match** against `config.conceptDocs`, and the proof harness's config (`~/.studyloop-proof-2026-08-10/config.json`, set up in 04-01) had `conceptDocs: []`. The attach control itself never surfaces this requirement — it just accepts free text and lets the server reject it.
- **Workaround used?** No API bypass — recovered entirely through a second real UI step: navigated to Settings, added the doc's absolute path to the "Concept documents" field (confirmed the Data directory field still read the correct isolated proof root before saving), clicked "Save & rescan", returned to the study view, and the doc then appeared as a one-click quick-attach button that worked immediately.
- **Impact:** Low, but genuinely worth a UX note for 04-05: a first-time learner pasting a custom concept-doc path into the study view's own attach box gets a raw 403 with no signpost toward Settings as the fix. The security guard itself (exact-match allowlist, no arbitrary filesystem reads) is working exactly as designed — SPEC's own path-guard invariant — this is a discoverability gap in the two-step flow, not a broken or bypassable feature.

---

## F-08 — OBSERVATION — mine-this-moment's async capture chain lands after a short delay; one duplicate bubble was created and cleaned up via the UI's own delete

- **Severity:** OBSERVATION
- **UI step:** "M" (mine this moment) hotkey, capture rail
- **Repro:** `mineMoment()` awaits a frame-capture call plus a bubble-create call before updating the store; checking `GET /api/projects/:id/bubbles` immediately (sub-second) after a keypress under-reports — the bubble typically lands within 1-2s. Separately, a repeated keydown dispatch (issued for evidence-capture diagnostics, at a moment when the player's currentTime had not changed since the prior "M" press) produced a second bubble at the identical timestamp with identical mined text.
- **Workaround used?** No — the duplicate was removed through the capture rail's own real "Delete capture" button (with the standard `window.confirm` dialog auto-accepted), the same control a learner would use to delete an unwanted capture. No API-level deletion was used.
- **Impact:** None on final evidence (the intended 3 captures at 3 distinct real timestamps are exactly what's persisted and screenshotted). Worth noting only as an evidence-capture timing caveat for future proof-run executors: do not treat an immediate empty read after a mine/capture action as proof the action failed — allow for the async round-trip before concluding a UI action didn't work.

---

## F-09 — MAJOR — This lecture's yt-dlp auto-captions are YouTube's "rolling" cumulative format; StudyLoop's caption parser doesn't deduplicate it, producing a stuttering, heavily duplicated transcript

- **Severity:** MAJOR
- **UI step:** n/a — adversarial-verification finding (Task 1, 04-05), surfaces in the study view's transcript pane and every downstream consumer of `captions.json`
- **Repro:** `captions.json` for this run's proof project contains 612 raw segments where each new cue is a growing/overlapping window of the previous one before "resetting" (YouTube's rolling auto-caption style), e.g.: `[21.99] "Okay, CPAP is typically the term that is"` → `[22.00] "Okay, CPAP is typically the term that is used if this is non-invasive"` → `[25.19] "used if this is non-invasive"` → `[25.20] "used if this is non-invasive ventilation. In other words, if instead"` — each line repeats most of the prior line's words. `captionParse.ts`'s `parseCueBlocks` (used by both the SRT/VTT sidecar path and `ytdlp.ts`'s auto-sub fetch) parses each cue block independently and does no cross-cue deduplication. This is NOT a defect specific to this run's code path — the 2026-08-08 proof project's `captions.json` (`~/StudyLoop/projects/2852bce9-.../captions.json`) is clean, non-overlapping text for the *same parser*, confirming this is a per-video YouTube caption-track-format difference, not a regression.
- **Downstream impact:** (1) `GET /api/transcript` returns this same duplicated text to the study view's transcript pane — a real nursing student reading it would see genuine stutter/repetition, not the caption-quality gap being a purely internal artifact. (2) `chunkTranscript` (`analysis.ts:388`) builds the LLM's chunk prompt by joining `[mm:ss] segment.text` for every raw segment, so the model's own input carries the same duplication. (3) The committed anchor verifier (04-02) concatenates segments the same way to build its search index — this breaks strict-substring matching for anchor quotes whose true content spans a caption-format "reset" boundary, producing a large false-positive-looking violation count (see the Task 1 — 04-05 section below: 32/82 = 39% of this run's anchors, vs 2/51 = 4% on the clean-caption 2026-08-08 project).
- **Workaround used?** No — this is being reported, not patched. Fixing this would mean writing and testing a rolling-caption-reconstruction algorithm in `captionParse.ts`/`ytdlp.ts` (production code), which is out of this adversarial-verification plan's scope (Phase 4 plans have touched zero `server/src`/`web/src` files through 04-01/04-03/04-04, and this plan's own Task 1 instruction is explicit: "do not adjust tolerance or normalization after seeing the result" — the same discipline applies to not quietly patching the pipeline mid-audit).
- **Manual verification that the 32 anchor violations are NOT hallucinations:** every one of the 32 violated quotes was manually located in the raw caption stream near its claimed (or, where drifted, its true — see F-10) timestamp and confirmed as genuinely spoken content (see `verification/hallucination-audit.md`). The caption-format issue explains why the *mechanical substring check* fails; it does not by itself mean the *content* is wrong.

---

## F-10 — MAJOR — 10 of 18 units carry anchor timestamps that drift far from where their quote is actually spoken, growing to ~4m40s for the latest-covered material

- **Severity:** MAJOR
- **UI step:** n/a — adversarial-verification finding (Task 1, 04-05); surfaces as a wrong "jump to source" destination on any card whose timestamp a learner clicks (COMP-02's clickable-anchor feature)
- **Repro:** for each of the 24 unit-anchor violations the verifier flagged, the anchor quote's true spoken position was located manually (see `hallucination-audit.md`'s unit table for the full list). The drift is not random: it is near-zero for the earliest-covered material (`cpap-vs-peep-terminology` t=22, true≈22s, drift≈0s) and grows to the largest drift observed for the latest-covered material (`vent-parameters-and-gas-exchange` t=730 claimed, true≈448s, **drift≈282s / 4m42s**). Two DOSAGE (clinical safety-tier) units are affected: `cpap-and-peep-setting-range` (drift 40s) and `pressure-support-range` (drift 160s) — full digit-by-digit value comparison in `verification/safety-value-audit.md`. This is distinct from F-09: the caption-duplication issue (F-09) explains why an *exact substring* match fails even when the timestamp is correct; this finding is that the timestamp itself is frequently wrong, independent of the substring-matching mechanics.
- **Not investigated to root cause in application code:** this could originate in how the model reads `[mm:ss]`-prefixed chunk-prompt lines when synthesizing a quote spanning several raw (redundant) caption lines, in the merge/dedup pass, or elsewhere in `analysis.ts`'s chunk-to-unit pipeline — determining which would require code-level investigation and a fix, both out of this plan's scope (adversarial verification and reporting, not pipeline engineering). Recorded here as an observed, reproducible pattern with full drift data, for Phase 5+ to investigate.
- **Workaround used?** No.
- **Impact:** MAJOR on SC2's "all anchor quotes verbatim-verified" and SC5's honest-verdict requirement — this is why the dated report's Clinical mode verdict is CONDITIONAL, not PASS, and why PROOF-01's checkbox stays open. The affected content itself is accurate (see hallucination-audit.md) — a learner is never told something false, but is frequently pointed at the wrong 10-40 seconds of video (or, worst case, nearly 5 minutes away) when trying to verify a card against the source.

---

## F-11 — MAJOR — A chunk-overlap near-duplicate unit survived ANLZ-01's anchor-time-aware dedup because its own anchor time is one of the F-10-drifted ones

- **Severity:** MAJOR
- **UI step:** n/a — adversarial-verification finding (Task 1, 04-05)
- **Repro:** `vent-parameters-and-gas-exchange` (MECHANISM, claimed anchors t=710/730) and `ventilator-parameter-effects-on-gas-exchange` (CLUSTER, anchors t=430/433/446/448, correctly anchored) both state the same fact in near-identical words: "the first two [AC] parameters ... affect carbon dioxide / minute ventilation ... the last two ... affect oxygenation." `vent-parameters-and-gas-exchange`'s true spoken position (per F-10) is t≈427–448s — i.e. the *same* passage `ventilator-parameter-effects-on-gas-exchange` is correctly anchored to. Phase 2's `mergeUnitsByFingerprint`/anchor-time-aware dedup (ANLZ-01, the fix for the 2026-08-08 proof's Bug 3) presumably matches candidate duplicates partly by anchor-time proximity — with `vent-parameters-and-gas-exchange`'s own anchor claiming t=710/730 (282s away from its true position, and equally far from the other unit's correct t=430/448), the two units' *claimed* anchor times never land close enough for the dedup pass to consider them a match, even though their *true* positions and content are essentially the same fact.
- **Workaround used?** No — this is a real analysis-output observation, reported per Task 1's instruction, not fixed. Fixing the underlying anchor-drift (F-10) would very likely also fix this specific duplicate-survival case, but that is Phase 5+ engineering work, not this plan's scope.
- **Impact:** MAJOR on ANLZ-01's guarantee ("chunk-overlap re-emissions of the same fact under different labels no longer survive as near-duplicate units") — that guarantee holds for units whose anchors are correctly timed, but this run demonstrates it can be defeated when the anchor-drift bug (F-10) also affects one of the duplicate candidates. A learner reviewing this proof project's 18-unit set sees the same "first two parameters vs last two parameters" fact presented as two separate cards (one attested via `peep-recruits-alveoli-for-oxygenation`-adjacent flow, the other — `vent-parameters-and-gas-exchange` — dismissed by the attestation-lifecycle exercise in 04-04, coincidentally not surviving into the review queue for an unrelated reason: it was one of the two units 04-04 explicitly dismissed).

---

## Observation — reviewExport gate-inheritance watch item (RESEARCH flag), Task 1 — 04-05

Per 04-CONTEXT.md's scope note ("Watch items to observe during the run: ... reviewExport gate inheritance"): `GET /api/review/export.csv` (`routes/reviewExport.ts`) was hit against the same isolated harness immediately after `GET /api/review/queue`. It independently calls `deriveLiveCards` with the same `attestations`/`pearlReviewAdds` inputs read fresh off disk (not shared in-memory state with the queue route) and produced **18 data rows** — an exact match to the queue's 18 tracked/due cards (see `verification/review-queue-crosscheck.json`). **No gate-inheritance gap observed**: the CSV export's attestation gating is consistent with the queue's, both reading the same `attestations.json`/`review.json` sources independently rather than one trusting the other's in-memory state. This is a clean result, recorded per the plan's instruction to note what was seen "whether or not it is a problem."
