# Register: staying inside the reference

Rule 0 frees the hand on **technique**. It does not free it on **register**. The two rules look alike and say opposite things; confusing them is the most frequent failure of this method.

## Contents

- [Why a reference is not enough](#why-a-reference-is-not-enough)
- [The seven register invariants](#the-seven-register-invariants)
- [The six design requirements, read against the reference](#the-six-design-requirements-read-against-the-reference)
- [The phase 1 plan](#the-phase-1-plan)
- [The register gate](#the-register-gate)

## Why a reference is not enough

Without a reference, a model samples the statistical centre of its training data: neutral font, purple gradient, white background. That is the visible half of the problem.

**With a reference, a model drifts toward its own house.** Warm beige where the reference is cold white, a characterful serif where it has only a sans, an earthy accent where it has none, diagonals where it has only rectangles, left-aligned editorial titles where it centres everything. The result is often *prettier* than the statistical centre — which is exactly why it passes: it raises no alarm while working nor on review.

The client sees it in one second. They sent an image; they receive something else, with an explanation of why it is better.

**How this failure settles in.** The method's own design advice is text in context, and reads as an instruction. The reference is an image, and reads as data. When the two disagree, the text wins and the contradiction is never stated. Rule 0′ states the arbitration in advance so it does not have to be made in the moment.

## The seven register invariants

They are **read** off the reference and reproduced. They are not interpreted, not "translated" to the client's sector, and never count as a deliberate deviation.

| Invariant | What to read on the reference |
|---|---|
| 1 · Type class | Serif or sans? How many families? Italics or none? |
| 2 · Colour system | How many non-neutral colours? **"No accent" is a frequent answer, and it is a constraint, not a gap.** |
| 3 · Light background temperature | Cold white, grey, off-white, beige? |
| 4 · Page cut | Full-bleed bands edge to edge, or rounded inset blocks with margin around them? |
| 5 · Geometry | Corner radius. Presence or absence of rotation, diagonals, non-rectangular shapes. |
| 6 · Dominant alignment | Section titles centred or left? Symmetric or asymmetric grids? |
| 7 · Density and scale | Many small elements or few large ones? Body-to-heading ratio. |

Changing one of the seven delivers another site. If an invariant looks wrong, it is not the agent's call: **it is a question to the client, asked before coding** — "your reference has no accent colour; I suggest adding one, do you agree?" — and you wait for the answer.

A client may change an invariant on purpose. On the store build behind `store.md`, the client replaced the reference's navy with their own coral and green: that is recorded as "authorised by the client" with their words, and it is the only invariant that moved.

## The six design requirements, read against the reference

Advice that would push a page toward character — a dominant element, a colour that occupies ground, sections of unequal weight, depth, a working display face, a visible concept — is **not a drawing instruction when a reference exists. It is six questions put to the reference, and its answer is the instruction.**

| Requirement | What to look for on the screenshot | What to ask the reference first |
|---|---|---|
| One element dominates | You can name in one word what carries the page | Does it have a dominant element, or is it uniform? |
| The strong colour occupies ground | It covers real surface, not two thin bands | How many non-neutral colours? Zero is an answer. |
| Sections differ in weight | Two neighbouring sections never share the same template | Do its sections vary, or are they calibrated alike? |
| There is depth | At least one element leaves its container | How many real overflows does it have? |
| The display face works | It carries real content, not decoration | How many families, of which class? |
| The concept reads without a caption | It reads in scale and composition | Does it have a concept, or is it a sober template? |

These become instructions only when there is **no reference at all**.

Taking a reference means taking what gives it energy — depth, overlaps, central object, colour field — not only its section order. Copying the structure without those devices produces the reference's wireframe.

The symmetric failure costs more because it looks like work: **keeping the section order and replacing the whole surface with your own.** Same sequence of blocks, another type class, an accent it does not have, another background temperature. The skeleton holds, the skin is new, and the client recognises nothing.

## The phase 1 plan

Before writing code, announce in this order, under these headings:

1. **Reference survey** — the seven invariants, read on the image. Observation, no choices.
2. **Concrete subject** — business, audience, the page's single mission.
3. **Palette** — 4 to 6 named hex values, *sampled from the reference*.
4. **Typefaces** — the class comes from the survey; only the exact family is a choice, inside that class.
5. **What I add** — the exhaustive list of everything absent from the reference. An invariant appearing here is no longer an announcement but a question.

There is no quota of deviations. An earlier version asked for "two or three deliberate deviations, justified"; the agent always produced two or three, inventing them if needed, and a change of type class went through as easily as a removed section. The right length for "what I add" is often **zero**.

Two checkpoints pull in opposite directions:

- If the plan looks like what you would produce for any site in the sector, redo it.
- If "what I add" runs past two lines, or touches an invariant without asking, another site is being prepared. A plan that needs three paragraphs to justify its deviations already has too many.

## The register gate

None of the five acceptance gates measures resemblance to the reference. That is the hole in the method, and it is plugged in phase 2, before the mockup is shown.

**Reopen the reference image in the same message as the screenshot.** Both images, one under the other, looked at together. Never from memory: memory keeps section order and loses surface, and it is precisely from memory that you convince yourself you were faithful.

Then measure the mockup as it is, not as intended:

```js
const cs = e => getComputedStyle(e);
const headings = [...document.querySelectorAll('h1,h2,h3')];
const blocks = [...document.querySelectorAll('section,article,figure,aside')];
const hue = c => { const [r, g, b] = c.match(/\d+/g).map(Number);
  return Math.max(r, g, b) - Math.min(r, g, b) > 18 ? c : null; };   // non-neutral

({
  families:   [...new Set([cs(document.body).fontFamily, ...headings.map(t => cs(t).fontFamily)])],
  italics:    headings.filter(t => cs(t).fontStyle === 'italic').length,
  background: cs(document.body).backgroundColor,
  nonNeutral: [...new Set(blocks.flatMap(e => [cs(e).backgroundColor, cs(e).color]).map(hue).filter(Boolean))],
  radii:      [...new Set(blocks.map(e => cs(e).borderRadius))],
  rotations:  blocks.filter(e => cs(e).transform !== 'none' && !cs(e).transform.startsWith('matrix(1, 0, 0, 1')).length,
  centred:    headings.filter(t => cs(t).textAlign === 'center').length + ' / ' + headings.length,
  bodyVsH1:   cs(document.body).fontSize + ' · ' + (headings[0] && cs(headings[0]).fontSize),
})
```

Fill this table **before** writing to the client:

| Invariant | Reference | Mockup (measured) | Verdict |
|---|---|---|---|
| 1 · Type class | | | |
| 2 · Colour system | | | |
| 3 · Light background temperature | | | |
| 4 · Page cut | | | |
| 5 · Geometry | | | |
| 6 · Dominant alignment | | | |
| 7 · Density and scale | | | |

A verdict has two possible values: **conforms**, or **authorised by the client** with a quote of their agreement. "Close", "equivalent", "reinterpreted", "adapted to the sector" all mean non-conforming: fix the mockup, do not show it.

**Why a gate and not a principle.** The gates that hold in this method have a falsifiable criterion computed on the artefact: `core/html === 0`, `invalid.length === 0`, `±2 px`. The design side had none — only exhortations, judged by the agent that just produced the work, through the very taste that caused the drift. A table that has to be filled in publicly is much harder to skip than a principle that has to be remembered.

A pass that bumps an icon size or fixes a first name that does not match the photo is a *correctness pass*: necessary, and of no effect on design quality. It does not count as the design pass of phase 2.
