const ENTITY_KINDS = ['character', 'location', 'prop'];
const NARRATIVE_MODES = ['present', 'flashback', 'flashForward'];
const NARRATIVE_ROLES = ['setup', 'turningPoint', 'climax', 'transition'];
const BEAT_KINDS = ['action', 'dialogue', 'narration'];
const REL_KINDS = ['before', 'overlaps', 'causes', 'setsUp'];
const DIRECTIONS = ['directed', 'symmetric'];

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

export function validate(story) {
  const errors = [];
  const warnings = [];
  const err = (code, message, subject = {}) => errors.push({ code, message, subject });
  const warn = (code, message, subject = {}) => warnings.push({ code, message, subject });

  if (!story || typeof story !== 'object') {
    err('H0', '文档不是对象');
    return { errors, warnings };
  }
  if (story.schemaVersion !== 1) warn('schemaVersion', `schemaVersion 不是 1: ${story.schemaVersion}`);

  const entities = obj(story.entities);
  const scenes = obj(story.scenes);
  const threads = obj(story.threads);
  const logicRelations = arr(story.logicRelations);
  const characterRelations = arr(story.characterRelations);

  const ids = new Map();
  const addId = (id, type) => {
    if (id == null) return;
    if (ids.has(id)) err('H1', `ID 重复: ${id}`, { id, types: [ids.get(id), type] });
    else ids.set(id, type);
  };

  const areasByLoc = new Map();
  for (const [id, e] of Object.entries(entities)) {
    addId(id, 'entity');
    if (!ENTITY_KINDS.includes(e.kind)) err('H2', `实体 kind 非法: ${id}`, { id, kind: e.kind });
    if (e.kind === 'location') {
      const local = new Set();
      for (const a of arr(e.areas)) {
        addId(a.id, 'area');
        if (local.has(a.id)) err('H1', `地点内 area 重复: ${a.id}`, { locationId: id, areaId: a.id });
        local.add(a.id);
      }
      areasByLoc.set(id, local);
    }
  }

  const beatOwner = new Map();
  const beatIndex = new Map();
  for (const [id, s] of Object.entries(scenes)) {
    addId(id, 'scene');
    if (s.narrativeMode && !NARRATIVE_MODES.includes(s.narrativeMode)) err('H2', `narrativeMode 非法: ${id}`, { id, value: s.narrativeMode });
    if (s.narrativeRole && !NARRATIVE_ROLES.includes(s.narrativeRole)) err('H2', `narrativeRole 非法: ${id}`, { id, value: s.narrativeRole });

    if (s.locationId != null) {
      const loc = entities[s.locationId];
      if (!loc) err('H3', `locationId 不存在: ${id}`, { id, locationId: s.locationId });
      else if (loc.kind !== 'location') err('H2', `locationId 指向非地点: ${id}`, { id, locationId: s.locationId });
      if (s.areaId != null) {
        const set = areasByLoc.get(s.locationId);
        if (!set || !set.has(s.areaId)) err('H3', `areaId 不属于该地点: ${id}`, { id, areaId: s.areaId, locationId: s.locationId });
      }
    }
    for (const t of arr(s.threadIds)) if (!threads[t]) err('H3', `threadId 不存在: ${id}`, { id, threadId: t });

    const participants = obj(s.participants);
    for (const cid of Object.keys(participants)) {
      const c = entities[cid];
      if (!c || c.kind !== 'character') err('H3', `participant 非角色: ${id}`, { id, characterId: cid });
    }
    for (const [pid, ps] of Object.entries(obj(s.props))) {
      const p = entities[pid];
      if (!p || p.kind !== 'prop') err('H3', `prop 非道具: ${id}`, { id, propId: pid });
      if (ps && ps.holderId != null) {
        const h = entities[ps.holderId];
        if (!h || h.kind !== 'character') err('H3', `holderId 非角色: ${id}/${pid}`, { id, propId: pid, holderId: ps.holderId });
      }
    }

    arr(s.beats).forEach((b, i) => {
      if (!b || b.id == null) {
        err('H3', `beat 缺少 id: ${id}`, { sceneId: id });
        return;
      }
      addId(b.id, 'beat');
      if (beatOwner.has(b.id)) err('H1', `beat 出现在多个场景: ${b.id}`, { beatId: b.id });
      beatOwner.set(b.id, id);
      beatIndex.set(b.id, i);
      if (!BEAT_KINDS.includes(b.kind)) err('H2', `beat.kind 非法: ${b.id}`, { beatId: b.id, kind: b.kind });
      if (b.kind === 'dialogue') {
        if (!b.speakerId) err('H7', `dialogue 缺少 speakerId: ${b.id}`, { beatId: b.id });
        else if (!participants[b.speakerId]) err('H7', `speakerId 不是本场参与人物: ${b.id}`, { beatId: b.id, speakerId: b.speakerId, sceneId: id });
      }
    });
  }

  const outline = obj(story.outline);
  if (outline.parts && outline.acts) err('H8', 'outline 顶层 parts 与 acts 不能同时存在');
  const orderedSceneIds = [];
  const collectActs = (acts) => {
    for (const a of arr(acts)) {
      addId(a.id, 'act');
      for (const sid of arr(a.sceneIds)) {
        if (!scenes[sid]) err('H3', `outline 引用的场景不存在: ${a.id}`, { actId: a.id, sceneId: sid });
        orderedSceneIds.push(sid);
      }
    }
  };
  if (outline.parts) for (const p of arr(outline.parts)) { addId(p.id, 'part'); collectActs(p.acts); }
  else collectActs(outline.acts);
  {
    const seen = new Set();
    for (const sid of orderedSceneIds) {
      if (seen.has(sid)) err('H4', `场景在 outline 中重复: ${sid}`, { sceneId: sid });
      seen.add(sid);
    }
  }

  const resolveEndpoint = (ep, relId) => {
    if (!ep || (ep.type !== 'scene' && ep.type !== 'beat')) {
      err('H2', `端点类型非法: ${relId}`, { relId, endpoint: ep });
      return null;
    }
    if (!ids.has(ep.id)) {
      err('H3', `端点不存在: ${relId}`, { relId, endpoint: ep });
      return null;
    }
    const actual = ids.get(ep.id);
    if (ep.type === 'scene' && actual !== 'scene') err('H2', `端点类型不匹配: ${relId}`, { relId, endpoint: ep, actual });
    if (ep.type === 'beat' && actual !== 'beat') err('H2', `端点类型不匹配: ${relId}`, { relId, endpoint: ep, actual });
    return ep;
  };

  const beforeEdges = [];
  const overlapsPairs = [];
  for (const r of logicRelations) {
    if (!r || r.id == null) { err('H2', '逻辑关系缺少 id'); continue; }
    addId(r.id, 'logicRelation');
    if (!REL_KINDS.includes(r.kind)) { err('H2', `关系 kind 非法: ${r.id}`, { relId: r.id, kind: r.kind }); continue; }
    const s = resolveEndpoint(r.source, r.id);
    const t = resolveEndpoint(r.target, r.id);
    if (!s || !t) continue;
    if (r.kind === 'before') beforeEdges.push({ from: s.id, to: t.id, relId: r.id });
    if (r.kind === 'overlaps') overlapsPairs.push({ a: s.id, b: t.id, relId: r.id });
  }

  const adj = new Map();
  const nodes = new Set();
  for (const e of beforeEdges) {
    nodes.add(e.from);
    nodes.add(e.to);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const state = new Map();
  let cycle = null;
  const dfs = (n) => {
    state.set(n, 1);
    for (const m of adj.get(n) || []) {
      const st = state.get(m) || 0;
      if (st === 1) { cycle = [n, m]; return true; }
      if (st === 0 && dfs(m)) return true;
    }
    state.set(n, 2);
    return false;
  };
  for (const n of nodes) if ((state.get(n) || 0) === 0 && dfs(n)) break;
  if (cycle) err('H5', `before 子图存在环: ${cycle.join(' -> ')}`, { cycle });

  for (const e of beforeEdges) {
    const so = beatOwner.get(e.from);
    const to = beatOwner.get(e.to);
    if (so && to && so === to && beatIndex.get(e.from) > beatIndex.get(e.to)) {
      err('H5', `同场景内 before 与节拍顺序相反: ${e.from} -> ${e.to}`, { from: e.from, to: e.to });
    }
  }
  const sceneBeforePair = new Set();
  for (const e of beforeEdges) {
    const so = beatOwner.get(e.from);
    const to = beatOwner.get(e.to);
    if (so && to) { if (so !== to) sceneBeforePair.add(`${so}>${to}`); continue; }
    if (so && !to) { sceneBeforePair.add(`${so}>${e.to}`); continue; }
    if (!so && to) { sceneBeforePair.add(`${e.from}>${to}`); continue; }
    sceneBeforePair.add(`${e.from}>${e.to}`);
  }
  for (const e of beforeEdges) {
    const so = beatOwner.get(e.from);
    const to = beatOwner.get(e.to);
    if (so && to && so !== to && sceneBeforePair.has(`${to}>${so}`)) {
      err('H5', `Scene 级 before 与反向的 Beat 级 before 冲突: ${e.from} -> ${e.to}`, { from: e.from, to: e.to });
    }
  }

  const canReach = (a, b) => {
    const stack = [a];
    const seen = new Set([a]);
    while (stack.length) {
      const n = stack.pop();
      if (n === b) return true;
      for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    }
    return false;
  };
  for (const p of overlapsPairs) {
    if (canReach(p.a, p.b) || canReach(p.b, p.a)) err('H6', `overlaps 与 before 可达冲突: ${p.a} / ${p.b}`, { pair: p });
  }

  for (const r of characterRelations) {
    if (!r || r.id == null) { err('H2', '人物关系缺少 id'); continue; }
    addId(r.id, 'characterRelation');
    for (const k of ['sourceCharacterId', 'targetCharacterId']) {
      const c = entities[r[k]];
      if (!c || c.kind !== 'character') err('H3', `人物关系引用非角色: ${r.id}`, { relId: r.id, field: k, characterId: r[k] });
    }
    if (r.direction && !DIRECTIONS.includes(r.direction)) err('H2', `direction 非法: ${r.id}`, { relId: r.id, direction: r.direction });
    const sc = obj(r.scope);
    if (sc.type === 'scenes') {
      for (const sid of arr(sc.sceneIds)) if (!scenes[sid]) err('H3', `关系 scope 场景不存在: ${r.id}`, { relId: r.id, sceneId: sid });
    } else if (sc.type !== 'global') {
      err('H2', `scope.type 非法: ${r.id}`, { relId: r.id, scope: r.scope });
    }
  }

  for (const id of Object.keys(threads)) addId(id, 'thread');

  // 软诊断：实体未在任何场景出现（如新增人物却没落地到情节）
  const KIND_CN = { character: '人物', location: '地点', prop: '道具' };
  const usedEntities = new Set();
  for (const s of Object.values(scenes)) {
    for (const cid of Object.keys(obj(s.participants))) usedEntities.add(cid);
    for (const pid of Object.keys(obj(s.props))) usedEntities.add(pid);
    if (s.locationId) usedEntities.add(s.locationId);
  }
  for (const [id, e] of Object.entries(entities)) {
    if (!usedEntities.has(id)) {
      warn('entity/unused', `${KIND_CN[e.kind] || '实体'}「${e.name || id}」未在任何场景出现`, { id, kind: e.kind });
    }
  }

  return { errors, warnings };
}
