#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { StoryStore } from './store.mjs';
import { renderStorygraph } from './render.mjs';

function usage() {
  return 'Usage: node serve.mjs <story.json> [view.json] [--port 4100]';
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
const viewPath = files[1] && fs.existsSync(files[1]) ? path.resolve(files[1]) : null;
const view = viewPath ? JSON.parse(fs.readFileSync(viewPath, 'utf8')) : null;

const readStory = () => JSON.parse(fs.readFileSync(storyPath, 'utf8'));

function page() {
  const store = new StoryStore(readStory());
  const { html } = renderStorygraph(store.snapshot(), view);
  return html.replace('</body>', '<script>window.__SERVED__ = true;</script></body>');
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    return send(res, 200, page(), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && req.url === '/state') {
    try { const doc = readStory(); return send(res, 200, JSON.stringify({ revision: doc.revision, storyId: doc.storyId })); }
    catch (error) { return send(res, 500, JSON.stringify({ error: String(error.message) })); }
  }
  if (req.method === 'POST' && req.url === '/apply') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let changeSet;
      try { changeSet = JSON.parse(body).changeSet; } catch { return send(res, 400, JSON.stringify({ ok: false, error: 'request/invalid' })); }
      const store = new StoryStore(readStory());
      const result = store.apply(changeSet);
      if (result.ok) store.write(storyPath); // 落盘，文件为准
      return send(res, result.ok ? 200 : 409, JSON.stringify(result));
    });
    return undefined;
  }
  return send(res, 404, JSON.stringify({ error: 'not-found' }));
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`StoryGraph 服务：${url}  （story=${storyPath}）`);
  console.log('以文件为准：Agent 用 CLI 改文件、或页面内编辑，页面都会自动刷新（保留视角）。Ctrl-C 退出。');
  if (openBrowser) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try { spawnSync(command, args, { stdio: 'ignore' }); } catch (_) { /* 忽略 */ }
  }
});
