# Contributing

## The one rule

**Every claim in a skill must be checkable against real code.** Not against documentation, not against what everyone knows — against a file someone can open. Where a skill states a number, the command that produced it should be in the repository or in the commit message.

This is the rule the whole suite is built on, and it is why the skills say things like "17 of the 32 overrides contain no `do_action()`" instead of "keep your overrides up to date".

## Authoring standard

Run the validator before opening a PR. It fails the build on errors:

```bash
node scripts/validate-skills.mjs           # everything
node scripts/validate-skills.mjs wp-standards
```

### Frontmatter

```yaml
---
name: wp-thing            # must equal the directory name
description: What it covers — specifics, not categories. Use this whenever <situations>.
---
```

`name` and `description` are the only fields. Version, author and date belong in git, not in a file that will go stale.

The description is the **only** thing that decides whether a skill fires, and it is in context for every session. Two halves, both required:

1. **What it covers**, in concrete terms — name the functions, files and APIs a user might mention.
2. **When to use it**, as situations. The validator rejects a description with no trigger clause, because a description that only describes never fires.

180–700 characters. Below 180 there is not enough surface to match against; above 700 it is costing context in every session for diminishing returns.

### Size and progressive disclosure

| Limit | Value | Why |
|---|---|---|
| `SKILL.md` | **10 KB** | The body is injected in full on every trigger. Past 10 KB, most of what lands in context is irrelevant to the task in hand. |
| `references/*.md` | 40 KB soft | Read on demand, so they can be long — but past this, split by topic. |

When a skill outgrows 10 KB, move depth into `references/` and leave a routing table. `scripts/split-skill.mjs` does this from a declarative config so every skill ends up laid out the same way:

```bash
node scripts/split-skill.mjs --dry-run
node scripts/split-skill.mjs wp-woocommerce
```

What stays in `SKILL.md`: the mental model, the decisions, the workflow, and the routing table. What goes to `references/`: recipes, tables, long examples, and anything only needed once you have already decided what to do.

Every reference must be linked from `SKILL.md` — the validator treats an orphan as an error, because a reference nobody can find is dead weight.

### Scripts

- Node 18+, **zero dependencies**, `.mjs`.
- CLI-first, with `--format text|json|md` where output might be consumed.
- Exit 1 on findings so they work in CI.
- Mentioned by name in the skill's `SKILL.md`, or the validator flags them — an undocumented script never gets run.

Python was tried and abandoned: it is not installed on every machine that needs these, and a tool that cannot run is worse than no tool.

### Voice

Explain **why**, then what. A reader who understands the reason handles the case you did not anticipate; a reader given a rule does not.

Avoid capitalised MUST and NEVER. If a rule feels like it needs shouting, the reasoning behind it is probably missing. There are a few genuine absolutes — `permission_callback` is required, `prepare()` needs placeholders — and they read as absolute without the formatting.

Prefer one worked example to three sketches.

## Adding a scanner rule

A rule without a fixture does not ship. Before adding one to `wp-scan.mjs`:

1. Find a real occurrence in actual shipped code.
2. Confirm the rule fires on it, and record file and line in the commit message.
3. Confirm it does **not** fire across the rest of the corpus, or explain the false positives.

Severity means exploitability, not how bad the code looks. An admin-only issue is not Critical however large the impact would be.

## What we borrowed, and what we did not

The standard above was shaped by reading five community skill repositories — [ComposioHQ](https://github.com/ComposioHQ/awesome-claude-skills), [travisvn](https://github.com/travisvn/awesome-claude-skills), [alirezarezvani](https://github.com/alirezarezvani/claude-skills), [Jeffallan](https://github.com/Jeffallan/claude-skills) and [rampstackco](https://github.com/rampstackco/claude-skills).

Adopted, because they hold up:

- A hard size cap on `SKILL.md` with depth pushed into `references/`. Every mature repo converges on this, and measuring our own suite against it found 12 of 16 skills over.
- A validator that fails CI, so the standard is enforced rather than aspirational.
- Trigger-oriented descriptions.
- Dependency-free scripts.

Deliberately not adopted:

- **Persona preambles** ("You are an expert in X"). The model does not need to be told it is an expert to behave like one, and the line costs context in every trigger.
- **`version` / `author` / `updated` frontmatter.** Git already knows, and hand-maintained dates go stale within two releases.
- **Confidence emoji tagging.** Useful in a report; noise in a reference document.
- **A fixed section order across all skills.** An audit skill and a scaffolding skill have genuinely different shapes, and forcing one outline on both produces filler headings.

If you disagree with any of these, argue it in an issue with an example — the list is a judgment call, not a principle.

## Corpus

Skills are validated against real WordPress packages. The corpus has grown in
three passes, and each figure quoted in a skill refers to the pass that produced
it rather than to some running total:

| Pass | What was measured | Files |
|---|---|---|
| 1 | Bizix 2.2.3, Stratego 1.4.0, TM Moody 2.6.1 — theme code only | ~717 |
| 2 | The plugins those themes bundle: Gyan Elements, Insight Core, Envato Market, Slider Revolution, WPBakery | ~1,100 |
| 3 | Professionally maintained plugins: Wordfence 9.0.0, Duplicator Pro 4.6.9, WP Staging Pro 6.9.2, Ultimate Store Kit Pro 2.7.2 — first-party code, vendored dependencies excluded | 2,869 |
| 4 | Block plugins and SEO plugins: Essential Blocks Pro, GutenKit Pro, Advanced Gutenberg Pro, Elementor Pro, Yoast Premium, AIOSEO Pro | ~1,900 |

**These packages are not in the repository and cannot be.** They are paid
commercial products under licences that forbid redistribution. That is a real
limit on the founding rule, and it is better stated than glossed: a contributor
cannot re-run the measurements without buying the same packages.

What that means in practice for the rule *every claim must be checkable*:

- A skill quoting a number must name the package **and version** it came from,
  so anyone holding that package can verify it — several already do
  (`Wordfence 9.0.0`, `TM Moody 2.6.1`).
- The **command** must be in the skill or the commit message, so the method is
  reproducible even when the corpus is not.
- A scanner rule needs a **fixture in the repository** — `wp-scan.mjs` ships one
  in CI, and that fixture is redistributable because it is code written here.

Where a claim cannot meet any of those three, it should be softened to what it
is: an observation, not a measurement.

Known gaps, where the skills still rest on knowledge rather than measurement:
a genuine block/FSE theme (the three sold as "Gutenberg themes" that were
measured turned out to be classic themes styling core blocks), a WooCommerce
store using the block checkout rather than the shortcode one, and RTL beyond
generated stylesheets. Contributions that close these are the most valuable
ones available.
