import { makeT } from './i18n.mjs';

const MARGIN = 36;
const SCENE_W = 300;
const SCENE_H = 194;

function actGroups(vm, t) {
  const groups = vm.actsFlat.map((a) => ({
    id: a.id,
    title: a.partTitle ? `${a.partTitle} · ${a.title}` : a.title || a.id,
    sceneIds: a.sceneIds.filter((id) => vm.sceneIds.includes(id)),
  }));
  if (vm.unarranged.length) groups.push({ id: '__un', title: t('unplaced'), sceneIds: vm.unarranged });
  return groups.filter((g) => g.sceneIds.length);
}

export function layout(vm, view, mode = 'telling', locale = 'zh-CN') {
  const t = makeT(locale);
  const sep = locale === 'en' ? ': ' : '：';
  const listSep = locale === 'en' ? ', ' : '、';
  const scenes = {};
  const beats = {};
  const columns = [];
  let width = 420;
  let height = 280;
  const place = (id, x, y) => {
    scenes[id] = { x, y, w: SCENE_W, h: SCENE_H };
    // Collapsed beat endpoints attach to their scene; details retain exact beat IDs.
    for (const beat of vm.beatsOf[id] || []) beats[beat.id] = scenes[id];
    width = Math.max(width, x + SCENE_W + 100);
    height = Math.max(height, y + SCENE_H + 60);
  };
  const saved = view && view.nodePositions ? view.nodePositions : null;
  let allSaved = mode === 'telling' && saved && vm.sceneIds.length > 0
    && vm.sceneIds.every((id) => saved[id] && Number.isFinite(saved[id].x) && Number.isFinite(saved[id].y));
  if (allSaved) {
    // 保存的坐标可能来自不同节点尺寸；若会互相重叠则回退自动布局。
    const candidate = {};
    for (const id of vm.sceneIds) candidate[id] = { x: saved[id].x, y: saved[id].y, w: SCENE_W, h: SCENE_H };
    allSaved = !Object.values(candidate).some((a, i, list) => list.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  }
  if (allSaved) {
    columns.push({ title: t('layout_saved'), x: MARGIN, y: MARGIN });
    for (const id of vm.sceneIds) place(id, saved[id].x, saved[id].y);
  } else if (mode === 'time') {
    const known = new Set(vm.timeKnown);
    const layers = [...new Set(vm.sceneIds.filter((id) => known.has(id)).map((id) => vm.layer[id]))].sort((a, b) => a - b);
    const groups = layers.map((layer) => {
      const ids = vm.sceneIds.filter((id) => known.has(id) && vm.layer[id] === layer);
      const times = [...new Set(ids.map((id) => vm.sceneTime && vm.sceneTime[id]).filter(Boolean))];
      return { title: t('time_point', { n: layer + 1 }) + (times.length ? sep + times.join(listSep) : ''), sceneIds: ids };
    });
    const unknown = vm.sceneIds.filter((id) => !known.has(id));
    if (unknown.length) groups.push({ title: t('time_unknown'), sceneIds: unknown });
    let timeY = MARGIN;
    for (const group of groups) {
      columns.push({ title: group.title, x: MARGIN, y: timeY });
      const rowY = timeY + 36;
      let x = MARGIN;
      for (const id of group.sceneIds) { place(id, x, rowY); x += SCENE_W + 64; }
      timeY = rowY + SCENE_H + 48;
    }
  } else {
    let y = MARGIN;
    for (const group of actGroups(vm, t)) {
      columns.push({ title: group.title, x: MARGIN, y });
      group.sceneIds.forEach((id, i) => place(id, MARGIN + (i % 3) * (SCENE_W + 64), y + 36 + Math.floor(i / 3) * (SCENE_H + 48)));
      y += 36 + Math.ceil(group.sceneIds.length / 3) * (SCENE_H + 48) + 24;
    }
  }
  return { mode, width, height, scenes, beats, columns };
}

export function layoutRelationGraph(cg, vm, locale = 'zh-CN') {
  const t = makeT(locale);
  const scenes = {};
  const entities = {};
  const acts = [];
  const columns = [];
  let y = MARGIN;
  for (const group of actGroups(vm, t)) {
    acts.push({ ...group, x: MARGIN, y });
    y += 34;
    for (const id of group.sceneIds) {
      scenes[id] = { x: MARGIN, y, w: 240, h: 60 };
      y += 80;
    }
    y += 24;
  }
  let maxY = y;
  ['character', 'location', 'prop'].forEach((kind, column) => {
    const x = 430 + column * 310;
    columns.push({ title: t(`kind_${kind}`), x, y: MARGIN });
    cg.entities.filter((e) => e.kind === kind).forEach((e, i) => {
      entities[e.id] = { x, y: 78 + i * 106, w: 216, h: 70 };
      maxY = Math.max(maxY, entities[e.id].y + 70);
    });
  });
  return { mode: 'charmap', width: 1380, height: maxY + 60, scenes, entities, acts, columns };
}

export function rectFor(laid, endpoint) {
  return endpoint?.type === 'beat' ? laid.beats[endpoint.id] : laid.scenes[endpoint?.id];
}
