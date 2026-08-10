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

_Appended after Task 3 executes — see below._
