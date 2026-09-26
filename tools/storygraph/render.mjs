#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate } from './validate.mjs';
import { derive } from './derive.mjs';
import { layout, layoutRelationGraph, rectFor } from './layout.mjs';
import { localeOf, makeT, stringsFor } from './i18n.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const LABELS = { before: 'rel_before', overlaps: 'rel_overlaps', causes: 'rel_causes', setsUp: 'rel_setsUp' };
const ROLES = { setup: 'role_setup', turningPoint: 'role_turningPoint', climax: 'role_climax', transition: 'role_transition' };
const MODES = { flashback: 'mode_flashback', flashForward: 'mode_flashForward' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function edgePath(a, b, lane = 0) {
  if (a === b || (a.x === b.x && a.y === b.y)) {
    const x = a.x + a.w;
    const off = 28 + lane * 9;
    return `M ${x} ${a.y + 45} C ${x + off} ${a.y + 45} ${x + off} ${a.y + a.h - 35} ${x} ${a.y + a.h - 35}`;
  }
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
  const offset = (lane % 5 - 2) * 9;
  if (Math.abs(bcx - acx) >= Math.abs(bcy - acy)) {
    const dir = bcx >= acx ? 1 : -1;
    const sx = dir > 0 ? a.x + a.w : a.x, tx = dir > 0 ? b.x : b.x + b.w;
    const curve = Math.max(26, Math.abs(tx - sx) * 0.4);
    return `M ${sx} ${acy + offset} C ${sx + dir * curve} ${acy + offset} ${tx - dir * curve} ${bcy + offset} ${tx} ${bcy + offset}`;
  }
  const dir = bcy >= acy ? 1 : -1;
  const sy = dir > 0 ? a.y + a.h : a.y, ty = dir > 0 ? b.y : b.y + b.h;
  const curve = Math.max(26, Math.abs(ty - sy) * 0.4);
  return `M ${acx + offset} ${sy} C ${acx + offset} ${sy + dir * curve} ${bcx + offset} ${ty - dir * curve} ${bcx + offset} ${ty}`;
}

function markers(mode) {
  return `<defs>${['before', 'causes', 'setsUp', 'sequence', 'person'].map((kind) => `<marker id="${mode}-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="marker-${kind}"/></marker>`).join('')}</defs>`;
}

function node(id, type, rect, html, className = '', dataKind = '') {
  return `<g class="graph-node ${className}" data-node-id="${esc(id)}" data-node-type="${type}"${dataKind ? ` data-kind="${esc(dataKind)}"` : ''} transform="translate(${rect.x} ${rect.y})" tabindex="0" role="button">
    <rect class="node-box" width="${rect.w}" height="${rect.h}" rx="8"/>
    <foreignObject x="1" y="1" width="${rect.w - 2}" height="${rect.h - 2}"><div xmlns="http://www.w3.org/1999/xhtml" class="node-content">${html}</div></foreignObject>
  </g>`;
}

function sceneNode(vm, sid, rect, compact = false, t) {
  const s = vm.__scenes[sid];
  const order = vm.tellingIndex[sid];
  const listSep = vm.__locale === 'en' ? ', ' : '、';
  const number = order == null ? t('unplaced') : String(order + 1).padStart(2, '0');
  const people = Object.keys(s.participants || {}).map((id) => vm.entities[id]?.name || id).join(listSep);
  const location = vm.entities[s.locationId]?.name || t('location_tbd');
  const title = `<div class="node-heading"><span class="node-number">${number}</span><span class="node-title" title="${esc(s.title || sid)}">${esc(s.title || sid)}</span></div>`;
  if (compact) return node(sid, 'scene', rect, title, 'scene compact');
  const badges = [MODES[s.narrativeMode] && t(MODES[s.narrativeMode]), ROLES[s.narrativeRole] && t(ROLES[s.narrativeRole])].filter(Boolean);
  return node(sid, 'scene', rect, `${title}
    <p class="node-summary" title="${esc(s.summary || '')}">${esc(s.summary || t('summary_tbd'))}</p>
    <div class="node-location" title="${esc(location)}">${esc(location)}</div>
    <div class="node-people" title="${esc(people)}">${esc(people || t('people_tbd'))}</div>
    <div class="node-footer"><span>${t('beats_count', { n: (s.beats || []).length })}</span><span class="node-badges">${badges.map((b) => `<span>${b}</span>`).join('')}</span></div>`, `scene role-${s.narrativeRole || 'none'}`);
}

function logicSvg(vm, laid, t) {
  const lanes = new Map();
  const edges = vm.edges.map((edge) => {
    const a = rectFor(laid, edge.source), b = rectFor(laid, edge.target);
    if (!a || !b) return '';
    const key = [edge.sourceScene, edge.targetScene].sort().join('|');
    const lane = lanes.get(key) || 0;
    lanes.set(key, lane + 1);
    const d = edgePath(a, b, lane);
    const marker = edge.kind === 'overlaps' ? '' : ` marker-end="url(#${laid.mode}-${edge.kind})"`;
    const label = t(LABELS[edge.kind]);
    return `<g class="logic-edge rel-${edge.kind}" data-edge-id="${esc(edge.id)}" data-source="${esc(edge.sourceScene)}" data-target="${esc(edge.targetScene)}" data-kind="${edge.kind}" tabindex="0" role="button" aria-label="${esc(label + '：' + edge.description)}"><path class="edge-hit" d="${d}"/><path class="edge-line" d="${d}"${marker}/><title>${esc(label)}：${esc(edge.description)}</title></g>`;
  }).join('');
  const sequence = laid.mode === 'telling' ? vm.order.slice(1).map((id, index) => {
    const prev = vm.order[index];
    return `<path class="sequence-edge" d="${edgePath(laid.scenes[prev], laid.scenes[id], 2)}" marker-end="url(#telling-sequence)"/>`;
  }).join('') : '';
  const columns = laid.columns.map((c) => `<text class="column-label" x="${c.x}" y="${c.y + 17}">${esc(c.title)}</text>`).join('');
  return `<svg class="story-svg" data-mode="${laid.mode}" viewBox="0 0 ${laid.width} ${laid.height}" aria-label="${laid.mode === 'time' ? t('aria_time') : t('aria_telling')}">${markers(laid.mode)}<g class="edges">${sequence}${edges}</g><g class="nodes">${vm.sceneIds.map((id) => sceneNode(vm, id, laid.scenes[id], false, t)).join('')}</g>${columns}</svg>`;
}

function relationSvg(vm, laid, t) {
  const parts = Object.entries(vm.entityScenes).flatMap(([eid, sids]) => sids.map((sid) => {
    const a = laid.scenes[sid], b = laid.entities[eid];
    if (!a || !b) return '';
    return `<path class="part-edge" d="${edgePath(a, b, 2)}" data-source="${esc(sid)}" data-target="${esc(eid)}" data-kind="${esc(vm.entities[eid].kind)}"/>`;
  })).join('');
  const pairs = vm.relationGraph.pairEdges.map((p, index) => {
    const a = laid.entities[p.a], b = laid.entities[p.b];
    if (!a || !b) return '';
    const x = a.x + a.w, by = b.y + b.h / 2, ay = a.y + a.h / 2;
    const off = 40 + p.lane * 20 + (index % 5) * 8;
    const d = `M ${x} ${ay} C ${x + off} ${ay} ${x + off} ${by} ${b.x + b.w} ${by}`;
    const label = `${p.aName} ${p.directed ? '→' : '↔'} ${p.bName}：${p.kinds[0]}`;
    return `<g class="pair-edge" data-relation-id="${esc(p.id)}" data-source="${esc(p.a)}" data-target="${esc(p.b)}" tabindex="0" role="button" aria-label="${esc(label)}"><path class="edge-hit" d="${d}"/><path class="edge-line" d="${d}"${p.directed ? ' marker-end="url(#charmap-person)"' : ''}/><title>${esc(label)}</title></g>`;
  }).join('');
  const entities = vm.relationGraph.entities.map((e) => node(e.id, 'entity', laid.entities[e.id], `<div class="entity-heading"><span class="entity-kind kind-${e.kind}">${esc(t(`kind_${e.kind}`))}</span><span class="entity-name" title="${esc(e.name)}">${esc(e.name)}</span></div><div class="entity-count">${esc(t('appears_count', { n: (vm.entityScenes[e.id] || []).length }))}</div>`, `entity kind-${e.kind}`, e.kind)).join('');
  const labels = [...laid.columns, ...laid.acts].map((a) => `<text class="column-label" x="${a.x}" y="${a.y + 17}">${esc(a.title)}</text>`).join('');
  return `<svg class="story-svg charm-svg" data-mode="charmap" viewBox="0 0 ${laid.width} ${laid.height}" aria-label="${esc(t('aria_charmap'))}">${markers('charmap')}<g class="edges">${parts}${pairs}</g><g class="nodes">${Object.keys(laid.scenes).map((id) => sceneNode(vm, id, laid.scenes[id], true, t)).join('')}${entities}</g>${labels}</svg>`;
}

function iconSprite() {
  return fs.readFileSync(path.join(here, 'viewer', 'icons.svg'), 'utf8');
}

export function renderStorygraph(story, view, options = {}) {
  const result = validate(story);
  const locale = localeOf(story, options.lang);
  const t = makeT(locale);
  const title = story?.metadata?.title || story?.storyId || 'StoryGraph';
  if (result.errors.length) {
    const failed = t('validation_failed');
    return { ok: false, result, html: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>StoryGraph ${esc(failed)}</title><h1>${esc(title)}：${esc(failed)}</h1><ul>${result.errors.map((e) => `<li>${esc(e.code)}：${esc(e.message)}</li>`).join('')}</ul></html>` };
  }
  const vm = derive(story);
  vm.__scenes = story.scenes;
  vm.__locale = locale;
  const telling = layout(vm, view, 'telling', locale), time = layout(vm, view, 'time', locale), charmap = layoutRelationGraph(vm.relationGraph, vm, locale);
  const data = { ...vm, scenes: vm.__scenes, title, locale, warnings: result.warnings, geoms: {} };
  delete data.__scenes;
  for (const laid of [telling, time, charmap]) {
    data.geoms[laid.mode] = { w: laid.width, h: laid.height, rects: { ...laid.scenes, ...laid.entities }, nodes: [...Object.values(laid.scenes), ...Object.values(laid.entities || {})] };
  }
  const read = (file) => fs.readFileSync(path.join(here, 'viewer', file), 'utf8');
  const logoDataUri = `data:image/png;base64,${fs.readFileSync(path.join(here, 'viewer', 'logo-v1.png')).toString('base64')}`;
  const i18n = JSON.stringify({ locale, strings: stringsFor(locale) }).replace(/</g, '\\u003c');
  const html = read('template.html')
    .replace('/*__CSS__*/', () => read('viewer.css'))
    .replace('/*__I18N__*/', () => `window.__I18N__ = ${i18n};`)
    .replace('/*__JS__*/', () => read('viewer.js'))
    .replace('/*__DATA__*/', () => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'))
    .replace('<!--__ICONS__-->', () => iconSprite())
    .replace('<!--__GRAPHS__-->', () => logicSvg(vm, telling, t) + logicSvg(vm, time, t) + relationSvg(vm, charmap, t))
    .replaceAll('__BRAND_LOGO__', () => logoDataUri)
    .replaceAll('__LANG__', () => locale)
    .replaceAll('__TITLE__', () => esc(title));
  return { html, ok: true, result, data };
}

function openPath(target) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', target] : [target];
  try { spawnSync(command, args, { stdio: 'ignore' }); } catch (_) { /* 打开失败不影响结果 */ }
}

function main() {
  const open = process.argv.includes('--open');
  const langIndex = process.argv.indexOf('--lang');
  const lang = langIndex >= 0 ? process.argv[langIndex + 1] : undefined;
  const args = process.argv.slice(2).filter((a) => a !== '--' && a !== '--open' && a !== '--lang' && a !== lang);
  if (args.length < 2) {
    console.error('Usage: node render.mjs <story.json> [view.json] <out.html> [--lang en|zh-CN] [--open]');
    process.exit(2);
  }
  const story = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const view = args.length > 2 && fs.existsSync(args[1]) ? JSON.parse(fs.readFileSync(args[1], 'utf8')) : null;
  const out = args.length > 2 ? args[2] : args[1];
  const { html, ok, result } = renderStorygraph(story, view, { lang });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`${ok ? '已渲染' : '校验失败'} ${out}（错误 ${result.errors.length}，警告 ${result.warnings.length}）`);
  if (ok && open) { openPath(path.resolve(out)); console.log(`已在默认浏览器打开 ${path.resolve(out)}`); }
  if (!ok) process.exitCode = 1;
}
try {
  if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
} catch (_) { /* 被 import 时静默 */ }
