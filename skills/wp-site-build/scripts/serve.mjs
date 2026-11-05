#!/usr/bin/env node
/**
 * serve.mjs — zero-dependency static server for the phase 2 mockup.
 *
 *   cd /tmp && ROOT=/abs/path/_mockup/site nohup node /abs/path/serve.mjs > /tmp/serve.log 2>&1 &
 *   node serve.mjs --help
 *
 * Start it from /tmp. On macOS a process whose CURRENT DIRECTORY is protected
 * by TCC fails with "EPERM: operation not permitted, uv_cwd", whereas ROOT may
 * point anywhere — the server reads a folder its cwd could not occupy. There is
 * no reason to move the project out of the user's working folder.
 *
 * A busy port (often an older project still running) does not crash the server
 * or tempt anyone to kill the neighbour: it tries the next one, up to 20, and
 * prints the port it actually bound — read it from the log, never assume it.
 *
 * Env: ROOT (folder holding index.html; RACINE is accepted too), PORT (default 4321).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: ROOT=/abs/path/site [PORT=4321] node serve.mjs\nServes ROOT on 127.0.0.1, no cache, next free port if busy.');
  process.exit(0);
}

const ROOT = path.resolve(process.env.ROOT || process.env.RACINE || path.join(process.cwd(), 'site'));
const PORT = Number(process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(ROOT)) {
  console.error(`error: ROOT does not exist: ${ROOT}`);
  process.exit(2);
}

const server = http.createServer((req, res) => {
  // A malformed percent-escape in the URL must not kill the server.
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]); } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('400');
  }

  let file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (rel.endsWith('/') && rel !== '/') file = path.join(file, 'index.html');

  // Never serve outside ROOT. The trailing separator stops a sibling folder
  // with a prefixed name (site vs siteX) from passing the check.
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — ' + rel);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.on('listening', () => {
  console.log(`Mockup served on http://127.0.0.1:${server.address().port}  (root: ${ROOT})`);
});

function listen(port, triesLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`Port ${port} busy, trying ${port + 1}`);
      listen(port + 1, triesLeft - 1);
    } else {
      throw err;
    }
  });
  server.listen(port, '127.0.0.1');
}

listen(PORT, 20);
