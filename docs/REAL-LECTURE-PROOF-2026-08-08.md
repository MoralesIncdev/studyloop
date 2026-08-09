# Real-Lecture Proof — 2026-08-08

Milestone proven: **"prove clinical + slides + document mode on a real nursing lecture."** All three modes ran end-to-end against the live server (http://127.0.0.1:4600) on a real clinical lecture, and each was independently adversarially verified. No source code was modified during the proof.

## Lecture used

- **Video:** MedCram — "Mechanical Ventilation Explained Clearly - Ventilator Settings & Modes (Remastered)" — https://www.youtube.com/watch?v=i6hmGVBbIJk (13:17, whiteboard-style clinical lecture)
- **Topics actually taught in this part:** why patients get intubated (a breathing tube placed into the windpipe), the endotracheal tube (ET tube) and its cuff balloon, AC/CMV mode (Assist Control / Continuous Mandatory Ventilation — the ventilator delivers a full set breath every time, whether machine- or patient-triggered), tidal volume (air volume per breath: 500–600 cc, ideally 8 mL/kg ideal body weight), lung compliance (how much volume the lung accepts per unit of pressure, C = ΔV/ΔP), and how AC vs PC (Pressure Control) flip which variable you set and which you monitor.
- **Not taught in this part (deferred by the lecturer to the next video):** PEEP (Positive End-Expiratory Pressure — pressure left in the lungs at end of exhale), FiO2 (fraction of inspired oxygen), and the SIMV/PSV/CPAP modes — these are name-dropped once (~5:49) but never explained. The video title promises them; the content does not deliver them. This is a lecture-content gap, not a StudyLoop defect.
- **Project:** `2852bce9-cb76-4849-ad44-82ce98db8ed1` at `/Users/antemo/StudyLoop/projects/2852bce9-cb76-4849-ad44-82ce98db8ed1` — transcript: 312 YouTube caption segments (fetched via yt-dlp workaround, see Bug 1), title/author/duration resolved correctly.

## Per-mode outcome

| Mode | Outcome | Verifier fidelity score | One-line result |
|---|---|---|---|
| Setup (YouTube → project) | **Conditional** | n/a (not separately verified) | Worked, but only via a manual yt-dlp workaround — the normal client flow would have produced a project with no transcript (Bug 1). |
| Slides | **Pass** | 9/10 | PDF upload → per-page text extraction → slides.json all correct; error paths (non-PDF 400, corrupt 422) correct. Caveats: the test deck's text layer was manufactured from the transcript (no published MedCram deck exists), and image-only PDFs — the realistic case for a whiteboard lecture — extract silently empty text (Bug 2). |
| Clinical analysis | **Pass** | 9/10 | 16 units / 11 pearls / 16 concepts / 3 themes, model glm-5, clinical lens auto-selected, slides folded in (12/16 units evidence "both"). All 33 anchor quotes verbatim-verified against captions; safety numbers (tidal volume, backup rate) reproduced exactly, no hallucinated clinical claims. Quality-tier issues only (duplicates, ungrounded enrichment). |
| Document mode + compile | **Pass** | 9/10 | Full attestation lifecycle (attest/claim/dismiss/undo + both validation guards) and compile proven; 3 attested units render in full with "Your take", 13 titles-only — exactly the attestation-gated behavior the PRD specifies. Export byte-identical to the API response. |

**Overall: CONDITIONAL PASS.** The three target modes are proven faithful end-to-end on a real clinical lecture. The "conditional" is earned by two flow-level gaps that would hit a real user before they ever reached those modes: the caption-resolve fallback bug (Bug 1) and the no-OCR slide limitation (Bug 2).

## Bugs found (deduped, severity-ordered)

### 1. MAJOR — YouTube resolve short-circuits before the yt-dlp caption fallback; normal flow creates transcript-less projects
`POST /api/youtube/resolve` returned 200 with title/author/duration but `captions: null`. Innertube (youtubei.js — unreliable from this network, a known machine gotcha) resolved metadata but its `get_transcript` failed; because the route returns as soon as `resolved.title || resolved.captions` is truthy (`server/src/routes/youtube.ts` lines 45–55), the yt-dlp caption fallback never runs. A client following the normal resolve-then-create flow would create the project with `transcript {type:none}` — no transcript, so nothing downstream works.
**Repro:** `curl -X POST http://127.0.0.1:4600/api/youtube/resolve -H 'Content-Type: application/json' -d '{"url":"https://www.youtube.com/watch?v=i6hmGVBbIJk"}'` — captions absent.
**Workaround used:** fetched English captions directly with yt-dlp (`--write-subs --sub-langs 'en.*'`), parsed the VTT to `{start,end,text}`, and passed them as `captions` in `POST /api/projects` — server persisted them and `GET /api/transcript` returned all 312 segments with `transcriptSource:'youtube'`.
**Fix direction:** run the yt-dlp fallback whenever `captions` is null, not only when the whole resolve fails.

### 2. MINOR — Image-only PDF accepted with silently empty text; no OCR and no warning signal
The slide extractor (`server/src/lib/slides.ts`, pdf-parse@1.1.1) is text-layer-only. An image-only PDF — which is what a real deck for a whiteboard lecture like this one would actually be — returns HTTP 201 `{pageCount:3}` with every page's text `""`. The slide channel then silently contributes nothing to analysis, and the API gives no signal.
**Repro:** build a Pillow image-only PDF from lecture frames, then `curl -F "file=@imageonly.pdf;type=application/pdf" http://127.0.0.1:4600/api/projects/<id>/slides` → 201, all pages empty. Independently reproduced by the verifier (pdf-parse yields 0 chars).
**Fix direction:** cheaply return e.g. `emptyPageCount` so the UI can warn; OCR is acknowledged future work in the file header.

### 3. MINOR — Near-duplicate units survive the merge pass (chunk-overlap dedup miss)
Two DOSAGE units (a clinical safety-tier card type for drug/setting values) — `tidal-volume-setting-in-ac-mode` and `tidal-volume-in-ac-mode` — state the identical fact (500–600 cc, ~8 mL/kg ideal body weight) anchored at the same t=449 moment, and both were registered as separate concepts. The verifier also found a near-duplicate MECHANISM pair (`patient-triggering-via-negative-pressure` restates half of `ac-mode-trigger-and-volume-delivery` with the same anchor quotes). Cause: facts in the 1-minute chunk overlap get emitted under slightly different labels, and `mergeUnitsByFingerprint` (`server/src/lib/analysis.ts`) dedupes by label fingerprint only. A student would see two near-identical cards.
**Repro:** run clinical analysis on this project; inspect `units[7]` and `units[9]` in `GET /analysis`.
**Fix direction:** make dedup anchor-time-aware, not just label-based.

### 4. MINOR — Dismissed units are listed under "Not yet reviewed" in the compiled document
Dismissing a unit (learner explicitly rejects the card) files it in the export under "Not yet reviewed" alongside genuinely untouched units — misleading, since the learner *did* review it. Cause: `server/src/lib/compileRenderer.ts:91-110` partitions units solely by `isUnitFeedable()`. Spec-ambiguous (SPEC says "Unattested render… under Not yet reviewed") but a dismissed-vs-unreviewed distinction would be more honest.
**Repro:** `PATCH .../attestations/cuff-balloon-airway-protection {"status":"dismissed"}`, then `POST .../compile` — the unit appears under "### Not yet reviewed".

### 5. MINOR — Model fills overlay fields the clinical lens says to leave empty, including `[""]` entries
`server/lenses/clinical.json` instructs the model to fill only the 6 clinical overlay fields and leave the rest empty, but all 16 units carry cross-domain fields (entities, keyContext, actors, triggers, failureModes, mechanismType), and several arrays contain a lone empty string `[""]` that survives into stored analysis.json (empty-string filtering only applies at merge, per the comment at `server/src/lib/analysis.ts:155-158`). The 6 relevant clinical fields were filled correctly. Related metadata sloppiness: the backup-rate unit's NCLEX category (the US nursing-licensure exam's client-needs taxonomy) is "Management of Care" where "Physiological Adaptation" is correct.
**Repro:** run clinical analysis, inspect `units[].overlay`.

### 6. MINOR — Ungrounded-but-correct enrichment presented as lecture-derived
The "common-modes" cluster defines SIMV, Pressure Support, and CPAP, and other cards mention "alveolar recruitment" and "volutrauma" — none of which the lecture explains (it only name-drops the modes at ~5:49). All are clinically correct standard definitions, so no student harm, but they are model knowledge anchored to timestamps that don't support them. (Verifier-found; adjacent quality items from the same review: one PART_OF edge is semantically inverted; the "pressure and volume are inversely proportional" pearl faithfully reproduces a lecturer oversimplification without his compliance pivot; one anchor quote preserves the caption ASR error "dew gas" for "two gas" — an upstream caption defect.)
**Repro:** compare the cluster member bodies in `GET /analysis` against captions at 346.7–355s.

### 7. MINOR (design gap) — Timestamps in the compiled document are plain text, not links
Pearls and Concept-breakdown anchors render as `**[6:50]**` with no link target; only user-note `^t:` tokens become `[mm:ss](#t=N)` links (`renderNotesTokens` in `compileRenderer.ts`). Every timestamp *value* was verified accurate; none is clickable. Renderer design, not a compile failure — but "jump back to the moment" is the point of anchors.

## Fidelity findings (verifier evidence)

- **Anchors are verbatim:** all 33 unit/edge anchor quotes are exact substrings of the concatenated 312-segment caption stream, every anchor `t` within 15s of the quote's true position (0 violations, programmatic check).
- **Safety values are exact:** tidal volume 500–600 cc / 8 mL/kg ideal body weight, backup rate 12 (one breath per 5s) — reproduced without rounding or paraphrase, as the clinical lens promises.
- **No hallucinated clinical claims:** manual review of all 16 units / 11 pearls / 16 concepts / 3 themes found every clinical statement supported at its cited timestamp and clinically correct (AC=CMV, cuff/airway-protection mechanism, C=ΔV/ΔP, set-volume-read-pressure vs set-pressure-read-volume, AC/PC alarm logic).
- **Slide integration demonstrably fired:** 12/16 units carry `evidence:"both"` (transcript+slides), which only happens when slide pages are folded into chunk prompts.
- **Slides extraction is exact:** independent pdf-parse of the uploaded deck reproduces slides.json pages 1–10 verbatim; timestamps monotonic 00:40→12:50. Framing caveat: the deck's text layer was manufactured from the transcript (no published deck exists for this lecture), so text-bearing extraction is proven, but the proof is partially circular for "slides on this real lecture" — the realistic image-only case hits Bug 2.
- **Compile output is real and byte-stable:** export file `exports/study-2026-08-08.md` byte-identical to the API response; all 11 pearl timestamps and all 6 attested-unit anchors land on matching caption text; attestation gating (3 full, 2 with "Your take", 13 titles-only) matches attestations.json exactly. Caveat: notes/captures/watchedUpTo/lessonSummary sections were all legitimately empty, so compile's session-content rendering paths remain unproven by this exercise.
- **Verifier precision note:** "PEEP/FiO2 never mentioned" is exact for the names; the *concepts* are described unnamed (~5:03, ~5:13), and SIMV/"pressure support" are name-dropped once. The analysis's choice not to invent units for them is defensible.

## What must be fixed before showing a nursing student

1. **Bug 1 (blocking):** make the yt-dlp caption fallback run when Innertube returns metadata-but-no-captions (`routes/youtube.ts:45-55`) — otherwise the normal flow yields a transcript-less project on this network.
2. **Bug 3:** dedupe chunk-overlap duplicates (anchor-time-aware merge) — two identical tidal-volume cards is an instant credibility hit with a clinical audience.
3. **Bug 2:** at minimum surface `emptyPageCount` on slide upload so an image-only deck (the realistic whiteboard-lecture case) doesn't silently contribute nothing.
4. **Bug 6:** stop anchoring model-knowledge definitions (SIMV/PSV/CPAP) to timestamps that only name-drop them — either mark enrichment as such or suppress it; a student will trust the timestamp.
5. **Bug 4:** separate "Dismissed" from "Not yet reviewed" in the compiled export.
6. **Bug 7 (nice-to-have):** make pearl/anchor timestamps clickable in the export.
7. **Demo prep, not a code fix:** pick a lecture whose title matches its content (this part teaches AC mode + tidal volume + compliance; PEEP/FiO2/SIMV live in the next video), or attach the follow-up part — a student will notice the promised settings are missing.

## Evidence index

- Project on disk: `/Users/antemo/StudyLoop/projects/2852bce9-cb76-4849-ad44-82ce98db8ed1/` (captions.json, slides.json, analysis-derived files, attestations.json, exports/study-2026-08-08.md)
- Scratchpad evidence (session-temporary): `/private/tmp/claude-501/-Users-antemo/c7707f3c-dbfc-43ee-a0fc-7e3cba102569/scratchpad/` — `clinical-analysis.json`, `clinical-analyze-run-log.txt`, `compiled-study-doc.md`, `compiled-baseline.md`, `attestations-*.json`, `compile-*.json`, and `slides/` (built deck, build_pdf.py, all request/response captures, error-path probes)
- Source locations cited: `server/src/routes/youtube.ts:45-55`, `server/src/lib/slides.ts`, `server/src/routes/slides.ts`, `server/src/lib/analysis.ts` (mergeUnitsByFingerprint; UnitOverlaySchema comment at 155-158), `server/src/lib/terms.ts:337-347` (markAnalysisStale), `server/src/lib/compileRenderer.ts:91-110`, `server/lenses/clinical.json`
