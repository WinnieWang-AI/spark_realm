#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { StoryStore } from './store.mjs';
import { renderStorygraph } from './render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  return 'Usage: node serve.mjs <story.json> [view.json] [--port 4100] [--open]';
}

const argv = process.argv.slice(2);
const files = [];
let port = 4100;
let openBrowser = false;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--port') { port = Number(argv[i + 1]); i += 1; }
  else if (argv[i] === '--open') { openBrowser = true; }
  else files.push(argv[i]);
}
if (files.length < 1) { console.error(usage()); process.exit(2); }

const storyPath = path.resolve(files[0]);
const viewPath = files[1] ? path.resolve(files[1]) : storyPath.replace(/\.json$/i, '.view.json');

const readStory = () => JSON.parse(fs.readFileSync(storyPath, 'utf8'));
const readView = () => { try { return JSON.parse(fs.readFileSync(viewPath, 'utf8')); } catch { return null; } };
const hashOf = (doc) => crypto.createHash('sha1').update(JSON.stringify(doc)).digest('hex');

// ---- 以文件为准的持久状态 + 撤销/重做历史 ----
let doc = readStory();
let lastHash = hashOf(doc);
let history = [JSON.parse(JSON.stringify(doc))];
let cursor = 0;

function syncFromFileIfChanged() {
  let fresh;
  try { fresh = readStory(); } catch { return false; }
  const h = hashOf(fresh);
  if (h === lastHash) return false;
  // 外部（Agent/CLI）改了文件：重置历史，以文件为准
  doc = fresh; lastHash = h;
  history = [JSON.parse(JSON.stringify(doc))]; cursor = 0;
  return true;
}

function persist() {
  const tmp = `${storyPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, storyPath);
  lastHash = hashOf(doc);
}

function pushHistory() {
  history = history.slice(0, cursor + 1);
  history.push(JSON.parse(JSON.stringify(doc)));
  cursor = history.length - 1;
}

function writeView(view) {
  if (view == null) return;
  fs.writeFileSync(viewPath, JSON.stringify(view, null, 2));
}

function page() {
  const { html } = renderStorygraph(doc, readView());
  const editor = fs.readFileSync(path.join(here, 'viewer', 'editor.js'), 'utf8');
  const inject = `<script>window.__SERVED__ = true; window.__TELLING_DOC__ = ${JSON.stringify(doc).replace(/</g, '\\u003c')};</script><script>${editor}</script>`;
  return html.replace('</body>', `${inject}</body>`);
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    syncFromFileIfChanged();
    return send(res, 200, page(), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && req.url === '/state') {
    syncFromFileIfChanged();
    return send(res, 200, JSON.stringify({ revision: doc.revision, storyId: doc.storyId, canUndo: cursor > 0, canRedo: cursor < history.length - 1 }));
  }
  if (req.method === 'GET' && req.url === '/view') {
    return send(res, 200, JSON.stringify(readView() || {}));
  }
  if (req.method === 'POST' && req.url === '/view') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { writeView(JSON.parse(body)); return send(res, 200, JSON.stringify({ ok: true })); }
      catch (error) { return send(res, 400, JSON.stringify({ ok: false, error: 'view/invalid', message: String(error.message) })); }
    });
    return undefined;
  }
  if (req.method === 'POST' && req.url === '/undo') {
    syncFromFileIfChanged();
    if (cursor <= 0) return send(res, 409, JSON.stringify({ ok: false, error: 'history/empty' }));
    cursor -= 1; doc = JSON.parse(JSON.stringify(history[cursor])); persist();
    return send(res, 200, JSON.stringify({ ok: true, revision: doc.revision, canUndo: cursor > 0, canRedo: cursor < history.length - 1 }));
  }
  if (req.method === 'POST' && req.url === '/redo') {
    syncFromFileIfChanged();
    if (cursor >= history.length - 1) return send(res, 409, JSON.stringify({ ok: false, error: 'history/empty' }));
    cursor += 1; doc = JSON.parse(JSON.stringify(history[cursor])); persist();
    return send(res, 200, JSON.stringify({ ok: true, revision: doc.revision, canUndo: cursor > 0, canRedo: cursor < history.length - 1 }));
  }
  if (req.method === 'POST' && req.url === '/apply') {
    syncFromFileIfChanged();
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let changeSet;
      try { changeSet = JSON.parse(body).changeSet; } catch { return send(res, 400, JSON.stringify({ ok: false, error: 'request/invalid' })); }
      const store = new StoryStore(doc);
      const result = store.apply(changeSet);
      if (result.ok) { doc = store.snapshot(); persist(); pushHistory(); }
      result.canUndo = cursor > 0;
      result.canRedo = cursor < history.length - 1;
      return send(res, result.ok ? 200 : 409, JSON.stringify(result));
    });
    return undefined;
  }
  return send(res, 404, JSON.stringify({ error: 'not-found' }));
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`StoryGraph 服务：${url}  （story=${storyPath}）`);
  console.log(`编辑会写回文件；布局写入 ${viewPath}。Ctrl-C 退出。`);
  if (openBrowser) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try { spawnSync(command, args, { stdio: 'ignore' }); } catch (_) { /* 忽略 */ }
  }
});
