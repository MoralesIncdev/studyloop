# Real-Lecture Proof Run Manifest — 2026-08-10

Stable key/value block appended to by every Phase 4 plan. Do not remove or reorder existing entries — append new sections instead.

## Harness (Task 1 — 04-01)

| Key | Value |
|---|---|
| Proof date | 2026-08-10 |
| Proof config dir | `~/.studyloop-proof-2026-08-10` (`$HOME/.studyloop-proof-2026-08-10`) |
| Proof data dir | `~/StudyLoopProof-2026-08-10` (`$HOME/StudyLoopProof-2026-08-10`) |
| STUDYLOOP_PORT (API) | 4620 |
| WEB_PORT (UI) | 4621 |
| Harness start command | `cd /Users/antemo/studyloop && STUDYLOOP_CONFIG_DIR="$HOME/.studyloop-proof-2026-08-10" STUDYLOOP_PORT=4620 WEB_PORT=4621 npm run dev` (root dev script, server+web together via `concurrently`; `STUDYLOOP_FAKE_ANALYSIS` deliberately unset) |
| Harness start time | 2026-08-10T17:59:36.359Z (server "listening" log line) |
| Smoke project id | `5b9601fd-4f6b-45b2-b5b9-b1b28504524b` |
| Candidate URL (Task 1, ASSUMED pending Task 2 gate) | https://www.youtube.com/watch?v=K0maLgTzIto |
| Video title | Mechanical Ventilation Explained Clearly by MedCram.com \| 2 of 5 |
| Author | MedCram - Medical Lectures Explained CLEARLY |
| Duration | 870s (14:30) |
| Transcript segment count | 612 |
| Resolve branch that actually fired | **yt-dlp caption fallback** (Phase 1 fix). Server log: `"youtube resolve: innertube metadata-only, trying yt-dlp for captions"` for both the UI-triggered resolve and the evidence-capture resolve call — Innertube resolved title/author/duration but returned no usable captions on this network; the yt-dlp fallback then supplied all 612 segments. This is NOT the vacuous "Innertube succeeded outright" case RESEARCH Pitfall 1 flagged as a risk — the fallback genuinely fired and is what produced the transcript both times. |
| Declared transcript source category (`GET /api/transcript`) | `youtube` (`transcript.path = "captions.json"`, category is source-*shape*, not branch — see FINDINGS.md OBS-1 for the distinction) |
| Provider | zai |
| Model | glm-5 (provider default, `analysisModel: null` in config) |
| Real config checksum before harness setup | `33c07b026fe886fa654a7bfc031f97db817c92eaea672581f0af80816107f240` |
| Real config checksum after harness setup | `33c07b026fe886fa654a7bfc031f97db817c92eaea672581f0af80816107f240` (unchanged) |
| Evidence-dir credential scan | 0 matches (scanned 5 files, zai key value never present) |

## Lecture content gate (Task 2 — 04-01)

| Key | Value |
|---|---|
| Final chosen video URL | https://www.youtube.com/watch?v=K0maLgTzIto |
| Final chosen video title | Mechanical Ventilation Explained Clearly by MedCram.com \| 2 of 5 |
| Duration | 870s (14:30) |
| Audit verdict | **COMMIT** (4 of 5 topics Taught: PEEP, FiO2, pressure support, CPAP; SIMV absent) |
| Candidates evaluated | 1 (passed on first evaluation, no replacement search needed) |
| Expected chunk count at 8-min (480s) chunk window | 2 chunks (`ceil(870/480)`) |
| Full audit | `preflight/transcript-topic-audit.md` |

## Deck + concept doc (Task 3 — 04-01)

| Key | Value |
|---|---|
| Deck source URL | https://www.cdc.gov/nhsn/pdfs/pscmanual/10-vae_final.pdf |
| Deck publisher | CDC / National Healthcare Safety Network (NHSN) — government health service |
| Deck sha256 | `6f4b1cf15907e64c2f9bd737a2f6622ff437d84b6a33b9d9cccd045b06d4a822` |
| Deck local path | `/Users/antemo/StudyLoopProof-2026-08-10/independent-deck/cdc-nhsn-vae-protocol-chapter10.pdf` (outside repo) |
| Text-layer or image-only | Text-layer (44 pages, 0 empty, 928–4622 chars/page; 124 PEEP / 114 FiO2 mentions) |
| Full provenance | `preflight/deck-provenance.md` |
| Concept doc path | `docs/proof-evidence-2026-08-10/inputs/concept-doc.md` |
| Concept doc parsed card count / anchor range | 4 cards, all anchored, anchors span 22s–502s (0:22–8:22, 480s spread) |

## Setup — proof project created via UI paste (Task 1 — 04-03)

| Key | Value |
|---|---|
| Proof project id | `41b2d9ea-a4b1-428a-b09a-7065ed3dee1f` (this is THE proof project used for the rest of 04-03/04-04/04-05) |
| Smoke project id (04-01, distinct, not deleted — no delete route exists, carries no analysis, contributes nothing to the review queue) | `5b9601fd-4f6b-45b2-b5b9-b1b28504524b` |
| Learner action count | 2 (fill URL input @e6 → click Add @e7) — clean paste-then-submit, no workaround |
| transcriptSource (declared path category, `GET /api/transcript`) | `youtube` |
| Resolve branch that fired | yt-dlp caption fallback (inferred from elapsed time: `POST /api/youtube/resolve` took 18795ms — consistent with a yt-dlp subprocess spawn, not a <2s Innertube-cache hit; see F-03 for why this run could not capture the literal server log line 04-01 captured) |
| `POST /api/youtube/resolve` (UI-triggered, via project creation) | 18795ms, 200, 63535B |
| Transcript segment count | 612 (matches smoke project's count for the same video, as expected — same source) |
| Captions snapshot vs transcript segment count | 612 == 612, match |
| Project created at | 2026-08-10T18:29:32.621Z |
| FINDINGS.md status after Task 1 | 1 new finding (F-03, OBSERVATION — server-log branch confirmation unavailable to this subagent context) |

## Slides — independent deck attached via UI (Task 2 — 04-03)

| Key | Value |
|---|---|
| Attach method | UI's own "Attach slides (PDF)" control (`input[type=file]`, `gstack browse upload`, 1 action) — file path fed from a scratchpad copy of the vetted deck (browse's path-safety allowlist blocks paths outside cwd/tmp; content identical, sha256-verified before upload) |
| Deck filename | `cdc-nhsn-vae-protocol-chapter10.pdf` |
| pageCount | 44 |
| emptyPageCount | 0 |
| uploadedAt | 2026-08-10T18:32:15.206Z |
| Attached-deck chip title (confirmed via UI) | "cdc-nhsn-vae-protocol-chapter10.pdf — 44 pages" |
| Fold-into-analysis confirmation | No separate UI toggle exists — confirmed via source read (`server/src/routes/analyze.ts:95,113`): `readSlides()` result is unconditionally passed as `slidePages` into the analysis call whenever `slides.json` exists. Attaching IS enabling; there is nothing further to switch on. |
| Per-page char-count comparison vs 04-01's independent extraction | MISMATCH on all 44 pages, ~3.3% aggregate shortfall in this run (128,726 vs 133,096 total chars) — same file (sha256-verified), same page count, same emptyPageCount(0); recorded as F-04 (MINOR), not averaged away. This run's number (the real upload route's output) is authoritative for what Task 3's analysis will actually consume. |
| FINDINGS.md status after Task 2 | 1 new finding (F-04, MINOR — extraction char-count drift between 04-01's ephemeral vetting script and the real route) |

## Clinical analysis — real provider run via UI (Task 3 — 04-03)

| Key | Value |
|---|---|
| Trigger | Clicked the study view's "Analyze" pill (`gstack browse click`, 1 UI action) — no fake-analysis override present in the running server's environment (confirmed via `ps eww` on the tsx-watch process and its node child: no `STUDYLOOP_FAKE_ANALYSIS` var set) |
| Analyze clicked at | 2026-08-10T18:37:15Z |
| Analyze completed (status → `done`) at | 2026-08-10T18:41:50Z |
| Wall-clock duration | 4m35s (275s) — polled every ~10s throughout, full timestamped log in `run/analyze-status-log.json`; progress reported coarse-grained (0% → 25% for ~2m22s → 50% → done), consistent with 2 chunks at the 480s window 04-01 estimated |
| Schema version | 3 |
| Model (verbatim from payload) | `glm-5` — matches the configured provider default (`llmProvider: "zai"`, `analysisModel: null` in config → `PROVIDERS.zai.defaultModel === "glm-5"`, confirmed by source read of `server/src/lib/providers.ts`) |
| source field | `model` (not `stub` — confirms the live-provider path, not `FakeAnalysisClient`) |
| Fake-client synthetic-text scan | 0 matches — genuine provider output |
| domain | `clinical` |
| units / pearls / concepts / themes / edges | 18 / 8 / 18 / 4 / 8 |
| Evidence-from-both count (units with `evidence: "both"`) | 0 (all 18 units: `evidence: "transcript"`) — a real model judgment, not forced: the attached deck is CDC/NHSN's VAE *surveillance* protocol (PEEP/FiO2 threshold definitions for infection reporting), topically narrower than the lecture's broader ventilation-modes teaching content (04-01's own provenance doc flags this deck as "not a full substitute for the lecture's broader mode coverage") — recorded honestly as 0 rather than assumed nonzero |
| Enrichment-flagged count (units + pearls) | 0 |
| Anchors to verify (units.anchors + edges) | 74 |
| FINDINGS.md status after Task 3 | 1 new finding (F-05, OBSERVATION — evidence-from-both is 0, a genuine model judgment worth surfacing to 04-05's adversarial pass, not a bug) |

## Attestation lifecycle — full spread exercised via UI (Task 1 — 04-04)

| Key | Value |
|---|---|
| Attested (take → reveal → attest path) | 6: `cpap-vs-peep-terminology`, `continuous-pressure-in-cpap-peep`, `cpap-and-peep-setting-range`, `cpap-for-obstructive-sleep-apnea`, `peep-alveolar-recruitment`, `pressure-support-ventilation` — each with a genuine learner take typed into the card |
| Attested (skip → reveal → attest path) | 1: `four-ventilation-modes-compared` (CLUSTER type) — no userTake, proving the skippable-generation guarantee |
| Attested + Edited | 1: `peep-recruits-alveoli-for-oxygenation` — attested with a take, then Edit clicked, body textarea overwritten with a revised restatement, Save clicked; `userBody` in attestations.json now differs from the AI's original `unit.body` |
| Dismissed (stays dismissed) | 1: `ventilator-parameter-effects-on-gas-exchange` (CLUSTER, 4 members) |
| Dismissed → Undo dismiss | 1: `pressure-support-range` (DOSAGE, safety-tier) — dismissed, then Undo dismiss clicked; attestations.json entry fully removed (DELETE), proving the undo path round-trips to true "untouched" |
| Untouched (no attestation entry) | 9: `pressure-support-range` (post-undo), `ac-mode-example-ventilator-settings`, `writing-ac-mode-ventilator-orders`, `ac-mode-breath-cycle-on-waveforms`, `vent-parameters-and-gas-exchange`, `triggered-vs-backup-breath-on-pressure-waveform`, `ac-mode-volume-set-pressure-variable`, `pressure-alarm-for-decreased-compliance`, `peak-and-plateau-pressures` |
| Attested-with-take count | 7 of 8 attested units carry a non-empty `userTake` (all except the skip-path `four-ventilation-modes-compared`) |
| Safety-tier cards screenshotted | 2 DOSAGE units in this analysis: `cpap-and-peep-setting-range` ("you can set CPAP anywhere from five cm of water pressure...") and `pressure-support-range` ("That could be anywhere from five to 15. Okay.") — both verbatim quote blocks captured in run-07/run-08/run-06 screenshots; both render unconditionally regardless of reveal/attestation state, confirmed |
| Enrichment badge screenshot | N/A — this analysis carries 0 enrichment-flagged units/pearls (confirmed in the Task 3/04-03 manifest section above), so no enrichment-badged card exists to screenshot |
| Optimistic-mutation-without-rollback check | No divergence found — every UI action that appeared to succeed was confirmed present in the persisted attestations.json once async completion was allowed for (see F-06/F-08) |
| Automated verify script | PASS — `attested=8 withTake=7 dismissed=1 untouched=9` |
| FINDINGS.md status after Task 1 | 1 new finding (F-06, OBSERVATION — browse-tooling ref ambiguity against this app's intentionally-duplicated DOM, not an app bug) |

## Session-content paths — notes, captures, concept doc, watchedUpTo (Task 2 — 04-04)

| Key | Value |
|---|---|
| Notes | 3 substantive notes, 861 chars total, each ending in a real `^t:` seek token inserted via the pane's own "@ timestamp" control at 3 real (pointer-driven) player-seek positions: 24.6s, 183.3s, 298.2s |
| Captures | 3 captures via the "M" mine-this-moment hotkey at 38.3s, 128.6s, 339.2s (spread 300.9s, exceeds the 60s minimum) — each with a real frame shot + auto-mined transcript excerpt; 2 recaptioned with genuine learner commentary through BubbleRail's inline edit, 1 deliberately cleared to empty text (`shot` present, `text` empty) so the compile caption step had something to prompt for |
| Concept doc attach | `/Users/antemo/studyloop/docs/proof-evidence-2026-08-10/inputs/concept-doc.md`, 4 parsed cards (anchors 22s/184s/385s/502s) — attach initially 403'd (see F-07), recovered via Settings → "Concept documents" → one-click attach button in the dock |
| watchedUpTo | Persisted at 339.25s (the furthest of the note/capture seeks), monotonic high-water mark confirmed via `GET /api/projects/:id` → `run/project-before-compile.json` |
| Concepts Covered (dock counter) | "Covered 2 / 4" — `CPAP – what it actually is` (0:22) and `Pressure support – patient does the work, machine just helps` (3:04) covered; `PEEP – the pressure that's always left over` (6:25) and `FiO2 – how much oxygen you're actually giving` (8:22) not covered — genuine partial split, screenshotted (run-11) |
| Automated verify script | PASS — `notes=861ch tokens=3 captures=3 captioned=2 watchedUpTo=339.245...` |
| FINDINGS.md status after Task 2 | 2 new findings (F-07 MINOR — concept-doc attach requires an undocumented prior Settings step; F-08 OBSERVATION — mine-this-moment's async chain lands after a delay, and a stray re-dispatch produced one duplicate bubble cleaned up via the UI's own Delete-capture action) |

## Compile and export — full session-content render + byte-identity (Task 3 — 04-04)

| Key | Value |
|---|---|
| Synthesis (lesson summary) | Typed into the compile flow's "In your own words" card and saved via Save & continue — `project.lessonSummary` persisted (455 chars), screenshotted pre-save (run-12) |
| Caption step | 1 uncaptioned bubble (the 5:39 mined capture) prompted; captioned inline in the caption-pass modal ("The backup-rate explanation — ties back to unit7's cluster card...") before Save & compile |
| Compiled document | All 5 named sections present with real content — In my own words, Notes (3 real `[mm:ss](#t=N)` seek links), Captures (3, all captioned), Concepts Covered (2/4, matching the dock counter), Concept breakdown (Pearls block + 7-of-8 attested units in full incl. the edited `userBody` + Not yet reviewed titles-only list of 9 + Dismissed titles-only list of 1) |
| Export file | `/Users/antemo/StudyLoopProof-2026-08-10/projects/41b2d9ea-a4b1-428a-b09a-7065ed3dee1f/exports/study-2026-08-10.md` |
| Byte-comparison result | IDENTICAL — `diff` between `run/compiled-study-doc.md` (extracted from the re-read `POST /compile` evidence-capture response) and the on-disk export file returns no differences |
| Automated verify script | PASS — `compiled doc 10240 chars, all session sections populated, both partitions present, seek links present` |
| FINDINGS.md status after Task 3 | None — no new findings; every session-content path rendered real content with no empty-state placeholder |

## Adversarial verification — anchors, safety values, hallucinations, review-queue gate (Task 1 — 04-05)

| Key | Value |
|---|---|
| Verifier invocation | `cd server && npx tsx src/scripts/verifyAnchors.ts /Users/antemo/StudyLoopProof-2026-08-10/projects/41b2d9ea-a4b1-428a-b09a-7065ed3dee1f --out docs/proof-evidence-2026-08-10` |
| Anchor verification result | **82 checked** (66 unit anchors, 8 edge quotes, 8 pearl timestamps) — **50 exact, 0 normalized, 32 violations** (tolerance 15s) — a markedly higher violation rate (39%) than 04-02's cross-validation against the 2026-08-08 project (2/51, 4%) |
| Root cause of the 32 violations | Two distinct, both real: (1) F-09 — this lecture's yt-dlp auto-captions are YouTube's "rolling" cumulative format, un-deduplicated by StudyLoop's caption parser, which breaks strict-substring matching even for accurate content; (2) F-10 — 10/18 units' anchor timestamps genuinely drift from where the quote is spoken (0s to ~282s, growing with position in the lecture) |
| Manual re-verification of all 32 violated quotes | 100% of violated quotes independently located and confirmed as genuinely spoken, accurate content — **0 hallucinations found** among the violations (see `verification/hallucination-audit.md`) |
| Safety-value audit (DOSAGE units) | 2 DOSAGE units produced (`cpap-and-peep-setting-range`, `pressure-support-range`) — both numeric values exact (no rounding/paraphrase); both anchors drifted past tolerance (40s and 160s respectively — the 160s case is the anchor-verifier's one `time-drift` classification, the rest are `quote-not-found`). CONTRAINDICATION/LAB_VALUE/PRIORITIZATION: 0 units produced, untested not passed. Full detail: `verification/safety-value-audit.md` |
| Hallucination audit (all 18 units, 8 pearls, 8 edges — 0 enrichment-flagged so nothing pre-excluded) | 0 hallucinated or clinically-wrong claims found. Full per-item table: `verification/hallucination-audit.md` |
| New near-duplicate finding (F-11) | `vent-parameters-and-gas-exchange` (anchor drift ~282s) states the same fact as the correctly-anchored `ventilator-parameter-effects-on-gas-exchange` — a chunk-overlap duplicate that ANLZ-01's anchor-time-aware dedup did not catch because the surviving duplicate's own anchor time is itself wrong |
| SC3 review-queue cross-check | `verification/review-queue-crosscheck.json` — **18/18 tracked+due cards resolve to a feedable attestation entry** (8 attested units + 4 pearls linked to those units + 3 learner-authored bubble captures + 4 cluster-member cards under the skip-attested `four-ventilation-modes-compared`); **0 violations**; no un-attested pearl or cluster-member card present. Data root is isolated (only the smoke project and this proof project exist), so this result is attributable to this run alone. |
| reviewExport gate-inheritance observation | `GET /api/review/export.csv` independently re-derives the same 18-card set from the same on-disk sources as the queue (18 CSV data rows === 18 tracked/due cards) — no gate-inheritance gap observed |
| FINDINGS.md status after Task 1 | 3 new findings, all MAJOR (F-09 rolling-caption non-dedup, F-10 anchor-timestamp drift, F-11 near-duplicate escaping dedup) + 1 clean observation (reviewExport gate-inheritance) |
