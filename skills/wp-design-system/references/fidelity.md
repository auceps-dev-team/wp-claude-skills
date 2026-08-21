# Building to a supplied design

When a client hands over mockups, the job stops being *design* and becomes
*fidelity*. Different failure modes, and the dangerous one is silent: the build
passes every gate — PHP lint, security scan, contrast checks, block validation —
and still gets rejected on sight, because none of those look at whether the page
resembles the drawing.

Measured across three review rounds on one bespoke build, all three rejected.

## Contents

- [The drift catalogue](#the-drift-catalogue)
- [Extract the tokens, do not approximate them](#extract-the-tokens-do-not-approximate-them)
- [Self-host the specified fonts](#self-host-the-specified-fonts)
- [Casing and scale are design, not styling](#casing-and-scale-are-design-not-styling)
- [Animation that serves reading](#animation-that-serves-reading)
- [A rule that lives only in a media query has no default](#a-rule-that-lives-only-in-a-media-query-has-no-default)
- [A fidelity checklist worth running](#a-fidelity-checklist-worth-running)

## The drift catalogue

Every one of these was in the mockups, absent from the build, and invisible to
tooling. They are worth reading as a list of things to check *before* the client
does.

| Drift | What shipped | What the mockup specified |
|---|---|---|
| **Typography** | `system-ui` stack | A named pair, with weights |
| **Casing** | Sentence case headings | Uppercase, tracked `.05em` |
| **Heading scale** | ~40px section titles | `clamp(20px, 2vw, 26px)` |
| **Palette** | Approximated hexes | Exact values, four of five off |
| **Sections** | Two missing entirely | Present in every page mockup |
| **Card anatomy** | Title + excerpt | Eyebrow, title, excerpt, arrow link |
| **Header** | White, sentence case | Navy, uppercase, CTA + contact |

The pattern behind all seven: **left unspecified, an implementation reverts to
its framework's defaults**, and those defaults are generic by construction.
[awesome-claude-design](https://github.com/rohitg00/awesome-claude-design) calls
this "slop" and heads its list of fingerprints with exactly the failure above —
*overused font families (Inter, Roboto, Arial, system fonts)*. Their
counter-rules generalise well beyond the tool they were written for:

- Commit to the brand accent **before** the first generation, not after review.
- Specify the font stack with explicit weight and tracking, "not a vibe".
- Reserve a left rule for one semantic role; never as decoration.
- Cap container nesting at two levels.

## Extract the tokens, do not approximate them

A mockup delivered as HTML carries its values in the markup. Read them out
mechanically rather than eyeballing — a navy that is "close enough" reads as
wrong next to a logo built on the real one:

```bash
# Every colour the mockups actually use, by frequency.
grep -ohE '#[0-9A-Fa-f]{6}' *.dc.html | tr 'a-f' 'A-F' | sort | uniq -c | sort -rn

# The type ramp, as specified.
grep -ohE 'font-size:[^;"]+' *.dc.html | sort | uniq -c | sort -rn | head -20

# Section rhythm.
grep -ohE 'padding:clamp\([^)]+\)[^;"]*' *.dc.html | sort -u
```

Four of five palette entries were "close" and all four were wrong. The signature
yellow was `#F5C400` against a specified `#F0A81C` — a difference nobody can
name and everybody can see when the logo sits beside it.

Feed the extracted values into `theme.json` as the single source, then let the
stylesheet consume presets only. A hex typed into a component is how the drift
started.

## Self-host the specified fonts

Mockups usually link Google Fonts. Shipping that link into a WordPress theme
hands every visitor's IP to a third party and adds a render-blocking round trip.
Self-host instead — the file list is short and the win is immediate.

One measurement worth knowing before you commit the files: **many Google fonts
are variable, and the per-weight URLs point at the same file.** Requesting four
weights of Archivo across two subsets returned eight files and *two* distinct
payloads:

```bash
md5sum *.woff2 | awk '{print $1}' | sort -u | wc -l   # 10, from 16 downloads
```

Deduplicate, then declare the range once rather than four static faces:

```json
{
  "fontFamily": "Archivo, \"Helvetica Neue\", Arial, sans-serif",
  "slug": "heading",
  "fontFace": [{
    "fontFamily": "Archivo",
    "fontWeight": "500 800",
    "fontStyle": "normal",
    "fontDisplay": "swap",
    "src": ["file:./assets/fonts/archivo-variable-latin.woff2"]
  }]
}
```

Take `latin` **and** `latin-ext` for French: `œ` and several accented capitals
live in the extended subset, and their absence shows as a fallback glyph
mid-word.

## Casing and scale are design, not styling

The most-repeated element on the site was also the furthest from the mockup: the
section title. Specified at `clamp(20px, 2vw, 26px)`, uppercase, tracked, centred
over a 64×3px rule — shipped at roughly double the size in sentence case.

The lesson is that **`text-transform` and the type scale carry as much brand as
the palette does**. A design that uses small tracked capitals for section titles
looks nothing like the same design with large sentence-case ones, even with
identical colours and fonts.

Scope it, though. Uppercase is right for a section title on a landing page and
wrong for a subhead inside an article, where it costs reading speed:

```css
/* Landing sections only — never headings inside prose. */
.page .entry-content > h2 { text-transform: uppercase; letter-spacing: 0.05em; }
```

## Animation that serves reading

Three rules keep motion from becoming the next thing the client rejects:

1. **Nothing moves more than ~16px, nothing lasts more than ~600ms.** Past that
   the visitor is waiting for content instead of reading it.
2. **The final state is the default state.** Elements are visible without
   JavaScript; the script only *delays* them. Gate the hidden state on a class
   the script itself sets, so a script that never runs leaves a readable page
   rather than a blank one.
3. **`prefers-reduced-motion` disables everything.** Not a preference — for some
   visitors these movements cause nausea.

```css
/* Hidden only once the script has announced itself. */
html:not(.js) [data-reveal] { opacity: 1; transform: none; }

@media (prefers-reduced-motion: no-preference) {
	[data-reveal] { opacity: 0; transform: translateY(16px);
		transition: opacity .5s ease-out, transform .5s ease-out; }
	[data-reveal].is-revealed { opacity: 1; transform: none; }
}
```

Unobserve after the first reveal. A section that re-animates when the visitor
scrolls back up reads as a glitch, not an effect.

## A rule that lives only in a media query has no default

Introducing a variant that should appear at one breakpoint only is where
responsive work quietly breaks, and the failure is always the same shape.

Moving the header's call-to-action buttons into the navigation panel for small
screens, both halves of the change were written inside one query:

```css
@media (max-width: 860px) {
	.site-header__actions { display: none; }   /* cacher la barre */
	.site-nav__actions    { display: flex; }   /* montrer le panneau */
}
```

Correct below 860px. Above it, the first rule stops applying and the bar's
buttons come back — as intended — but the second rule stops applying too, and
`.site-nav__actions` falls back to *its own default*, which for a `div` is
visible. The desktop header rendered both sets side by side: two identical
calls to action and two WhatsApp buttons on one line. The client saw it before
I did.

The rule that prevents it: **write the default state outside the query first,
then let the query override it.**

```css
/* Le doublon n'existe que pour le mobile. */
.site-nav__actions { display: none; }

@media (max-width: 860px) {
	.site-header__inner > .site-header__actions { display: none; }
	.site-nav__actions { display: flex; }
}
```

The generalisation is worth holding onto: **a media query is an override, not a
scope.** Anything you only style inside one is unstyled everywhere else, and
"unstyled" is rarely "invisible" — it is whatever the element's initial value
happens to be.

Two related habits from the same fix:

- **Duplicate in markup, do not relocate with script.** The panel's copy of the
  actions is rendered server-side rather than moved by JavaScript on resize.
  Moving a node reorders the tab sequence and disappears entirely when the
  script fails.
- **Measure what you offset against.** The panel opened at a hard-coded
  `4.5rem`, which covered the bar on a taller header and left a gap on a
  shorter one. A custom property set from the header's measured height, kept
  current by a `ResizeObserver`, is a few lines and stops being wrong.

## A fidelity checklist worth running

Before showing a build to whoever supplied the mockups:

- [ ] Font families **named in the mockup** are loaded, not a fallback stack
- [ ] Every palette hex matches exactly — diff the extracted list against `theme.json`
- [ ] Section titles match on **size, casing and tracking**, not just wording
- [ ] Every section present in the mockup exists on the page, in order
- [ ] Card anatomy is complete: eyebrow, media, title, excerpt, action
- [ ] Header and footer match — they appear on every page and are seen most
- [ ] Screenshot the build beside the mockup at the same width and compare

That last line is the one that catches what the others miss, and it is the check
that was skipped for three rounds. Tooling verifies that the code is correct.
Only looking verifies that it is *right*.
