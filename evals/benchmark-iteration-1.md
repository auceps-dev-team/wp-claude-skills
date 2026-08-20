# Benchmark — iteration 1

**Date**: 2026-08-13 · **Model**: claude-opus-5 · **Runs**: 1 per configuration

Four evals, each run twice: once with the suite available, once with no skills
at all. The prompts are in `evals.json` and were written in French while the
skills are in English — deliberately, to test that the suite triggers in the
maintainer's actual working language.

## Summary

| Metric | With skills | Baseline | Delta |
|---|---|---|---|
| Assertions passed | **27 / 27** (100%) | 23 / 27 (85.1%) | +14.9 pts |
| Tokens | 400,348 | 393,691 | +1.7% |
| Wall time | 3,715s | 3,197s | +16.2% |

## Per eval

| Eval | With skills | Baseline |
|---|---|---|
| security-audit-bizix | 6 / 6 | 5 / 6 |
| analyze-moody-architecture | 7 / 7 | 7 / 7 |
| customizer-color-option | 7 / 7 | 6 / 7 |
| child-theme-strategy | 7 / 7 | 5 / 7 |

## Where the difference actually falls

The baselines are competent — this is not a comparison against incompetence.
The gap is in **verifiability and triage**, not raw knowledge:

- **security-audit**: the baseline names files but never with line numbers —
  zero `file:line` references against 25 for the skilled run. A client report
  whose findings cannot be checked. The skilled run also triaged its own
  scanner's two "critical" findings *down*, after confirming that
  `swm_ajax_entries` resolves to no function anywhere in the package.
- **child-theme**: the baseline kept `get_template_directory_uri()` for a child
  asset, which silently points at the parent.
- **customizer**: the baseline echoed a `<style>` block into `wp_head` instead
  of using `wp_add_inline_style()`.

## Honest limits of this run

- **One run per configuration.** The ± figures an aggregate script would print
  here would be meaningless, so they are omitted rather than fabricated. An
  earlier version of this file claimed three runs each; that was the
  aggregator's default text, not what happened.
- **`analyze-moody` did not discriminate** (7/7 both ways) and should be
  replaced in iteration 2 with something more demanding. Both runs did
  independently find the same real bug in that theme's `index.php`.
- **Two assertions were wrong and were rewritten mid-run**, with the reasoning
  recorded in `grade.mjs`. One demanded `get_stylesheet_directory_uri()` where
  the correct answer for that theme was to enqueue nothing at all, because the
  parent already loads the child stylesheet.
- **The eval corpus is not in this repository** — the themes are licensed
  commercial products. The prompts reference local paths and cannot be replayed
  elsewhere without the same packages. See CONTRIBUTING, *Corpus*.
