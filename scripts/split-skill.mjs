#!/usr/bin/env node
/**
 * split-skill.mjs — move depth out of a SKILL.md into references/.
 *
 * Splitting by hand across a whole suite is slow and inconsistent, and the
 * inconsistency is what hurts: a reader who learns one skill's layout should
 * be able to predict the next one's. This applies the same transformation
 * everywhere from a declarative config.
 *
 *   node scripts/split-skill.mjs            # apply every configured split
 *   node scripts/split-skill.mjs <skill>    # just one
 *   node scripts/split-skill.mjs --dry-run
 *
 * Config lives in scripts/split-config.json:
 *   { "<skill>": { "<reference-file>.md": { "title": "...", "sections": ["## A", "## B"] } } }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(ROOT, 'skills');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'split-config.json'), 'utf8'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.find((a) => !a.startsWith('--'));

/**
 * Split a markdown body into [preamble, ...sections] keyed by their `## ` heading.
 *
 * Fenced code blocks are tracked, because skills legitimately contain markdown
 * templates whose sample output includes `## ` lines. Treating those as real
 * headings tears the template apart and silently corrupts the file.
 */
function parseSections(body) {
  const lines = body.split('\n');
  const out = [];
  let current = { heading: null, lines: [] };
  let fence = null;
  for (const line of lines) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      if (fence && line.trim().startsWith(fence)) fence = null;
      else if (!fence) fence = fenceMatch[1];
    }
    if (!fence && /^## /.test(line)) {
      out.push(current);
      current = { heading: line.trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  out.push(current);
  return out;
}

function splitSkill(name) {
  const cfg = CONFIG[name];
  if (!cfg) return null;

  const file = path.join(SKILLS, name, 'SKILL.md');
  const src = fs.readFileSync(file, 'utf8');
  const fmMatch = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(src);
  const frontmatter = fmMatch[0];
  const body = src.slice(frontmatter.length);

  const sections = parseSections(body);
  const wanted = new Map();          // heading -> reference filename
  for (const [refFile, spec] of Object.entries(cfg)) {
    // An entry with no `sections` moves nothing; it exists so a reference that
    // already shipped still appears in the routing table. Without this the
    // split can orphan a file that was previously linked from a moved section.
    for (const h of spec.sections || []) wanted.set(h, refFile);
  }

  // Verify every configured heading actually exists — a typo would silently
  // produce an empty reference file, which is worse than not splitting.
  const present = new Set(sections.map((s) => s.heading).filter(Boolean));
  const missing = [...wanted.keys()].filter((h) => !present.has(h));
  if (missing.length) {
    console.error(`  ! ${name}: headings not found: ${missing.join(' | ')}`);
    return null;
  }

  const kept = [];
  const moved = new Map();           // refFile -> [section, ...]
  for (const s of sections) {
    const target = s.heading ? wanted.get(s.heading) : undefined;
    if (target) {
      if (!moved.has(target)) moved.set(target, []);
      moved.get(target).push(s);
    } else {
      kept.push(s);
    }
  }

  // Build the reference files.
  const refDir = path.join(SKILLS, name, 'references');
  const written = [];
  for (const [refFile, secs] of moved) {
    const spec = cfg[refFile];
    const parts = [`# ${spec.title}`, ''];
    if (spec.intro) parts.push(spec.intro, '');
    if (secs.length > 2) {
      parts.push('## Contents', '');
      for (const s of secs) {
        const t = s.heading.replace(/^## /, '');
        const anchor = t.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
        parts.push(`- [${t}](#${anchor})`);
      }
      parts.push('');
    }
    for (const s of secs) parts.push(s.lines.join('\n').trim(), '');
    const content = parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    written.push({ refFile, content, bytes: Buffer.byteLength(content) });
  }

  // Rebuild SKILL.md with a routing table appended.
  const routing = ['## Reference files', '',
    'The depth lives alongside this file. Read the one that matches the task rather than all of them:', '',
    '| File | Covers |', '|---|---|'];
  for (const [refFile, spec] of Object.entries(cfg)) {
    routing.push(`| [\`references/${refFile}\`](references/${refFile}) | ${spec.covers} |`);
  }

  let newBody = kept.map((s) => s.lines.join('\n').trim()).filter(Boolean).join('\n\n');
  newBody = newBody.replace(/\n{3,}/g, '\n\n').trimEnd();
  const newSrc = `${frontmatter}\n${newBody}\n\n${routing.join('\n')}\n`;

  const before = Buffer.byteLength(src);
  const after = Buffer.byteLength(newSrc);

  if (!dryRun) {
    fs.mkdirSync(refDir, { recursive: true });
    for (const w of written) fs.writeFileSync(path.join(refDir, w.refFile), w.content);
    fs.writeFileSync(file, newSrc);
  }

  return { name, before, after, refs: written };
}

const names = Object.keys(CONFIG).filter((n) => !only || n === only);
if (!names.length) {
  console.error(`error: no split configured for "${only}"`);
  process.exit(2);
}

console.log(dryRun ? 'DRY RUN\n' : '');
for (const n of names) {
  const r = splitSkill(n);
  if (!r) continue;
  console.log(`${r.name.padEnd(24)} ${(r.before / 1024).toFixed(1)}KB -> ${(r.after / 1024).toFixed(1)}KB`);
  for (const w of r.refs) console.log(`    references/${w.refFile.padEnd(26)} ${(w.bytes / 1024).toFixed(1)}KB`);
}
