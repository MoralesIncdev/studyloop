## 1. Per-domain decomposition schemas

| Domain | Claim | Evidence grade | Rationale / caveats |
|---|---|---|---|
| **General principle** — experts organize knowledge by deep, causal/relational structures rather than surface features | **STRONG** | Widely replicated across domains (expert-novice studies, schema theory, cognitive task analysis). |
| **Biology** = “mechanism units” (causal chains, systems, levels of organization) | **STRONG** for mechanisms; **MODERATE** for “mechanism units” as the universal unit | Mechanistic reasoning and systems thinking are well-supported as core biology epistemologies. But not every biological topic cleanly decomposes into discrete mechanism units; many concepts span structure/function/evolution, and the “unit” grain is topic-dependent. |
| **History** = causation + sourcing units (Wineburg’s historical thinking) | **STRONG** for historical thinking heuristics; **MODERATE/WEAK** for auto-decomposing a video into causation+sourcing units | Sourcing, corroboration, and contextualization are robust, domain-specific. However, “sourcing” from a video usually requires evidence the video does not contain (author, document type, bias); and causation in history is contested, not a single correct graph. LLM-inferred causal chains are high-error. |
| **Music** = schema/notation↔sound units | **STRONG** for schema learning and notation-sound mapping; **WEAK** for deriving those units from transcript/video only | Music expertise relies on auditory schemas and symbolic-to-sound mapping. A transcript-only model cannot reliably parse harmonic/melodic/rhythmic schemas; it needs notation/MIDI/audio. |
| **Physical skills** = procedure / trigger / failure units | **MODERATE** for procedural decomposition; **WEAK** for claiming this produces skill transfer from video | Cognitive task analysis and deliberate practice support procedure–condition–action–error structures. But motor learning requires physical practice, feedback, and progressive refinement; observational learning from video alone has limited transfer to execution. |

**Review lens — domain decomposition**
- **Mechanics:** LLM classifies domain and extracts unit schema.  
- **Assumptions:** transcript/content reflects domain epistemology; one video = one lesson; domain label is correct.  
- **Presentation:** domain-specific units are shown in the rail.  
- **Intuitiveness:** users may not understand why the “unit” labels differ or that they are editable.  
- **Concrete change:** make domain a **user-confirmed/editable tag** (data model), not an auto-imposed schema; let the learner add/delete unit chips.

---

## 2. Recomposition artifact evidence

| Element | Retention | Transfer | Evidence notes / over-claims |
|---|---|---|---|
| **Prerequisite-ordered lesson** | MODERATE | MODERATE | Sequencing is supported, but *auto-inferred* prerequisite graphs are often wrong. Locking learners into a machine path can impose invalid dependencies. Over-claim: “AI orders the optimal learning path.” |
| **Guiding questions** | STRONG | MODERATE | Elaborative interrogation and deep questions have strong retention effects and improve comprehension. Transfer is weaker unless questions are varied and require application across contexts. |
| **Intentional blanks (cloze / generation)** | STRONG | MODERATE | Generation effect is robust for retention. Transfer is only moderate and contingent on blanks targeting core principles at the right difficulty. Over-claim: “blanks produce deep transfer.” |
| **Self-test items** | STRONG | MODERATE (near) / WEAK (far) | Retrieval practice is one of the strongest retention effects. Near transfer is supported; far transfer requires varied practice and feedback. **Critical:** self-testing without correct feedback can reinforce errors. |
| **Feynman synthesis paragraph** | MODERATE | MODERATE | Benefits come from self-explanation and elaboration, not from the “Feynman technique” as a branded method. **Over-claim:** the Feynman technique itself lacks the large RCT evidence base of retrieval practice or self-explanation. |

**Flagged over-claims**
- “The re-composed lesson guarantees understanding.”  
- “Generation prompts automatically produce transfer.”  
- “Watching + answering questions yields the same skill transfer as practice.”  
- “The Feynman paragraph is a proven deep-learning technique.”

**Review lens — recomposition artifact**
- **Mechanics:** generates a long-form markdown doc with all elements.  
- **Assumptions:** learners will read and engage with the doc; one artifact fits all.  
- **Presentation:** long documents compete with the video for attention → split-attention risk.  
- **Intuitiveness:** many users will never discover that the doc is interactive or editable.  
- **Concrete change:** break the artifact into **chunk-level inline prompts** (UI: small cards at segment boundaries) rather than one wall of text.

---

## 3. Auto-generated concept summaries: when answers help vs. harm

| Learner state | What to provide | Why |
|---|---|---|
| **Novice** in the topic | **Worked example / summary first** | Reduces extraneous cognitive load, gives an initial schema (strong evidence: Sweller, Renkl, Mayer). But should be concise, accurate, and ideally followed by a prompt to use it. |
| **Intermediate / developing** | **Faded worked example** → partial blanks | Scaffolding is withdrawn as skill grows. Supports generation while still constraining load. |
| **Advanced** in the topic | **Generation first, summary as feedback** | Pre-provided summaries become redundant and can reduce germane processing (expertise reversal: Kalyuga). Generation yields better retention and elaboration. |

**When providing the answer helps**
- After the learner has made a generation attempt — corrects misconceptions and reinforces accurate schema.  
- When the learner lacks prior knowledge and the summary acts as a concise worked example.  
- When the summary is used to **reduce**, not replace, cognitive effort on the right task.

**When providing the answer harms**
- Before any learner attempt: **steals the generation effect** and creates an illusion of fluency.  
- When the summary is **wrong**: AI hallucinations become powerful misconceptions.  
- When the learner is already knowledgeable: **expertise reversal** — redundant information increases load and reduces learning.  
- When the summary is too dense or always visible: causes split-attention and passive reading.

**Reconciliation rule**
> **Default to “generate first, then compare.”** Show a blank/prompt; keep the AI summary collapsed behind a **“Reveal model summary”** button. For users who signal low domain knowledge or ask for help, flip the order: show a short worked example first, then ask them to reconstruct it.

**Review lens — auto summaries**
- **Mechanics:** LLM writes concept summary immediately.  
- **Assumptions:** summary is correct and at the right level for the learner.  
- **Presentation:** usually shown too early; defaults to passive consumption.  
- **Intuitiveness:** users will read the answer instead of thinking.  
- **Concrete change:** prompt-design rule **“blank → reveal”**; data model stores user attempt before summary is fetched; UI: summary hidden behind a “Reveal” button disabled until input.

---

## 4. Honest-framing guidance and ranked design implications

### What the app can honestly claim
- “StudyLoop converts passive video watching into **active recall, spaced review, and structured note-taking**—practices with strong evidence for retention and near transfer.”  
- “It helps you **segment, organize, and self-explain** video content; you build understanding by generating explanations, not just storing clips.”  
- “AI summaries are **starting points for your own thinking**, not substitutes for practice, labs, problem-solving, or expert feedback.”  
- “For **skills and performance domains** (music, BJJ, crafts), StudyLoop supports observation and mental rehearsal; real transfer requires physical practice and coaching.”

### What it should not claim
- “AI decomposes any subject into the correct units.”  
- “One re-composed lesson produces mastery.”  
- “The Feynman technique guarantees deep learning.”  
- “Self-testing alone produces far transfer or real-world skill.”

---

### P0 / P1 / P2 design implications

| Priority | Implication | Why it matters | Concrete change |
|---|---|---|---|
| **P0** | **Make retrieval the default, not the doc** | Strongest evidence base; prevents the app from becoming a filing cabinet. | UI: every Pearl/Concept auto-generates a 1-tap self-test card; Review mode is surfaced as the primary “next step” after Analyze. |
| **P0** | **Gate summaries behind generation** | Protects generation effect; reconciles worked examples and generation. | Prompt design: “Before you see the summary, write your own definition/example.” Data model: store `user_attempt` before `summary_revealed`. UI: “Reveal summary” button. |
| **P0** | **Provide correct, explained feedback on every self-test** | Retrieval without feedback can reinforce errors. | Back-of-card shows answer + 1-sentence “why” + link to source clip. Prompt design: generate explanation alongside answer. |
| **P0** | **Make prerequisites editable, not locked** | Auto-inferred graphs are fallible. | Data model: `prerequisite_graph` with user-editable nodes/edges; UI: mini-graph view with “remove / reorder” controls. |
| **P1** | **Domain-aware prompt modules, not mandatory schemas** | Respects domain epistemologies without over-claiming universality. | Prompt templates per domain (biology mechanisms, history sourcing, music notation↔sound, skill procedure/condition/failure); UI: editable domain tags and extracted chips. |
| **P1** | **Chunk-level self-explanation nudges** | Moves from remember/understand toward apply/analyze while limiting load. | UI: at segment end, show one deep question + A-B loop option for skills; require short answer before continuing. |
| **P1** | **Confidence calibration + error flagging** | Combats illusion of fluency and AI hallucination. | UI: confidence slider before reveal; model flags low-certainty summaries; dashboard shows accuracy vs. confidence. |
| **P2** | **Feynman-style synthesis as reflective portfolio** | Self-explanation is useful, but the branded method is weakly validated. | Rename to “Explain in your own words”; prompt asks for **example** and **boundary case** to push near transfer. |
| **P2** | **Cross-domain “lesson” templates / prerequisite graph visualization** | Nice for power users; lower leverage than retrieval and generation. | UI: optional template picker; exportable lesson graph. |
| **P2** | **Community overlay comparison** | Social layering can aid sourcing/historical reasoning but only after own analysis. | Enable import of others’ overlays as a separate color layer; require user to generate own notes first. |

---

**Bottom line:** The strongest evidence supports retrieval practice, spaced repetition, and generation-first scaffolding. The decomposition/recomposition idea is plausible but not *solved*—domain schemas are real but variable, auto-inferred prerequisites are fallible, and no artifact replaces practice for skills. Build the “generate → reveal → test → review” loop as the default path, keep AI summaries as feedback, and let the learner remain the author of the lesson.
