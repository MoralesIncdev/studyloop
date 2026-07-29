# StudyLoop Per-Feature Review & v3 Roadmap (adjudicated 2026-07-28)

Verdicts from five council sessions + patched seats, adjudicated against
`PEDAGOGY.md` (the governing framework). Format per feature: what the council
found through the mechanics / assumptions / presentation / intuitiveness lens →
adjudicated changes. Priorities are learning-leverage-per-build-effort.

---

## Discover & Navigate

**Up-next rail — verdict: fatal flaw as shipped.** Mechanics: displays
YouTube's engagement recommendations. Broken assumption: watch-time algorithm ≈
learning path. Presentation: sits exactly where the learner expects "next step."
- **[V3-C · P0] Concept Continuity rail** replaces raw related-list with the
  weighted scorer (PEDAGOGY §6: related + conceptSearch + teacherValidation +
  gapFill), each suggestion labeled with its "why".
- **[V3-C · P1] Teacher-validation cache** per channel (recurrence across
  independent concept queries).

**Search — verdict: right surface, wrong intent.** Assumes the learner knows
what to search; one video = unit of learning.
- **[V3-C · P1] Intent toggles** Overview / Deep dive / Troubleshooting
  (query reshaping, zero new UI concepts).
- **[V3-C · P2] "Learn X" goal object:** typed goal → sequenced results;
  gated on typed analysis accuracy (path-vaporware risk flagged by RedTeam).

**Home grid — verdict: fine as v2; learning value comes later.**
- **[V3-D · P2] Threads:** cross-series mini-curricula grouped by shared
  attested concepts — only after merge queue exists and extraction accuracy
  is proven (bad groupings destroy trust).

**Post-compile dead end — verdict: wasted golden moment.**
- **[V3-C · P1] "What's next"** panel after compile from the Concept
  Continuity scorer.

## Study Loop

**Player + transcript + CC — verdict: split-attention nightmare during
playback** (Mayer; STRONG evidence). Transcript quality assumption flagged
(jargon mis-transcription; already mitigated by editable transcripts? — no:
note as future).
- **[V3-A · P0] State-aware surface purge:** playing → video + CC only
  (transcript/notes fade to whisper); paused → full study surface snaps back.
  CSS-state change, tiny build, huge load reduction. CC and transcript never
  both fully visible.

**Concept ticker — verdict: auto-popping cards over video = extraneous load +
requires user education.**
- **[V3-A · P1] Ticker demotion:** concepts appear as progress-bar chips +
  rail highlight; card opens on demand (click/pause). Kill slide-over during
  playback.

**Notation modal — verdict: speed is right, blank textarea is intimidating,
auto-capture risks stealing generation.**
- **[V3-A · P0] Elaborative ghost prompts** rotating in the note field ("Why
  does this matter?", "The mechanism here is…", "This contrasts with…");
  captured quote/shot visually demoted to "reference material". Domain lens
  varies prompts (history: "who's claiming this and why?").
- **[V3-B · P2] Optional note structures** (Cornell cue/note; claim-evidence;
  mechanism chain) as templates in the notes pane — offered, never forced.

## Analysis Engine (decomposition/recomposition — the core)

**Verdict: v2 extracts generically and hands answers over freely; both are
wrong per PEDAGOGY §1–2.**
- **[V3-B · P0] Analysis v3 typed extraction:** one router call → domain tag
  (editable chip on the project); per-chunk extraction emits typed spine units
  (CLAIM/MECHANISM/PROCEDURE/EXAMPLE/BOUNDARY) + edges
  (REQUIRES/PART_OF/EXAMPLE_OF/PROCEDURE_STEP) with evidence quotes +
  confidence. Schema v3 per KGA model (nodes/edges/anchors/provenance/slots).
- **[V3-B · P0] Attestation loop:** concepts render as proposals with
  attest/edit/dismiss; only attested material feeds review + compile headline
  sections. Reveal-gating: summaries collapsed behind the learner's own
  attempt (per-project novice toggle flips to worked-example-first).
- **[V3-B · P0] Study Path rail tab:** linear prerequisite-ordered walk with
  generation slots as inline cards at media cues. No graph UI.
- **[V3-D · P1] Domain overlay fields + domain-specific slot types**
  (source-question / notation-map / execute-step) and threshold-concept
  tagging (reinforce step + "this unlocks later material" banner).
- **[V3-D · P1] Concept merge queue:** conceptRegistry.json + fingerprint
  match; "these look the same — combine?" rail badge; never auto-merge
  BOUNDARY/threshold/safety nodes.
- **[V3-D · P2] Library-level prerequisite graph + multi-video lesson
  composer** (transitive closure, cycle detection; "create lesson from
  library").

## Retention (Review mode)

**Verdict: architecture right, card quality is the whole game; streak
mis-rewards; lapses dead-end.**
- **[V3-B · P0] Lapse-to-context pipeline:** Again ×2 → inline 10s clip;
  ×3 → "Open in player" (seek + pause queue). Surface only on lapsed cards.
- **[V3-B · P1] Card transformation:** LLM converts weak bubbles into cloze /
  targeted questions (quote = source, user note = hint); pearls become
  why/application questions with corrective backs (answer + why + clip link).
  Cards without feedback backs are never generated.
- **[V3-B · P1] Mastery over streaks:** streak demoted to footnote; celebrate
  "concepts locked in" (graduated past 30d). No XP/leaderboards ever.
- **[kept] Implicit interleaving** across projects (already global — verified).
- **[V3-D · P2] Domain-aware question generation** (mechanistic why for
  biology, sourcing for history, scenario application for skills).

## Synthesis & Contribution

**Compile — verdict: aggregation posing as synthesis; the app's biggest wasted
activation moment.**
- **[V3-A · P0] Synthesis checkpoint:** compile opens with "In your own words,
  what was this lesson about?" — skippable; skipping renders a visible
  `[Write your summary to complete this lesson]` placeholder at the top of
  the doc. `lesson_summary` field added to project + bundle.
- **[V3-B · P1] Generation slots render into the compiled doc** (answered
  inline, blanks visible where skipped).

**Share bundles / overlays — verdict: sound wire format; missing the
narrative payload and the delta.**
- **[V3-C · P0] Overlay diff-on-import:** "From ⟨handle⟩'s analysis — N
  moments you haven't marked" rail section (set difference ±15s, sorted by
  importance, click-to-seek). The gap is the lesson.
- **[V3-C · P1] Bundle carries `lesson_summary` + per-concept `rationale`;**
  import renders the author's framing as a collapsible intro card.
  JSON-file sharing acknowledged as power-user path; link-based sharing waits
  for the community service.

**Heatmap — verdict: semantics actively misleading (attention ≠ importance;
crowd washes out experts; smoothing lies about sharp peaks).**
- **[V3-C · P1] Rename "Attention"; layered rendering** (own vs overlay,
  smoothed within layer only); **click-to-inspect** popover listing the
  marks composing a peak with author + text. Expert-handle pins never
  averaged into the crowd curve.

---

# v3 Roadmap (build order)

| Phase | Contents | Why first |
|---|---|---|
| **V3-A — Generate-first loop** | State-aware purge · notation ghost prompts · compile synthesis checkpoint · ticker demotion | Highest leverage per effort; almost all UI; makes the app *ask something of the learner* everywhere it currently doesn't |
| **V3-B — Typed analysis + Study Path** | Analysis v3 schema (router + typed spine + edges) · attestation + reveal-gating · Study Path rail with generation slots · card transformation · lapse-to-context · mastery-over-streaks | The engine change everything else feeds on |
| **V3-C — Discovery & apprenticeship** | Concept Continuity weighted rail · intent toggles · post-compile What's-next · overlay diff-on-import · attention heatmap layers · bundle narrative fields | Converts navigation and sharing from engagement-shaped to learning-shaped |
| **V3-D — Depth** | Domain overlays + domain slots · threshold tagging · merge queue · Threads · domain-aware questions · library graph + lesson composer | Compounding features gated on v3 accuracy |

Standing anti-features and honest-claims language: PEDAGOGY.md §8–9.
