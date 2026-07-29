# StudyLoop Pedagogy Framework (binding — adjudicated 2026-07-28)

Adjudicated from five council sessions (discover / study-loop / decompose /
retention / contribute; transcripts in `~/.openclaw/council/sessions/`, extracts
in the repo history) + two patched seats (KnowledgeGraphArchitect,
ScientificEditor on decomposition) + operator positions. Where advisors
conflicted, the resolution and reasoning are recorded here. This document
governs how every feature treats learning; `FEATURE-REVIEW.md` carries the
per-feature verdicts and roadmap.

## 1. The prime directive: generate → reveal → test → review

The strongest-evidence loop (retrieval practice STRONG, generation effect
STRONG for retention) and the app's central interaction rule:

1. **Generate:** before the app shows its answer for any concept, the learner
   is invited to produce their own (definition, prediction, explanation,
   next-step). Blank-first, always skippable — friction is invited, never
   forced.
2. **Reveal:** the AI summary/model answer is collapsed behind a reveal action
   and renders as *feedback on the learner's attempt*, not as the lesson.
3. **Test:** every pearl/concept can become a self-test item WITH corrective
   feedback (answer + one-sentence "why" + source-clip link). Retrieval
   without feedback reinforces errors — never ship a card without the back.
4. **Review:** the hidden-SRS resurfaces attested material; lapses degrade
   gracefully back to the source (text card → 10s clip → full player seek).

**Attestation (adopted from CEO-decompose + ScientificEditor, converged):**
extracted concepts are *proposals* until the learner attests them — verify,
correct, complete, or answer a slot. Only attested/learner-touched material
becomes review cards. This preserves the generation effect, builds provenance
("user-attested graph" is the moat), and keeps hallucinations out of the
review queue.

**Expertise-reversal rule:** novices get a concise worked example first, then
reconstruct it; advanced learners generate first, summary as feedback. v1
implementation: per-project "I'm new to this subject" toggle flips the default
order; no adaptive modeling yet.

## 2. Decomposition: universal spine + domain lenses

**Universal spine (survives every domain)** — typed knowledge units:
`CLAIM · MECHANISM · PROCEDURE · EXAMPLE · BOUNDARY` with edges
`REQUIRES · PART_OF · EXAMPLE_OF · PROCEDURE_STEP · CAUSES · CONTRADICTS ·
SAME_AS`, every node/edge carrying **evidence quotes, timestamps, and
confidence**. (Full JSON schemas: KGA patch, `design/`+repo history; analysis
v3 schema derives from it.)

**Domain lenses are prompt modules + optional overlay fields, not separate
engines:**
| Domain | Dominant units | Overlay highlights |
|---|---|---|
| Biology / systems | MECHANISM | level-of-organization, feedback type, entities |
| History | CLAIM+CAUSES | sourcing (primary/secondary, corroboration), proximate/structural/contingent causation, perspective flag |
| Music theory | schema (CLAIM+EXAMPLE) | notation↔sound pairing, key context, ear-training slot |
| Physical skill | PROCEDURE | trigger, failure modes, drill pairing (= the BJJ six-part frame we started from) |
| Generic fallback | balanced | none |

**Adjudicated architecture (resolves ProductStrategist vs CEO):** ONE cheap
router call per project classifies the domain into an *editable, visible-but-
subtle tag* (ScientificEditor: user-confirmable, never silently imposed).
Extraction stays one call per chunk (same cost as today) with the domain
module swapped into the prompt. The 13-call cascade the CEO feared never
existed in the plan; the "defer domains entirely" directive is rejected
because cost lands on the user's own key in a local-first app — but its
attestation core is adopted wholesale.

**Evidence-grade honesty (ScientificEditor):** domain schemas are STRONG for
biology mechanisms and historical-thinking heuristics, WEAK for deriving music
schemas from transcript alone (needs audio/notation — flagged limitation, not
a blocker) and WEAK for claiming video → motor-skill transfer. Auto-inferred
prerequisites are fallible → all prerequisite edges are **editable and
confidence-marked** (dashed = low confidence), never locked.

## 3. Recomposition: the lesson is a path, not a document

- **Study Path** (v1 of the lesson): a linear, prerequisite-ordered walk of
  the video's concepts in a rail tab — topological sort over
  REQUIRES/PROCEDURE_STEP edges, temporal order as fallback. NO visible
  node-graph editor (three sessions independently: concept-map UIs fail with
  consumers; the graph stays behind the scenes).
- **Generation slots:** each non-trivial step carries one slot (predict /
  explain / compare / boundary-test; domain lenses add source-question /
  notation-map / execute-step) presented as chunk-level inline cards at their
  media cue — never a wall-of-text doc.
- **The compile artifact is co-authored:** learner synthesis paragraph on top
  ("Explain in your own words" — Feynman rebranded per evidence honesty),
  then their notes/captures, then attested concepts with their slot answers,
  then AI material clearly labeled as reference. Intentional blanks render
  where the learner skipped generation — visible unfinishedness is the nudge.
- **Contribution model:** answers attach to nodes; learners can promote a note
  to a node, edit concept bodies (user layer over immutable extraction), and
  their synthesis + concept rationales travel with shared bundles — the
  bundle carries *why this person organized it this way*, which is the actual
  apprenticeship payload.

## 4. Cognitive-load laws (study loop)

- **State-aware surfaces:** playing = video + CC only (transcript/notes fade);
  paused = full study surface. The pause is the study moment (segmenting).
- **Ticker demotion:** concept cards never slide over the video during
  playback; concepts signal as chips/markers at the progress bar and light up
  the rail. Full card on demand.
- **Signaling over decoration:** marker color/shape may encode unit type
  (pearl/definition/boundary) with at most a one-line legend; test before
  keeping.
- Two redundant text streams (CC + transcript) never show simultaneously.

## 5. Retention laws

- Cards derive only from attested/learner-generated material; weak bubbles are
  LLM-transformed into cloze/why-questions (user note becomes the hint, quote
  becomes the cloze source) — never shipped as vague "what was your note?"
  when a better form exists.
- **Lapse-to-context pipeline:** fail ×2 in-session → inline 10s clip; fail ×3
  → "Open in player" seeds the exact timestamp and pauses the queue.
- **Implicit interleaving** across projects/subjects stays default (desirable
  difficulty; zero UI).
- **Gamification boundary:** no XP, no leaderboards, no volume rewards.
  Streak demoted from headline to footnote; the celebrated number is
  **concepts locked in** (cards graduated past the 30-day interval), which
  rewards mastery, not appearances.

## 6. Discovery: learning-weighted, never engagement-shaped

YouTube's related list is one cheap signal, not the ranking (owner directive:
"easy scalp"). **Concept Continuity score** for a candidate next video:

`score = w_r·related + w_c·conceptSearch + w_t·teacherValidation + w_g·gapFill`

- `related`: appears in YouTube's related list (baseline, low weight)
- `conceptSearch`: ranks in Innertube searches for the video's extracted
  next-concepts (the engine queries what the learner should learn next)
- `teacherValidation`: channel recurs across ≥k independent concept-query
  results for the subject — outside validation of a great teacher that
  watch-time can't fake; per-channel score cached
- `gapFill`: covers concepts marked "don't get it yet" / missing prerequisites
  in the learner's graph (strongest weight once the graph exists)

Weights start hand-tuned (0.15/0.30/0.30/0.25), tunable in config; every
recommendation displays *why* ("teaches ⟨concept⟩; this channel ranks for 4 of
your topics"). Search gains intent toggles (Overview / Deep dive /
Troubleshooting) that reshape the query. Post-compile screen offers "What's
next" from the same scorer at the moment of peak momentum.

## 7. Attention, not importance (heatmap semantics)

Aggregated marks measure *attention*; peaks may be confusion, not value, and
crowd signal washes out expert signal. Therefore: rename the strip "Attention";
render user layer and overlay layer separately (smooth within, never across);
peaks are click-to-inspect (popover lists the marks composing them with author
and text). Expert (followed-handle) pins are never averaged into the crowd
curve.

## 8. Honest claims (ship these words, not more)

StudyLoop turns passive watching into active recall, spaced review, and
structured self-explanation — practices with strong evidence for retention and
near transfer. AI output is a starting point for the learner's own thinking,
attested by them before it enters their review queue. For performance domains
(music, BJJ), StudyLoop supports observation, decomposition, and mental
rehearsal; real transfer requires physical practice and coaching. Never claim:
optimal AI learning paths, mastery from one lesson, or skill transfer from
watching.

## 9. Standing anti-features (three+ sessions concur)
- No visible knowledge-graph/concept-map editor UI.
- No exposed SRS mechanics, decks, ease factors, XP, leaderboards.
- No YouTube engagement algorithm owning any "next" surface.
- No auto-complete flashcards untouched by the learner.
- No mandatory friction: every generation prompt is skippable; the app nudges
  with visible blanks, never blocks.
