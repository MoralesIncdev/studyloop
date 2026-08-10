# Lecture Content Gate — Transcript Topic Audit

**Task:** 04-01 Task 2 (lecture content gate) — prove the video teaches what its title promises before any LLM spend, per RESEARCH Pitfall 2 and the 2026-08-08 proof's title/content-mismatch failure (docs/REAL-LECTURE-PROOF-2026-08-08.md lines 5-10, 64).

## Candidate

- **Video:** "Mechanical Ventilation Explained Clearly by MedCram.com | 2 of 5"
- **URL:** https://www.youtube.com/watch?v=K0maLgTzIto
- **Duration:** 870 seconds (14:30)
- **Segment count:** 612 (full transcript pulled from `GET /api/transcript?projectId=5b9601fd-4f6b-45b2-b5b9-b1b28504524b` and read end to end)

## Topic table

| Topic | Verdict | Deciding evidence |
|---|---|---|
| PEEP | **Taught** | Defined at [1:39–1:45]: "*...inspiration and specifically on exhalation. And that's where this PEEP comes from. PEEP stands for positive and expiratory pressure.*" Mechanism explained at [2:35–2:53]: "*...they have little grapeike clusters. That PEEP or that positive [e]nd expatory pressure... you'd like to keep those alvoli open, you can increase the PEEP on the ventilator...*" Numeric example set at [6:25–6:29]: "*...the [next] thing that we set is the PEEP. Let's say it's five.*" Clinical significance at [7:35–7:38]: "*...the higher the PEEP, the more alvoli you can recruit...*" — defined, mechanistically explained, given a concrete value, and tied to clinical effect across multiple consecutive segments. |
| FiO2 | **Taught** | Defined at [6:04–6:09]: "*The next thing you put in is the FiO2. So what is that? The FiO2 is the fractional inspiration of oxygen.*" Numeric example at [8:22–8:28]: "*AC 16, tidal volume 550, FiO2 of 50% and a PEEP of five.*" — named, explicitly defined by its expansion (fraction of inspired oxygen), and given a concrete clinical value. |
| SIMV | **Absent** | Zero occurrences of "SIMV" (or "synchronized"/"intermittent") anywhere in the 612-segment transcript, confirmed by full-text regex scan (`/synchron|intermittent|S\s?I\s?M\s?V/i`) against every segment. Not even name-dropped in this part — unlike the 2026-08-08 lecture's SIMV/PSV/CPAP name-drop-once pattern, this part simply does not raise the term. |
| Pressure support | **Taught** | Introduced and distinguished at [3:04–3:09]: "*The next mode of ventilation is called pressure support or just PS. Now, this is kind of like PEEP and CPAP...*" Mechanism (patient-triggered) at [3:35–3:37]: "*...it delivers a specific pressure support for each breath. Now the patient initiates all...*" Dose-relationship explained at [3:57–4:00]: "*...you can actually set the rate. So higher pressure supports give bigger breaths. The bigger the pressure, the...*" — named, defined, mechanism explained, and its dose-response relationship spelled out. |
| CPAP | **Taught** | Introduced at [0:09–0:22]: "*...additional modes of ventilation specifically now CPAP... CPAP is typically the term that is used if this is non-invasive...*" Mechanism and numeric range at [1:18–1:21]: "*...they're always getting the same amount of pressure. And so you can set CPAP anywhere from five cm of water pressure...*" Recap definition at [4:31–4:33]: "*...we've talked about CPAP, where the patient is on a continuous pressure regardless of...*" — named, defined (continuous pressure), given a concrete unit range, and revisited later for reinforcement. |

**Taught count: 4 of 5** (PEEP, FiO2, pressure support, CPAP). SIMV is the sole Absent topic — not a "named but never explained" case (the 2026-08-08 failure mode), it is genuinely never raised in this part of the series.

## Verdict: COMMIT

Decision rule: commit if at least 3 of 5 topics are Taught. This candidate scores 4/5 Taught, clearing the bar comfortably and closing the exact gap the 2026-08-08 proof's title/content mismatch exposed (that prior lecture only named PEEP/FiO2/SIMV once each with no explanation — this part defines and mechanistically explains four of the five target topics across dozens of consecutive segments each, with concrete numeric values).

Candidates evaluated: 1 (this candidate passed on first evaluation; no replacement search was needed).

## Runtime/cost inputs for 04-03 (RESEARCH Pitfall 4)

- **Duration:** 870 seconds (14:30)
- **Chunk window:** `CHUNK_WINDOW_SECONDS = 8 * 60 = 480` seconds (`server/src/lib/analysis.ts:347`)
- **Expected chunk count:** `ceil(870 / 480) = 2` chunks — the 04-03 analysis step should complete in roughly the time of 2 chunk-analysis LLM calls plus 1 merge call, not an open-ended wait. This is comparable in scale to the 2026-08-08 proof's 13-minute lecture (which fit in a single chunk), so no unusual cost/runtime risk is expected.
