# Context (from DOCs)

> Synthesized by gsd-doc-synthesizer, 2026-08-09 (re-run after cycle resolution). One DOC
> in set: docs/REAL-LECTURE-PROOF-2026-08-08.md (validation report, medium confidence).
> DOC is lowest precedence — evidence, not contract.

## Topic: Real-lecture milestone proof (2026-08-08)
- source: docs/REAL-LECTURE-PROOF-2026-08-08.md
- Milestone proven: "prove clinical + slides + document mode on a real nursing lecture." All three modes ran end-to-end against the live server (http://127.0.0.1:4600) on MedCram "Mechanical Ventilation Explained Clearly" (i6hmGVBbIJk, 13:17), each independently adversarially verified. No source code modified during the proof.
- Per-mode outcomes: Setup CONDITIONAL (worked only via manual yt-dlp workaround); Slides PASS 9/10; Clinical analysis PASS 9/10 (16 units / 11 pearls / 16 concepts / 3 themes, model glm-5, clinical lens auto-selected, 12/16 units evidence "both"; all 33 anchor quotes verbatim-verified; safety numbers exact; no hallucinated clinical claims); Document mode + compile PASS 9/10 (full attestation lifecycle + byte-identical export).
- Overall: CONDITIONAL PASS — the "conditional" earned by two flow-level gaps a real user hits before reaching the modes (Bug 1, Bug 2).
- Lecture-content caveat: the video title promises PEEP/FiO2/SIMV but this part only name-drops them (~5:49) — a lecture gap, not a StudyLoop defect; demo prep should pick a lecture whose title matches its content.
- Project on disk: /Users/antemo/StudyLoop/projects/2852bce9-cb76-4849-ad44-82ce98db8ed1/ (312 caption segments).

## Topic: Bugs found (deduped, severity-ordered)
- source: docs/REAL-LECTURE-PROOF-2026-08-08.md
1. MAJOR — YouTube resolve short-circuits before the yt-dlp caption fallback (`server/src/routes/youtube.ts:45-55` returns as soon as `resolved.title || resolved.captions` is truthy); Innertube resolved metadata but get_transcript failed, so normal flow creates transcript-less projects on this network. Fix direction: run yt-dlp fallback whenever `captions` is null, not only when the whole resolve fails.
2. MINOR — Image-only PDFs (the realistic whiteboard-lecture case) accepted with silently empty text; pdf-parse is text-layer-only (`server/src/lib/slides.ts`), no OCR and no warning signal. Fix direction: return `emptyPageCount` so the UI can warn.
3. MINOR — Near-duplicate units survive the merge pass: `mergeUnitsByFingerprint` (`server/src/lib/analysis.ts`) dedupes by label fingerprint only; chunk-overlap facts re-emit under different labels (two identical tidal-volume DOSAGE cards at t=449). Fix direction: anchor-time-aware dedup.
4. MINOR — Dismissed units listed under "Not yet reviewed" in the compiled document (`compileRenderer.ts:91-110` partitions solely by `isUnitFeedable()`). Spec-ambiguous — SPEC says "Unattested render… under Not yet reviewed"; a dismissed-vs-unreviewed distinction would be more honest.
5. MINOR — Model fills overlay fields the clinical lens says to leave empty, including lone `[""]` entries surviving into stored analysis.json (empty-string filtering only at merge, `analysis.ts:155-158`); one NCLEX category mislabeled.
6. MINOR — Ungrounded-but-correct enrichment (SIMV/PSV/CPAP definitions, "alveolar recruitment", "volutrauma") presented as lecture-derived, anchored to timestamps that only name-drop them. Also: one PART_OF edge semantically inverted; one pearl reproduces a lecturer oversimplification; one anchor preserves an upstream caption ASR error ("dew gas").
7. MINOR (design gap) — Pearl/concept-anchor timestamps in the compiled document are plain text `**[6:50]**`, not links; only user-note `^t:` tokens become links (`renderNotesTokens`).

## Topic: Fidelity findings (verifier evidence)
- source: docs/REAL-LECTURE-PROOF-2026-08-08.md
- All 33 anchor quotes are exact substrings of the caption stream, every anchor t within 15s of true position (0 violations, programmatic check). Safety values exact (tidal volume 500–600 cc / 8 mL/kg IBW, backup rate 12). No hallucinated clinical claims across 16 units / 11 pearls / 16 concepts / 3 themes. Slide integration demonstrably fired (12/16 units evidence "both"). Slides extraction exact, but proof partially circular (deck's text layer was manufactured from the transcript; image-only case hits Bug 2). Compile export byte-identical to API response; attestation gating (3 full, 2 "Your take", 13 titles-only) matches attestations.json exactly; session-content rendering paths (notes/captures/watchedUpTo/lessonSummary) remain unproven (legitimately empty).

## Topic: Fix list before showing a nursing student
- source: docs/REAL-LECTURE-PROOF-2026-08-08.md
- Ordered: Bug 1 (blocking — caption fallback), Bug 3 (chunk-overlap dedup), Bug 2 (emptyPageCount signal), Bug 6 (mark or suppress ungrounded enrichment), Bug 4 (separate "Dismissed" from "Not yet reviewed"), Bug 7 (clickable timestamps, nice-to-have), plus demo prep: pick a title-matching lecture or attach the follow-up part.
