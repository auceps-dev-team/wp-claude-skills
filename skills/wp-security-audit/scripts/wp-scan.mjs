#!/usr/bin/env node
/**
 * wp-scan.mjs — static security scanner for WordPress themes and plugins.
 *
 * Targets the bug classes that `phpcs --standard=WordPress` does not catch:
 * unguarded AJAX endpoints, prepare() calls with no placeholders, REST routes
 * without a permission callback, unescaped stored values, and state-changing
 * handlers with no capability check.
 *
 * Zero dependencies. Node 18+.
 *
 *   node wp-scan.mjs <path> [--format text|json|md] [--min-severity low]
 *
 * Exit codes: 0 = clean, 1 = findings, 2 = bad invocation.
 */

import fs from 'node:fs';
import path from 'node:path';

const SEVERITY_ORDER = { critical: 3, high: 2, medium: 1, low: 0 };
// Mature plugins ship their Composer dependencies under a *prefixed* directory
// with rewritten namespaces (WPStaging\Vendor\Psr\Log, and similar) so two
// plugins loading different versions of the same library cannot collide. Those
// directories are third-party code under a non-standard name, so a scanner that
// only knows "vendor" ends up auditing Symfony instead of the plugin.
const SKIP_DIRS = new Set([
  'node_modules', 'vendor', '.git', '__pycache__', 'dist', 'build', '.svn',
  'vendor_prefixed', 'vendor-prefixed', 'vendor_wpstg', 'third-party',
  'freemius', 'vendor_freemius',
]);

// Third-party libraries bundled inside themes. Findings there are not
// actionable by the theme author, and reporting them buries the real ones.
const VENDORED = /(class-tgm-plugin-activation|tgmpa|kirki|aq[-_]?resizer|aqua-resizer|redux|cmb2|simple_html_dom|class-wp-bootstrap)/i;

// ---------------------------------------------------------------------------
// Source preprocessing
// ---------------------------------------------------------------------------

/**
 * Single pass that understands both strings and comments, returning two views
 * of the source with byte offsets preserved:
 *
 *   noComments — comments blanked, string contents kept. Rules that inspect
 *                what is concatenated into a string need this.
 *   code       — comments AND string contents blanked. Rules that hunt for
 *                dangerous calls need this, so that prose naming a function
 *                cannot match it.
 *
 * Handling both together is not a convenience. Scanning for comments without
 * tracking strings blanks the `//` inside any URL literal through to the end of
 * the line — taking the closing quote with it — and every subsequent string in
 * the file is then mis-parsed. That desynchronisation silently corrupts every
 * rule downstream, and it is invisible until you diff against a file you have
 * read by hand.
 */
function stripSource(src) {
  const n = src.length;
  let noComments = '';
  let code = '';
  let i = 0;

  const blank = (text) => text.replace(/[^\n]/g, ' ');

  while (i < n) {
    const c = src[i];
    const two = src.slice(i, i + 2);

    // Line comment
    if (two === '//' || c === '#') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      const b = blank(src.slice(i, j));
      noComments += b; code += b; i = j;
      continue;
    }
    // Block comment
    if (two === '/*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      const b = blank(src.slice(i, j));
      noComments += b; code += b; i = j;
      continue;
    }
    // Heredoc / nowdoc — treat the body as string content.
    const here = /^<<<\s*(['"]?)([A-Za-z_]\w*)\1\r?\n/.exec(src.slice(i, i + 80));
    if (here) {
      const label = here[2];
      const endRe = new RegExp(`^\\s*${label}\\b`, 'm');
      const rest = src.slice(i + here[0].length);
      const em = endRe.exec(rest);
      const j = em ? i + here[0].length + em.index + em[0].length : n;
      const chunk = src.slice(i, j);
      noComments += chunk;          // keep content: concatenation rules read it
      code += blank(chunk);
      i = j;
      continue;
    }
    // String literal
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === quote) { j += 1; break; }
        j += 1;
      }
      const chunk = src.slice(i, j);
      noComments += chunk;
      code += quote + blank(chunk.slice(1, -1)) + (chunk.length > 1 ? quote : '');
      i = j;
      continue;
    }
    noComments += c; code += c; i += 1;
  }

  // Guard the invariant the rest of the scanner depends on.
  if (noComments.length !== n || code.length !== n) {
    return { noComments: src, code: src, desynced: true };
  }
  return { noComments, code, desynced: false };
}


const lineOf = (src, pos) => src.slice(0, pos).split('\n').length;

function snippetAt(src, pos) {
  const start = src.lastIndexOf('\n', pos) + 1;
  let end = src.indexOf('\n', pos);
  if (end === -1) end = src.length;
  return src.slice(start, end).trim().slice(0, 200);
}

/** Return the substring of a balanced (...) group starting at or after `from`. */
function balanced(src, from, open = '(', close = ')') {
  const start = src.indexOf(open, from);
  if (start === -1) return '';
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return src.slice(start + 1);
}

function functionBody(src, name) {
  if (!name) return null;
  const re = new RegExp(`function\\s+${name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  return balanced(src, m.index + m[0].length - 1 + src.slice(m.index).indexOf('{'), '{', '}');
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const RE_NONCE = /check_ajax_referer|wp_verify_nonce|check_admin_referer/;
const RE_CAP = /current_user_can|user_can\s*\(|is_user_logged_in/;

const push = (out, severity, rule, file, line, message, snippet, fix) =>
  out.push({ severity, rule, file, line, message, snippet, fix });

/**
 * Respect `phpcs:ignore` / `phpcs:disable` annotations.
 *
 * A developer who wrote `// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
 * -- Static query with table names from Activator.` has already looked at this
 * line and left their reasoning. Re-reporting it says the tool did not read the
 * code, and it trains people to ignore the tool. Annotations are dropped by the
 * comment stripper, so this reads the raw source.
 */
function ignoredLines(raw) {
  const set = new Set();
  const lines = raw.split('\n');
  lines.forEach((line, idx) => {
    if (/phpcs:(ignore|disable)/i.test(line)) {
      set.add(idx + 1);                       // annotation on the same line
      if (/^\s*(\/\/|#|\/\*)/.test(line)) set.add(idx + 2);  // or on the line above
    }
  });
  return set;
}

function ruleAjax(file, src, out) {
  const re = /add_action\(\s*['"]wp_ajax_(nopriv_)?([\w-]+)['"]\s*,\s*(['"][\w\\]+['"]|array\s*\(\s*\$this\s*,\s*['"]\w+['"]\s*,?\s*\))/gs;

  // Collect registrations first. An action registered both with and without
  // nopriv is a single public endpoint: reporting it twice, and demanding a
  // capability check on the privileged half, would be wrong on both counts.
  const actions = new Map();
  let m;
  while ((m = re.exec(src)) !== null) {
    const nopriv = Boolean(m[1]);
    const action = m[2];
    const names = m[3].match(/['"]([\w\\]+)['"]/g) || [];
    const cb = names.length ? names[names.length - 1].replace(/['"]/g, '') : null;
    const prev = actions.get(action);
    if (prev) {
      prev.nopriv = prev.nopriv || nopriv;
      if (nopriv) prev.index = m.index;   // point at the public registration
    } else {
      actions.set(action, { action, nopriv, cb, index: m.index });
    }
  }

  for (const { action, nopriv, cb, index } of actions.values()) {
    // If the callback lives in another file, fall back to the whole file so we
    // do not cry wolf on code that clearly verifies somewhere.
    const body = functionBody(src, cb) ?? src;

    if (!RE_NONCE.test(body)) {
      push(out, nopriv ? 'critical' : 'high', 'ajax-no-nonce', file, lineOf(src, index),
        `AJAX action '${action}'${nopriv ? ' (public — registered with nopriv)' : ''} has no nonce verification in its callback.`,
        snippetAt(src, index),
        "Call check_ajax_referer( '<action>', 'nonce' ) as the first statement of the callback, and ship the nonce to JS via wp_localize_script().");
    }
    if (!nopriv && !RE_CAP.test(body)) {
      push(out, 'high', 'ajax-no-capability', file, lineOf(src, index),
        `Admin AJAX action '${action}' checks no capability. A nonce proves request origin, not permission — any logged-in subscriber can obtain one.`,
        snippetAt(src, index),
        "Add current_user_can( '<capability>' ) alongside the nonce check.");
    }
    if (nopriv && !/\bmin\s*\(|absint|intval|\blimit\b/i.test(body)) {
      push(out, 'low', 'ajax-nopriv-unbounded', file, lineOf(src, index),
        `Public AJAX action '${action}' shows no bounding of its input. Unauthenticated endpoints that run queries are a cheap denial-of-service lever.`,
        snippetAt(src, index),
        'Clamp paging and limit arguments with absint() and min(), and consider a transient-based rate limit.');
    }
  }
}

function ruleWpdbPrepare(file, src, out) {
  const re = /\$wpdb\s*->\s*prepare\s*\(/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const args = balanced(src, m.index + m[0].length - 1);

    // A generic query wrapper passes the SQL in a variable — `prepare( $query,
    // $args )` or `prepare( $query . ';', $args )` — so the placeholders live at
    // the call sites, not here. There is nothing to judge from this line.
    if (/^\s*\$\w+\s*(?:\.\s*[^,]*)?(?:,|$)/.test(args)) continue;

    // Placeholders assembled into a variable clause (query builders do this)
    // are equally invisible from here.
    if (!/%[sdfi]/.test(args) && /\{?\$\w+(Clause|Sql|Query|Values|Columns|Set|Where)\b/i.test(args)) continue;

    if (!/%[sdfi]|%\d+\$[sdfi]/.test(args)) {
      push(out, 'critical', 'prepare-no-placeholder', file, lineOf(src, m.index),
        '$wpdb->prepare() called with no %s/%d placeholder. The values are already concatenated into the SQL string, so prepare() provides no protection whatsoever. Since WP 6.2 this also raises _doing_it_wrong().',
        snippetAt(src, m.index),
        'Replace each concatenated value with a %s / %d placeholder and pass it as an additional prepare() argument.');
    } else if (/['"]\s*\.\s*\$\w+/.test(args)) {
      push(out, 'high', 'prepare-concatenated', file, lineOf(src, m.index),
        '$wpdb->prepare() mixes placeholders with direct string concatenation. The concatenated values bypass escaping.',
        snippetAt(src, m.index),
        'Pass every dynamic value as a prepare() argument rather than concatenating it into the query.');
    }
  }
}

// Identifiers cannot be bound as placeholders, so a query interpolating only
// these is doing the one thing prepare() cannot do for it.
//
// Name matching alone is unreliable — `$this->issuesTable` and `$t` are both
// table names. What is reliable is *position*: whatever follows FROM, JOIN,
// INTO, UPDATE or TABLE in SQL is an identifier by grammar, whatever it is
// called. Both tests are applied, position first.
const RE_IDENTIFIER_VAR = /^(?:\w*(?:table|tbl|prefix|schema|db|column|field|index|charset|collate)\w*|this)$/i;
const RE_IDENTIFIER_POSITION =
  /\b(?:FROM|JOIN|INTO|UPDATE|TABLE|EXISTS)\s+[`'"]?\{?\$(?:this\s*->\s*)?(\w+)/gi;

/** Variable names that sit in an identifier position within the SQL. */
function identifierPositionVars(sql) {
  const names = new Set();
  RE_IDENTIFIER_POSITION.lastIndex = 0;
  let m;
  while ((m = RE_IDENTIFIER_POSITION.exec(sql)) !== null) names.add(m[1]);
  // `FROM ' . $table . ' WHERE` — concatenated rather than interpolated.
  for (const c of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s*['"]?\s*\.\s*\$(?:this\s*->\s*)?(\w+)/gi)) {
    names.add(c[1]);
  }
  return names;
}

function ruleWpdbRaw(file, src, out) {
  // Match the call, then take its argument list by paren balancing. Scanning to
  // the next `;` overruns whenever the call sits inside a condition —
  // `if ( ! ( $x = $wpdb->get_results( ... ) ) ) {` has no semicolon after the
  // call — and the overrun then collects unrelated variables from the following
  // lines and reports them as interpolated SQL.
  const re = /\$wpdb\s*->\s*(query|get_results|get_row|get_var|get_col)\s*\(/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const args = balanced(src, m.index + m[0].length - 1);

    // prepare() reached indirectly still parameterises:
    //   call_user_func_array( array( $wpdb, 'prepare' ), $args )
    //   $wpdb->prepare( ... )
    if (/prepare\s*\(/.test(args) || /['"]prepare['"]/.test(args)) continue;

    const vars = [...args.matchAll(/\$(\w+)/g)].map((v) => v[1]).filter((v) => v !== 'wpdb');
    if (!vars.length) continue;

    // The overwhelmingly common shape is two statements:
    //     $query  = $wpdb->prepare( "... %s ...", $args );
    //     $result = $wpdb->query( $query );
    // Looking at the second line alone says "unprepared" about prepared SQL, so
    // check whether the variable was assigned from prepare() earlier in the file.
    // Only the *nearest* preceding assignment counts. Searching the whole file
    // for "$where = ... prepare" suppresses a genuine finding whenever some
    // unrelated earlier line happened to assign the same variable name from a
    // prepared query — which is common, because $query, $where and $sql are
    // reused constantly within one file.
    if (vars.length === 1) {
      const before = src.slice(0, m.index);
      const assignRe = new RegExp(`\\$${vars[0]}\\s*=[^=]`, 'g');
      let last = -1;
      let a;
      while ((a = assignRe.exec(before)) !== null) last = a.index;
      if (last !== -1) {
        const stmtEnd = before.indexOf(';', last);
        const assignment = before.slice(last, stmtEnd === -1 ? before.length : stmtEnd);
        if (/\$wpdb\s*->\s*prepare|['"]prepare['"]/.test(assignment)) continue;
      }
    }

    // Table and column names cannot be placeholders — `FROM {$table}` is the
    // correct way to write it, not a defect. Only report when something that is
    // not an identifier is being interpolated.
    const positional = identifierPositionVars(args);
    const nonIdentifier = vars.filter((v) => !RE_IDENTIFIER_VAR.test(v) && !positional.has(v));
    if (!nonIdentifier.length) {
      push(out, 'low', 'wpdb-identifier-interpolation', file, lineOf(src, m.index),
        `$wpdb->${m[1]}() interpolates ${vars.map((v) => '$' + v).join(', ')}, which look like identifiers rather than values. Identifiers cannot be placeholders, so this is usually correct — confirm the name is code-controlled and never request-derived.`,
        snippetAt(src, m.index),
        'If the identifier can come from user input, validate it against a known list, or use %i (WP 6.2+).');
      continue;
    }

    push(out, 'critical', 'wpdb-unprepared', file, lineOf(src, m.index),
      `Direct $wpdb->${m[1]}() interpolates ${nonIdentifier.map((v) => '$' + v).join(', ')} without prepare() — SQL injection if any part is request-derived.`,
      snippetAt(src, m.index),
      'Wrap the SQL in $wpdb->prepare() with %s/%d placeholders, or use WP_Query / get_posts() which parameterise for you.');
  }
}

const RE_SAFE = /esc_(html|attr|url|js|textarea|xml)|wp_kses|absint|intval|floatval|sanitize_|wp_json_encode|number_format/;

/**
 * True when every superglobal in the statement is being *tested* rather than
 * printed — inside isset()/empty(), or as an operand of a comparison.
 * `echo $id == $_GET['x'] ? admin_url() : other();` prints the branches, never
 * the request value, and reporting it as reflected XSS wastes the reader's
 * trust on the findings that are real.
 */
function superglobalsOnlyTested(stmt) {
  const stripped = stmt
    .replace(/\b(isset|empty|array_key_exists|in_array)\s*\([^)]*\)/g, ' ')
    .replace(/\$_(?:GET|POST|REQUEST|COOKIE|SERVER)\s*\[[^\]]*\]\s*(?:===|!==|==|!=|<=|>=|<|>)/g, ' ')
    .replace(/(?:===|!==|==|!=|<=|>=|<|>)\s*\$_(?:GET|POST|REQUEST|COOKIE|SERVER)\s*\[[^\]]*\]/g, ' ');
  return !/\$_(?:GET|POST|REQUEST|COOKIE|SERVER)\s*\[/.test(stripped);
}

function ruleSuperglobalEcho(file, src, out) {
  const re = /(?:echo|print)\s+[^;]{0,300}?\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const end = src.indexOf(';', m.index);
    const stmt = src.slice(m.index, end === -1 ? m.index + 300 : end);
    if (RE_SAFE.test(stmt)) continue;
    if (superglobalsOnlyTested(stmt)) continue;
    push(out, 'critical', 'xss-superglobal-echo', file, lineOf(src, m.index),
      `Superglobal $_${m[1]} printed without escaping — reflected XSS.`,
      snippetAt(src, m.index),
      'Sanitize on read with sanitize_text_field( wp_unslash( ... ) ) and escape on output with esc_html() / esc_attr() / esc_url().');
  }
}

function ruleInlineJs(file, src, out) {
  // Request data concatenated into an echoed string that is inside a <script>
  // block, e.g.  echo 'var x = "' . $_COOKIE['k'] . '";'
  const re = /echo\s+[^;]{0,200}?\$_(COOKIE|GET|POST|REQUEST)\s*\[[^;]{0,200};/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const stmt = m[0];
    if (RE_SAFE.test(stmt)) continue;
    // Heuristic: a JS assignment or a quote being opened.
    if (!/=\s*["'\\]|["']\s*\.\s*\$_|var\s+\w|window\./.test(stmt)) continue;
    push(out, 'critical', 'xss-inline-js', file, lineOf(src, m.index),
      `Request data ($_${m[1]}) concatenated into an inline script string. Cookie and query values are attacker-controllable and break out of a JS string trivially.`,
      snippetAt(src, m.index),
      'Pass the value with wp_localize_script() or wp_add_inline_script() using wp_json_encode(), which escapes correctly for a JS context.');
  }
}

/**
 * One-hop taint tracking: `$x = $_COOKIE['k'];` followed by an unescaped
 * `echo ... $x`. Direct `echo $_GET[...]` is caught elsewhere, but the
 * assign-then-print shape is far more common in real themes and reads as
 * harmless because the superglobal is out of sight by the time it is printed.
 */
function ruleTaintedVar(file, src, out) {
  const assign = /\$(\w+)\s*=\s*([^;]{0,200}?)\$_(GET|POST|REQUEST|COOKIE)\s*\[[^;]{0,120};/g;
  const tainted = new Map();
  let m;
  while ((m = assign.exec(src)) !== null) {
    if (RE_SAFE.test(m[0])) continue;          // sanitized at assignment
    if (!tainted.has(m[1])) tainted.set(m[1], { source: m[3], line: lineOf(src, m.index) });
  }
  if (!tainted.size) return;

  for (const [name, info] of tainted) {
    const echo = new RegExp(`(?:echo|print)\\s+[^;]{0,300}?\\$${name}\\b[^;]{0,200};`, 'g');
    let e;
    while ((e = echo.exec(src)) !== null) {
      if (RE_SAFE.test(e[0])) continue;
      const inJs = /=\s*["'\\]|var\s+\w+\s*=|window\.|<script/i.test(e[0]);
      push(out, 'critical', inJs ? 'xss-inline-js' : 'xss-tainted-echo', file, lineOf(src, e.index),
        `$${name} is assigned from $_${info.source} (line ${info.line}) without sanitizing, then printed without escaping${inJs ? ' into an inline script string' : ''}. Cookie and query values are fully attacker-controllable.`,
        snippetAt(src, e.index),
        inJs
          ? 'Pass the value to JS with wp_localize_script() or wp_add_inline_script() using wp_json_encode(), which escapes correctly for a JS context.'
          : 'Sanitize at the assignment with sanitize_text_field( wp_unslash( ... ) ) and escape at output with esc_html() / esc_attr().');
    }
  }
}

function ruleRest(file, src, out) {
  const re = /register_rest_route\s*\(/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const args = balanced(src, m.index + m[0].length - 1);
    if (!/permission_callback/.test(args)) {
      // The route args are frequently composed — `$baseRoute + array( ... )` or
      // array_merge( $shared, array( ... ) ) — which puts permission_callback
      // out of sight of this call. Report it as unverifiable rather than absent.
      if (/\$\w+\s*\+|array_merge\s*\(|\.\.\.\$\w+/.test(args)) {
        push(out, 'medium', 'rest-permission-unverifiable', file, lineOf(src, m.index),
          'register_rest_route() builds its arguments from a variable, so permission_callback cannot be confirmed from this call. Follow the composed array before drawing a conclusion.',
          snippetAt(src, m.index),
          'Check the merged array defines permission_callback; if it does, this is fine.');
        continue;
      }
      push(out, 'critical', 'rest-no-permission', file, lineOf(src, m.index),
        'register_rest_route() without permission_callback. Since WP 5.5 this is a doing_it_wrong and the route is effectively public.',
        snippetAt(src, m.index),
        "Add 'permission_callback' => fn() => current_user_can( '<cap>' ). Use '__return_true' only when the endpoint is deliberately public.");
    } else if (/permission_callback['"\s=>]+['"]__return_true['"]/.test(args)) {
      push(out, 'low', 'rest-public', file, lineOf(src, m.index),
        'REST route is deliberately public (__return_true). Confirm it exposes nothing sensitive and is not expensive to call in a loop.',
        snippetAt(src, m.index),
        'If the data is not genuinely public, replace with a capability check.');
    }
  }
}

function ruleSaveHandlers(file, src, out) {
  const re = /add_action\(\s*['"](save_post[\w_]*|edit_attachment|personal_options_update|profile_update|edited_[\w]+|created_[\w]+)['"]\s*,\s*(['"]\w+['"]|array\s*\(\s*\$this\s*,\s*['"]\w+['"]\s*\))/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const names = m[2].match(/['"](\w+)['"]/g) || [];
    const cb = names.length ? names[names.length - 1].replace(/['"]/g, '') : null;
    const body = functionBody(src, cb);
    if (!body) continue;
    const missing = [];
    if (!RE_NONCE.test(body)) missing.push('nonce verification');
    if (!RE_CAP.test(body)) missing.push('capability check');
    if (!missing.length) continue;
    push(out, 'high', 'save-handler-unguarded', file, lineOf(src, m.index),
      `Handler '${cb}' on '${m[1]}' is missing ${missing.join(' and ')}.`,
      snippetAt(src, m.index),
      "Guard with wp_verify_nonce() and current_user_can( 'edit_post', $post_id ). Note edit_posts (plural) is not sufficient — it lets a contributor write meta onto another author's post.");
  }
}

const DANGEROUS = [
  ['dangerous-eval', /\beval\s*\(/g, 'critical',
    'eval() executes arbitrary code.',
    'Remove it. There is no legitimate use of eval() in a theme or plugin.'],
  ['dangerous-base64-eval', /eval\s*\(\s*(base64_decode|gzinflate|str_rot13)/g, 'critical',
    'Obfuscated code execution — this is a standard backdoor signature.',
    'Treat the file as compromised. Verify the package origin before doing anything else.'],
  ['dangerous-create-function', /\bcreate_function\s*\(/g, 'critical',
    'create_function() is eval() in disguise and was removed in PHP 8.',
    'Use a closure.'],
  ['dangerous-assert', /\bassert\s*\(\s*['"]/g, 'critical',
    'assert() with a string argument evaluates code.',
    'Remove it.'],
  ['dangerous-extract', /\bextract\s*\(/g, 'high',
    'extract() creates local variables from array keys and can clobber locals when fed request data.',
    'Assign the values you need explicitly.'],
  ['dangerous-unserialize', /(?<!maybe_)\bunserialize\s*\(/g, 'high',
    'unserialize() on untrusted input enables PHP object injection.',
    'Use json_decode(), or maybe_unserialize() only on values you serialized yourself.'],
  ['dangerous-shell', /\b(shell_exec|passthru|proc_open|popen)\s*\(/g, 'high',
    'Shell execution from PHP — a strong privilege-escalation primitive where it is not disabled.',
    'Use WP_Filesystem or a PHP-native API instead.'],
];

function ruleDangerous(file, src, out) {
  for (const [rule, re, sev, msg, fix] of DANGEROUS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      push(out, sev, rule, file, lineOf(src, m.index), msg, snippetAt(src, m.index), fix);
    }
  }
}

function ruleRemoteFetch(file, src, out) {
  const re = /\b(file_get_contents|curl_init|curl_exec|fopen)\s*\(\s*[^)]*\$/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const snip = snippetAt(src, m.index);
    if (/wp_remote|wp_safe_remote/.test(snip)) continue;
    push(out, 'medium', 'raw-http-fetch', file, lineOf(src, m.index),
      `${m[1]}() with a dynamic path. If the path is request-derived this is SSRF or local file inclusion; it also bypasses the site's proxy, timeout and SSL configuration.`,
      snip,
      'Use wp_safe_remote_get() for HTTP and validate any local path against a whitelist.');
  }
}

function ruleUpload(file, src, out) {
  const re = /\bmove_uploaded_file\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    push(out, 'high', 'raw-file-upload', file, lineOf(src, m.index),
      'move_uploaded_file() bypasses WordPress upload handling — no MIME validation, no filename sanitizing, no attachment record.',
      snippetAt(src, m.index),
      'Use wp_handle_upload() or media_handle_upload(), which validate MIME against the allowed list and sanitize the filename.');
  }
}

function ruleUnescapedStored(file, src, out) {
  const re = /echo\s+(get_post_meta|get_option|get_theme_mod|get_user_meta|get_term_meta|get_query_var|get_comment_meta)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    push(out, 'medium', 'unescaped-stored-value', file, lineOf(src, m.index),
      `${m[1]}() printed without escaping. Stored values are never escaped for you, and an option or meta value is attacker-controllable wherever a lower-privileged user can write it.`,
      snippetAt(src, m.index),
      'Wrap in esc_html(), esc_attr() or esc_url() depending on the output context.');
  }
}

function ruleAbspath(file, src, raw, out) {
  const base = path.basename(file);
  if (base.startsWith('index.') || base === 'style.php') return;
  if (!raw.includes('<?php')) return;
  if (/defined\s*\(\s*['"]ABSPATH['"]\s*\)|ABSPATH.*exit|exit.*ABSPATH/.test(src)) return;
  if (!/\b(function|class)\s+\w/.test(src)) return;
  push(out, 'low', 'no-abspath-guard', file, 1,
    'File has no ABSPATH guard, so it executes if requested directly over HTTP.',
    '<?php',
    "Add at the top: if ( ! defined( 'ABSPATH' ) ) { exit; }");
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function* walk(root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) { yield root; return; }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.name.endsWith('.php')) {
      yield full;
    }
  }
}

function scanFile(file, root) {
  const rel = fs.statSync(root).isDirectory()
    ? path.relative(root, file).replace(/\\/g, '/')
    : path.basename(file);
  if (VENDORED.test(rel)) return [];

  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const { noComments: src, code } = stripSource(raw);
  const out = [];

  ruleAjax(rel, src, out);
  ruleWpdbPrepare(rel, src, out);
  ruleWpdbRaw(rel, src, out);
  ruleSuperglobalEcho(rel, src, out);
  ruleInlineJs(rel, src, out);
  ruleTaintedVar(rel, src, out);
  ruleRest(rel, src, out);
  ruleSaveHandlers(rel, src, out);
  ruleDangerous(rel, code, out);
  ruleRemoteFetch(rel, code, out);
  ruleUpload(rel, code, out);
  ruleUnescapedStored(rel, src, out);
  ruleAbspath(rel, src, raw, out);

  const ignored = ignoredLines(raw);
  return ignored.size ? out.filter((f) => !ignored.has(f.line)) : out;
}

function groupBySeverity(findings) {
  const g = { critical: [], high: [], medium: [], low: [] };
  for (const f of findings) g[f.severity].push(f);
  return g;
}

function renderText(findings, stats) {
  const g = groupBySeverity(findings);
  const L = [];
  L.push('='.repeat(72));
  L.push('WordPress security scan');
  L.push('='.repeat(72));
  L.push(`Files scanned: ${stats.files}    Findings: ${findings.length}`);
  L.push(`  critical ${g.critical.length}   high ${g.high.length}   medium ${g.medium.length}   low ${g.low.length}`);
  L.push('');
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    if (!g[sev].length) continue;
    L.push('-'.repeat(72));
    L.push(`${sev.toUpperCase()} (${g[sev].length})`);
    L.push('-'.repeat(72));
    for (const f of g[sev]) {
      L.push('');
      L.push(`[${f.rule}] ${f.file}:${f.line}`);
      L.push(`  ${f.message}`);
      if (f.snippet) L.push(`  > ${f.snippet}`);
      L.push(`  fix: ${f.fix}`);
    }
    L.push('');
  }
  return L.join('\n');
}

function renderMd(findings, stats) {
  const g = groupBySeverity(findings);
  const L = ['# WordPress security scan', '', '| Severity | Count |', '|---|---|'];
  for (const sev of ['critical', 'high', 'medium', 'low']) L.push(`| ${sev} | ${g[sev].length} |`);
  L.push('', `Files scanned: ${stats.files}`, '');
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    if (!g[sev].length) continue;
    L.push(`## ${sev[0].toUpperCase() + sev.slice(1)}`, '');
    for (const f of g[sev]) {
      L.push(`### \`${f.rule}\` — ${f.file}:${f.line}`, '', f.message, '');
      if (f.snippet) L.push('```php', f.snippet, '```', '');
      L.push(`**Fix:** ${f.fix}`, '');
    }
  }
  return L.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    console.log('usage: node wp-scan.mjs <path> [--format text|json|md] [--min-severity low|medium|high|critical]');
    return args.length ? 0 : 2;
  }
  const target = args[0];
  const fmt = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'text';
  const minSev = args.includes('--min-severity') ? args[args.indexOf('--min-severity') + 1] : 'low';

  if (!fs.existsSync(target)) {
    console.error(`error: path not found: ${target}`);
    return 2;
  }

  let findings = [];
  let files = 0;
  for (const php of walk(target)) {
    files += 1;
    findings = findings.concat(scanFile(php, target));
  }

  const threshold = SEVERITY_ORDER[minSev] ?? 0;
  findings = findings.filter((f) => SEVERITY_ORDER[f.severity] >= threshold);
  findings.sort((a, b) =>
    SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
    || a.file.localeCompare(b.file)
    || a.line - b.line);

  const stats = { files };
  if (fmt === 'json') console.log(JSON.stringify({ stats, findings }, null, 2));
  else if (fmt === 'md') console.log(renderMd(findings, stats));
  else console.log(renderText(findings, stats));

  return findings.length ? 1 : 0;
}

process.exit(main(process.argv));
