#!/usr/bin/env node
/**
 * validate-skills.mjs — enforce this repository's authoring standard.
 *
 * The rules encoded here are the ones that actually affect how a skill
 * behaves in use: whether it triggers, how much context it costs when it
 * does, and whether a reader can find the deep material. Style preferences
 * are deliberately not enforced.
 *
 *   node scripts/validate-skills.mjs [skill-name] [--json]
 *
 * Exit 0 = clean, 1 = errors, 2 = bad invocation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(ROOT, 'skills');

const LIMITS = {
  // A skill's body is injected in full whenever it triggers. Past ~10KB the
  // majority of what gets injected is irrelevant to the task at hand, which is
  // exactly what references/ exists to avoid.
  skillBytes: 10 * 1024,
  // Descriptions are always in context, for every skill, in every session.
  descMin: 180,
  descMax: 700,
  refBytes: 40 * 1024,
};

const problems = [];
const add = (level, skill, rule, message) => problems.push({ level, skill, rule, message });

function parseFrontmatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return { fields, body: src.slice(m[0].length) };
}

function validateSkill(name) {
  const dir = path.join(SKILLS, name);
  const file = path.join(dir, 'SKILL.md');

  if (!fs.existsSync(file)) {
    add('error', name, 'missing-skill-md', 'no SKILL.md');
    return null;
  }
  const src = fs.readFileSync(file, 'utf8');
  const bytes = Buffer.byteLength(src, 'utf8');
  const fm = parseFrontmatter(src);

  if (!fm) {
    add('error', name, 'no-frontmatter', 'SKILL.md must open with a --- YAML block');
    return null;
  }

  // --- frontmatter -------------------------------------------------------
  if (!fm.fields.name) {
    add('error', name, 'no-name', 'frontmatter is missing name:');
  } else if (fm.fields.name !== name) {
    add('error', name, 'name-mismatch', `frontmatter name "${fm.fields.name}" != directory "${name}"`);
  }

  const desc = fm.fields.description || '';
  if (!desc) {
    add('error', name, 'no-description', 'frontmatter is missing description:');
  } else {
    if (desc.length < LIMITS.descMin) {
      add('error', name, 'description-thin',
        `description is ${desc.length} chars; under ${LIMITS.descMin} it rarely carries enough trigger context`);
    }
    if (desc.length > LIMITS.descMax) {
      add('warn', name, 'description-long', `description is ${desc.length} chars (soft max ${LIMITS.descMax})`);
    }
    // A description that only says what the skill *is* will not fire. It needs
    // the situations that should trigger it.
    if (!/\b(use this|use it|whenever|when the user|when you)\b/i.test(desc)) {
      add('error', name, 'description-no-trigger',
        'description says what the skill covers but never when to use it — add "Use this whenever …"');
    }
  }

  // --- size and progressive disclosure -----------------------------------
  const refDir = path.join(dir, 'references');
  const refs = fs.existsSync(refDir) ? fs.readdirSync(refDir).filter((f) => f.endsWith('.md')) : [];
  const sections = (fm.body.match(/^## /gm) || []).length;

  if (bytes > LIMITS.skillBytes) {
    add('error', name, 'skill-too-large',
      `SKILL.md is ${(bytes / 1024).toFixed(1)}KB (max ${LIMITS.skillBytes / 1024}KB) — move depth into references/`);
  }
  if (sections >= 9 && refs.length === 0) {
    add('warn', name, 'no-progressive-disclosure',
      `${sections} top-level sections and no references/ — consider splitting`);
  }

  // --- references are reachable ------------------------------------------
  for (const ref of refs) {
    const rp = path.join(refDir, ref);
    const rsrc = fs.readFileSync(rp, 'utf8');
    const rbytes = Buffer.byteLength(rsrc, 'utf8');
    if (rbytes > LIMITS.refBytes) {
      add('warn', name, 'reference-huge', `references/${ref} is ${(rbytes / 1024).toFixed(1)}KB`);
    }
    if (!fm.body.includes(`references/${ref}`)) {
      add('error', name, 'orphan-reference',
        `references/${ref} is never linked from SKILL.md — it will never be read`);
    }
    if (rsrc.split('\n').length > 300 && !/^#+ *(contents|table of contents)/im.test(rsrc)) {
      add('warn', name, 'reference-no-toc', `references/${ref} is long and has no Contents section`);
    }
  }

  // --- no duplicated sections --------------------------------------------
  //
  // A non-idempotent tooling pass appended a second routing table to three
  // skills in this suite, and in one of them the stray rows landed inside an
  // unrelated table. Nothing caught it: the file still parsed, still validated,
  // and still read plausibly. Duplicated content is injected into context on
  // every trigger, so it costs real tokens for no benefit.
  const headings = fm.body.match(/^## .+$/gm) || [];
  const seenHeading = new Set();
  for (const h of headings) {
    if (seenHeading.has(h)) {
      add('error', name, 'duplicate-section',
        `"${h.trim()}" appears more than once — a tooling pass probably ran twice`);
      break;
    }
    seenHeading.add(h);
  }

  // --- scripts are documented --------------------------------------------
  const scriptDir = path.join(dir, 'scripts');
  if (fs.existsSync(scriptDir)) {
    for (const s of fs.readdirSync(scriptDir)) {
      if (!fm.body.includes(s)) {
        add('error', name, 'undocumented-script',
          `scripts/${s} is never mentioned in SKILL.md — nobody will run it`);
      }
    }
  }

  // --- cross-references resolve ------------------------------------------
  const known = fs.readdirSync(SKILLS).filter((d) => fs.statSync(path.join(SKILLS, d)).isDirectory());
  const seen = new Set();
  for (const m of fm.body.matchAll(/`(wp-(?:theme|plugin|blocks|standards|security|performance|accessibility|design|i18n|release|project|child|woocommerce|deploy|maintain|seo)[a-z-]*)`/g)) {
    if (!known.includes(m[1]) && !seen.has(m[1])) {
      seen.add(m[1]);
      add('error', name, 'broken-cross-reference', `references unknown skill \`${m[1]}\``);
    }
  }

  return { name, bytes, sections, refs: refs.length };
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.find((a) => !a.startsWith('--'));

if (!fs.existsSync(SKILLS)) {
  console.error(`error: no skills/ directory at ${SKILLS}`);
  process.exit(2);
}

const names = fs.readdirSync(SKILLS)
  .filter((d) => fs.statSync(path.join(SKILLS, d)).isDirectory())
  .filter((d) => !only || d === only);

if (!names.length) {
  console.error(`error: no skill named "${only}"`);
  process.exit(2);
}

const stats = names.map(validateSkill).filter(Boolean);
const errors = problems.filter((p) => p.level === 'error');
const warns = problems.filter((p) => p.level === 'warn');

if (asJson) {
  console.log(JSON.stringify({ stats, problems }, null, 2));
} else {
  console.log(`${'skill'.padEnd(24)} ${'KB'.padStart(5)} ${'sec'.padStart(4)} ${'refs'.padStart(5)}`);
  for (const s of stats) {
    const flag = s.bytes > LIMITS.skillBytes ? '  <-- over' : '';
    console.log(`${s.name.padEnd(24)} ${(s.bytes / 1024).toFixed(1).padStart(5)} ${String(s.sections).padStart(4)} ${String(s.refs).padStart(5)}${flag}`);
  }
  console.log('');
  for (const p of [...errors, ...warns]) {
    console.log(`${p.level === 'error' ? 'ERROR' : ' warn'}  ${p.skill}  [${p.rule}]\n        ${p.message}`);
  }
  console.log(`\n${names.length} skills · ${errors.length} errors · ${warns.length} warnings`);
}

process.exit(errors.length ? 1 : 0);
