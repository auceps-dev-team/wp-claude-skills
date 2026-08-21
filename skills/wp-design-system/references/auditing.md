# Auditing an existing design system

Two audits, and confusing them is how a build passes review on paper and fails
it on screen. The first reads the code and asks whether a system exists. The
second looks at the page and asks whether it is any good.

## Contents

- [Auditing an existing theme](#auditing-an-existing-theme)
- [Auditing the rendered page](#auditing-the-rendered-page)
- [The seven dimensions](#the-seven-dimensions)
- [A hedged finding is not a weak finding, it is not a finding](#a-hedged-finding-is-not-a-weak-finding-it-is-not-a-finding)
- [Report format](#report-format)

## Auditing an existing theme

```bash
# Hard-coded colours outside the token definitions
rg -n "#[0-9a-fA-F]{3,8}\b" --glob '*.{css,scss}' | rg -v ":root|theme\.json|--[a-z]" | head -30

# Font sizes that bypass the scale
rg -n "font-size:\s*[0-9]" --glob '*.{css,scss}' | head -30

# Magic spacing values
rg -n "(margin|padding)[^:]*:\s*[0-9]+px" --glob '*.{css,scss}' | head -30
```

A large count on the first command is the clearest signal that the design system exists only on paper.

Two WordPress-specific additions worth running in the same pass:

```bash
# Preset colours referenced but never defined — the token was renamed and the
# stylesheet was not. These resolve to nothing, which reads as black or as the
# inherited colour, and no tool reports it.
node -e '
const fs=require("fs");
const t=JSON.parse(fs.readFileSync("theme.json","utf8"));
const known=new Set(t.settings.color.palette.map(c=>c.slug));
const css=fs.readFileSync("assets/css/main.css","utf8");
const used=new Set([...css.matchAll(/--wp--preset--color--([a-z-]+)/g)].map(m=>m[1]));
console.log([...used].filter(s=>!known.has(s)));'

# add_theme_support() calls that theme.json has already superseded
rg -n "add_theme_support\(\s*'(editor-color-palette|editor-font-sizes|align-wide|custom-line-height)'" --glob '*.php'
```

## Auditing the rendered page

The structure below is adapted from the `audit-live-site` prompt in
[awesome-claude-design](https://github.com/rohitg00/awesome-claude-design), whose
governing rule is the one that makes an audit worth reading:

> Don't recommend what you can't verify. Cite evidence.

In practice that means every finding carries a selector, a measured ratio, or a
screenshot coordinate. "The spacing feels cramped" is not a finding; "`.post-card`
gap is 16px where every other grid on the site uses 40px" is.

Take the screenshots first, at a fixed width, and audit from those rather than
from memory of the page.

## The seven dimensions

Score each 0–10. The value is not the number — it is that scoring forces you to
look at every dimension instead of the one that happened to annoy you.

| Dimension | What to look at |
|---|---|
| **Hierarchy** | Type scale, visual weight, the path the eye takes down the page |
| **Spacing** | Rhythm, breathing room, alignment against a grid |
| **Colour** | Palette coherence, contrast, whether each colour has one role |
| **Accessibility** | WCAG AA text contrast, visible focus, target sizes |
| **Slop patterns** | Generic type, purple gradients, uniform card grids, faux-glass, generic rounded buttons |
| **Motion** | Purposeful or decorative, and whether reduced-motion is honoured |
| **Copy** | Microcopy tone, whether the CTA says anything, error-state voice |

The slop row is the one most likely to be skipped and the one that most often
explains a client's "it doesn't look like us". Its WordPress dialect:

- The theme's fallback stack rendering because the named font never loaded.
- Every section a three-column grid, because that is what the columns block
  offers first.
- Core block defaults left untouched — the default button radius and the default
  gap are recognisable on sight.
- An accent rule on every card, so it means nothing anywhere.

## A hedged finding is not a weak finding, it is not a finding

Two audits of the same site were compared side by side: one written from the
page's fetched text, one from the rendered DOM. They agreed on structure —
heading hierarchy, skip link, concrete copy — and disagreed on eleven points.

Every disagreement fell the same way. **Six of the text-only audit's claims were
false, and all six were the ones it had hedged** with "probablement",
"inféré", "non vérifiable depuis le fetch":

| Hedged claim | What the DOM said |
|---|---|
| No logo in the header | Present, and visible in the client's own screenshot |
| Fonts falling back to system-ui | Both named faces active and self-hosted, zero Google Fonts links |
| Four-column grid, too dense for mobile | Columns measured 2, 2 and 3 — no four anywhere |
| `color-mix()` with no `@supports` fallback | The fallback was there |
| Accent used as a text colour everywhere | Zero elements used it as text |

The five unhedged claims were all true.

That is the rule the "cite evidence" principle above exists to enforce, stated
from the other side: an inference offered as a finding is worse than silence,
because it costs the reader a verification round and can send them to change
code that was already right. The accent claim is the sharpest example — it
concluded the exact opposite of the truth, and the reason it was false is that
the defect had already been fixed.

**If you cannot open the page, do not score it.** Audit the code instead and say
that is what you did — the theme audit above is a real deliverable on its own.
An audit that mixes measured findings with inferred ones teaches the reader to
distrust all of them, including the ones that were right.

One measurement that pays for itself here: a selector, a ratio, or a count
takes one console expression and converts a paragraph of hedging into a fact.

```js
// Le jaune sert-il vraiment de couleur de texte quelque part ?
//
// getComputedStyle rend « rgb(240, 168, 28) », le jeton vaut « #F0A81C » :
// les comparer tels quels donne toujours zéro, donc toujours « conforme ».
// On normalise les deux en triplets avant de comparer.
const hex = getComputedStyle(document.documentElement)
  .getPropertyValue('--wp--preset--color--signature').trim();

const toRgb = c => c.startsWith('#')
  ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).join()
  : (c.match(/d+/g) || []).slice(0, 3).join();

const accent = toRgb(hex);

[...document.querySelectorAll('*')]
  .filter(el => toRgb(getComputedStyle(el).color) === accent
             && el.textContent.trim())
  .length;
```

## Report format

Three parts, in this order:

**1. Summary table** — dimension, score, one-line verdict. Someone should be
able to read only this and know where the build stands.

**2. Findings, tiered P0 / P1 / P2** — each with the selector, the evidence, and
a concrete fix as a CSS snippet or a text revision. Tier on consequence, not on
how wrong it feels: a contrast failure is P0 because it excludes people; a
mismatched border radius is P2 however much it grates.

**3. Punch list** — the same findings reordered by impact ÷ effort, in the order
someone should actually work through them. This is the part a client acts on.

A worked example of the tiering, from a real review round:

| Tier | Finding | Why that tier |
|---|---|---|
| P0 | Named font never loaded; whole site on `system-ui` | Every page, and it is what "doesn't look like the design" means |
| P0 | Stat value set to navy, rendering navy-on-navy | Content invisible, not merely wrong |
| P1 | Section titles double their specified size, sentence case | Repeated on every page, but legible |
| P2 | Card gap 16px against a 40px rhythm | Visible only when compared side by side |

The discipline that matters: **audit against the design, not against taste.**
Where mockups exist they are the reference, and a finding that says "I would
have done this differently" belongs in a conversation, not in the report.
