#!/usr/bin/env node
/**
 * novamira.mjs — call a Novamira ability over HTTP, without registering an MCP server (phase 5).
 *
 *   WP_API_URL=https://site/wp-json/mcp/novamira WP_API_USERNAME=… WP_API_PASSWORD=… \
 *     node novamira.mjs <ability-name> '<json parameters>'
 *
 *   node novamira.mjs novamira/execute-php '{"code":"return get_option(\"blogname\");"}'
 *   node novamira.mjs novamira-mcp-adapter/discover-abilities '{}'
 *
 * Credentials come from environment variables only — they are in the site's
 * .mcpb bundle (unzip it, read manifest.json → server.mcp_config.env). Nothing is
 * written to Claude's configuration. The MCP session ID is cached in the OS temp
 * folder, keyed by site, and reopened automatically when it expires.
 *
 * The endpoint needs an Mcp-Session-Id header: initialize, read the ID from the
 * response headers, send notifications/initialized, then reuse it. Answers may
 * arrive as text/event-stream: the JSON is on the "data:" line.
 *
 * Node 18+. Exit 0 = ability answered, 1 = error from the site, 2 = bad invocation.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.log("usage: WP_API_URL=… WP_API_USERNAME=… WP_API_PASSWORD=… node novamira.mjs <ability> '<json>'");
  process.exit(args.length ? 0 : 2);
}

const { WP_API_URL: API, WP_API_USERNAME: USER, WP_API_PASSWORD: PASS } = process.env;
if (!API || !USER || !PASS) {
  console.error('error: set WP_API_URL, WP_API_USERNAME and WP_API_PASSWORD');
  process.exit(2);
}

const [ability, rawParams = '{}'] = args;
let params;
try { params = JSON.parse(rawParams); } catch { console.error('error: parameters are not valid JSON'); process.exit(2); }

const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const SID_FILE = path.join(os.tmpdir(), 'novamira-' + crypto.createHash('sha1').update(API + USER).digest('hex').slice(0, 12) + '.sid');

async function post(body, sid, timeoutMs) {
  const headers = { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (sid) headers['Mcp-Session-Id'] = sid;
  return fetch(API, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
}

async function openSession() {
  const r = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'wp-site-build', version: '1' } } }, null, 30000);
  const sid = r.headers.get('mcp-session-id');
  if (!sid) throw new Error(`no session ID returned (HTTP ${r.status})`);
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid, 20000);
  fs.writeFileSync(SID_FILE, sid, { mode: 0o600 });
  return sid;
}

function parse(text) {
  let raw = text.trim();
  for (const line of raw.split(/\r?\n/)) if (line.startsWith('data:')) raw = line.slice(5).trim();
  return JSON.parse(raw);
}

async function call(sid) {
  const r = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
    name: 'mcp-adapter-execute-ability', arguments: { ability_name: ability, parameters: params } } }, sid, 180000);
  return r.text();
}

try {
  let sid = fs.existsSync(SID_FILE) ? fs.readFileSync(SID_FILE, 'utf8').trim() : await openSession();
  let text = await call(sid);
  if (/Missing Mcp-Session-Id|Invalid session/i.test(text)) {   // an expired session reopens by itself
    sid = await openSession();
    text = await call(sid);
  }

  let data;
  try { data = parse(text); } catch { console.log(text.slice(0, 900)); process.exit(1); }
  if (data.error) { console.error('ERROR: ' + JSON.stringify(data.error).slice(0, 700)); process.exit(1); }
  for (const block of data.result?.content || []) {
    const t = block.text || '';
    try { console.log(JSON.stringify(JSON.parse(t), null, 1).slice(0, 5000)); } catch { console.log(t.slice(0, 5000)); }
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
