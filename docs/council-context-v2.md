# StudyLoop v2 — Council Grounding Context (2026-07-28)

StudyLoop is a local-first web app for deep study of long-form video (local files
or YouTube), UI deliberately modeled on YouTube's watch page so mainstream users
have zero learning curve. First corpus: BJJ instructionals; the mission is
domain-agnostic — biology lectures, history documentaries, music theory
tutorials, anything on YouTube. The owner's framing: "these are solved applied
learning and educational problems — help the user discover, parse, and
synthesize into a coherent lesson they understand and can CONTRIBUTE to."

## Current feature inventory (v2, shipped and working)

**Discover/Navigate:** Home grid (real thumbnails, humanized titles, series
grouping); top-bar search returning library + YouTube results together; Up-next
rail (YouTube's own related-videos suggestions); YouTube URL paste-to-study.

**Study loop:** Player with hover chrome; synced transcript (click-to-seek,
search, auto-scroll); CC-style subtitle overlay; A-B loop; speed control; full
hotkeys. Capture: N = notation (pauses, modal with auto frame-grab + transcript
quote + active-concept chip, resumes on save); S = silent screenshot; long-form
notes pane with clickable timestamp tokens; bubbles rail (time-anchored notes,
click-to-revisit).

**Concepts:** attach any markdown "concept doc" (two parser profiles: a
timestamp-cited curriculum format, and generic headings); concept cards slide in
over the video at their cited moments (dismissable, mutable); rail shows the
full list with covered-checkmarks driven by furthest-watched position.

**Analysis engine ("Analyze"):** chunks the transcript (~8min windows), LLM
extracts per-chunk then merges: PEARLS (timestamped key insights, importance
1-3, diamond markers on the timeline), CONCEPTS (title/summary/body/anchors),
THEMES (unanchored overarching ideas). Domain-agnostic prompt today — same
prompt for BJJ as for biology. Renders in the rail under "AI breakdown".

**Heatmap:** timeline density strip (YouTube "most replayed" style) computed
from the user's bubbles + pearls (+ imported overlays), gaussian smoothed.

**Compile:** one button → markdown study document: long notes (timestamps as
links) → chronological captures with inline screenshots → covered concepts →
pearls → concept breakdown. Caption-pass prompts to caption uncaptioned shots.

**Share/Overlays:** export a self-contained .studyloop.json analysis bundle
(notes, bubbles w/ thumbnails, pearls, concepts — never video bytes; authored
under a share handle); import someone else's bundle as a color-coded overlay
layer (their pins on your timeline, their sections in your rail) and their
signal merges into the heatmap. Local-first foundation for a future community
aggregation service (the bundle IS the wire format).

**Review mode (SRS):** cards derived from the user's bubbles (front: screenshot
+ "what was your note here?"; back: note + 10s clip loop of the source video)
and analysis pearls (front: label; back: insight). Hidden SM-2-lite ladder
(1/3/7/14/30/60 days), Again/Got-it only, 20 new cards/day, streaks. No decks,
no ease factors, no scheduling UI — deliberately invisible mechanics.

## Learning-science frames already applied (react to these, extend them)
- Retention over capture (prior council session): the tool must not become a
  "digital filing cabinet users never open again."
- Active recall + spaced repetition = strongest evidence (hence Review mode).
- SRS mechanics hidden (exposed Anki-style mechanics kill adoption).
- Frame as memory/parsing aid; motor/skill transfer claims stay modest.

## Frames the owner wants dug into now (name-check and go deeper)
Cognitive load theory (intrinsic/extraneous/germane; the transcript+video+
ticker+rail is a split-attention risk); Bloom's revised taxonomy (current app
lives at remember/understand — where are apply/analyze/evaluate/create?);
concept mapping & knowledge structures (Novak); threshold concepts (Meyer/Land);
elaborative interrogation & self-explanation; interleaving vs blocking;
desirable difficulties (Bjork); generation effect (the app auto-generates
concepts — does that steal the user's generative work?); segmenting & signaling
(Mayer's multimedia principles); domain epistemologies: biology = mechanisms/
systems/levels-of-organization; history = sourcing/corroboration/contextualization
(Wineburg's historical thinking) + causation chains; music theory = schema
learning, notation↔sound mapping, progressive ear training; math/physics =
worked examples → faded scaffolding. "Decompose and recompose": what is the
unit of knowledge per domain, how does the engine detect the domain, and what
does a re-composed "coherent lesson" artifact look like so the learner can
understand it AND contribute back to it?

## Review lens (apply to EVERY feature you discuss)
For each feature: (1) MECHANICS — what it actually does, what it could do;
(2) ASSUMPTIONS — what it silently assumes about the learner/content, and where
those break (e.g., assumes transcript quality, assumes note-taking skill,
assumes one video = one lesson); (3) PRESENTATION — is the information shown at
the right moment, place, and grain size; (4) INTUITIVENESS — can a first-time
learner exploit it without instruction; what would they never discover?

Be concrete: every recommendation should name the UI change, data-model change,
or prompt-design change that implements it. Rank P0/P1/P2 by learning leverage
per unit of build effort.
