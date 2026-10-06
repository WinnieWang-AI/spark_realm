const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

export function derive(story) {
  const scenes = obj(story.scenes);
  const threads = obj(story.threads);
  const entities = obj(story.entities);
  const logicRelations = arr(story.logicRelations);
  const characterRelations = arr(story.characterRelations);
  const outline = obj(story.outline);

  const actsFlat = [];
  if (outline.parts) {
    for (const p of arr(outline.parts)) {
      for (const a of arr(p.acts)) actsFlat.push({ ...a, partId: p.id, partTitle: p.title });
    }
  } else {
    for (const a of arr(outline.acts)) actsFlat.push({ ...a });
  }

  const order = [];
  for (const a of actsFlat) for (const sid of arr(a.sceneIds)) if (scenes[sid]) order.push(sid);
  const tellingIndex = {};
  order.forEach((sid, i) => { tellingIndex[sid] = i; });

  const sceneIds = Object.keys(scenes);
  const arranged = new Set(order);
  const unarranged = sceneIds.filter((id) => !arranged.has(id));

  const beats = [];
  const beatOwner = {};
  const beatsOf = {};
  for (const [sid, s] of Object.entries(scenes)) {
    beatsOf[sid] = arr(s.beats);
    arr(s.beats).forEach((b, i) => {
      beats.push({ id: b.id, kind: b.kind, text: b.text, speakerId: b.speakerId, tone: b.tone, sceneId: sid, index: i });
      beatOwner[b.id] = sid;
    });
  }

  const constraint = new Map();
  const addConstraint = (a, b) => {
    if (!a || !b || a === b) return;
    if (!constraint.has(b)) constraint.set(b, new Set());
    constraint.get(b).add(a);
  };
  for (const r of logicRelations) {
    if (r.kind !== 'before') continue;
    // A beat occurring earlier does not order its entire containing scene.
    if (r.source.type === 'scene' && r.target.type === 'scene') addConstraint(r.source.id, r.target.id);
  }

  const layer = {};
  const visiting = new Set();
  const computeLayer = (id) => {
    if (layer[id] != null) return layer[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let l = 0;
    for (const p of constraint.get(id) || []) l = Math.max(l, computeLayer(p) + 1);
    visiting.delete(id);
    layer[id] = l;
    return l;
  };
  sceneIds.forEach(computeLayer);
  const timeKnown = new Set();
  for (const [target, sources] of constraint) {
    timeKnown.add(target);
    for (const source of sources) timeKnown.add(source);
  }
  const precedes = (source, target) => {
    const pending = [...(constraint.get(target) || [])];
    const seen = new Set();
    while (pending.length) {
      const id = pending.pop();
      if (id === source) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(...(constraint.get(id) || []));
    }
    return false;
  };

  const inversions = [];
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      const a = order[i];
      const b = order[j];
      if (precedes(b, a)) inversions.push([a, b]);
    }
  }
  const inverted = new Set(inversions.flat());

  const edges = arr(logicRelations).map((r) => {
    const sScene = r.source.type === 'scene' ? r.source.id : beatOwner[r.source.id];
    const tScene = r.target.type === 'scene' ? r.target.id : beatOwner[r.target.id];
    return {
      id: r.id,
      kind: r.kind,
      description: r.description || '',
      source: r.source,
      target: r.target,
      sourceScene: sScene,
      targetScene: tScene,
    };
  });

  const pairKey = (a, b) => [a, b].sort().join('~');
  const pairs = new Map();
  for (const r of characterRelations) {
    const a = r.sourceCharacterId;
    const b = r.targetCharacterId;
    const key = pairKey(a, b);
    if (!pairs.has(key)) pairs.set(key, { key, a: [a, b].sort()[0], b: [a, b].sort()[1], facts: [] });
    const active = r.scope && r.scope.type === 'global' ? sceneIds.slice() : arr(obj(r.scope).sceneIds).filter((sid) => scenes[sid]);
    pairs.get(key).facts.push({
      id: r.id,
      sourceCharacterId: a,
      targetCharacterId: b,
      kind: r.kind,
      direction: r.direction,
      description: r.description || '',
      scopeType: obj(r.scope).type,
      sceneIds: active,
    });
  }
  const relationsByPair = [...pairs.values()].map((p) => {
    const perScene = {};
    for (const sid of order) perScene[sid] = p.facts.filter((f) => f.sceneIds.includes(sid)).map((f) => f.id);
    const changed = [];
    let prev = '';
    for (const sid of order) {
      const set = perScene[sid].slice().sort().join(',');
      if (set !== prev) { if (set !== '') changed.push(sid); prev = set; } // 不把“关系未声明”当成一个变化
    }
    const global = p.facts.length > 0 && p.facts.every((f) => f.scopeType === 'global');
    return { ...p, perScene, changePoints: global ? [] : changed, global };
  });

  const scenesInOrder = [...sceneIds].sort(
    (a, b) => (tellingIndex[a] ?? Number.MAX_SAFE_INTEGER) - (tellingIndex[b] ?? Number.MAX_SAFE_INTEGER),
  );
  const entityScenes = {};
  for (const sid of scenesInOrder) {
    const s = scenes[sid];
    for (const cid of Object.keys(obj(s.participants))) (entityScenes[cid] || (entityScenes[cid] = [])).push(sid);
    if (s.locationId) (entityScenes[s.locationId] || (entityScenes[s.locationId] = [])).push(sid);
    for (const pid of Object.keys(obj(s.props))) (entityScenes[pid] || (entityScenes[pid] = [])).push(sid);
  }
  const entitiesByKind = { character: [], location: [], prop: [] };
  for (const [id, e] of Object.entries(entities)) {
    if (!entitiesByKind[e.kind]) continue;
    entitiesByKind[e.kind].push({ id, name: e.name || id, kind: e.kind, tags: arr(e.tags), scenes: entityScenes[id] || [] });
  }
  const firstSceneOrder = (entry) => (entry.scenes.length ? (tellingIndex[entry.scenes[0]] ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER);
  for (const kind of Object.keys(entitiesByKind)) {
    entitiesByKind[kind].sort((a, b) => firstSceneOrder(a) - firstSceneOrder(b)); // 稳定排序：同场并列时保留原始顺序
  }

  const acts = actsFlat.map((a, ai) => {
    const sceneIds = arr(a.sceneIds).filter((sid) => scenes[sid]);
    const entIds = new Set();
    for (const sid of sceneIds) {
      const s = scenes[sid];
      for (const cid of Object.keys(obj(s.participants))) entIds.add(cid);
      if (s.locationId) entIds.add(s.locationId);
      for (const pid of Object.keys(obj(s.props))) entIds.add(pid);
    }
    return { id: a.id, title: a.title, partTitle: a.partTitle, index: ai, sceneIds, entityIds: [...entIds] };
  });
  const actOfScene = {};
  for (const a of acts) for (const sid of a.sceneIds) actOfScene[sid] = a.id;

  const kindOrder = { character: 0, location: 1, prop: 2 };
  const entityNodes = [];
  for (const kind of ['character', 'location', 'prop']) {
    for (const e of entitiesByKind[kind]) {
      const actIds = [];
      const seen = new Set();
      for (const sid of e.scenes) {
        const aid = actOfScene[sid];
        if (aid && !seen.has(aid)) { seen.add(aid); actIds.push(aid); }
      }
      entityNodes.push({
        id: e.id,
        name: e.name,
        kind,
        tags: e.tags || [],
        actIds,
        firstOrder: e.scenes.length ? (tellingIndex[e.scenes[0]] ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
      });
    }
  }
  entityNodes.sort(
    (a, b) =>
      (kindOrder[a.kind] - kindOrder[b.kind]) ||
      (a.firstOrder - b.firstOrder), // 稳定排序：同场并列时保留 entitiesByKind 的顺序
  );

  const pairEdges = relationsByPair.flatMap((p) => p.facts.map((f, lane) => ({
    id: f.id,
    a: f.sourceCharacterId,
    b: f.targetCharacterId,
    aName: (entities[f.sourceCharacterId] && entities[f.sourceCharacterId].name) || f.sourceCharacterId,
    bName: (entities[f.targetCharacterId] && entities[f.targetCharacterId].name) || f.targetCharacterId,
    kinds: [f.kind],
    directed: f.direction === 'directed',
    sceneIds: f.sceneIds,
    scopeType: f.scopeType,
    description: f.description,
    lane,
  })));
  const relationGraph = { groups: acts, entities: entityNodes, pairEdges };

  const TIME_CN = { dawn: '黎明', morning: '早晨', midday: '正午', noon: '正午', afternoon: '下午', dusk: '黄昏', evening: '傍晚', night: '夜晚' };
  const sceneTime = {};
  for (const [sid, s] of Object.entries(scenes)) {
    const parts = [];
    if (s.time && s.time.period) parts.push(s.time.period);
    if (s.time && s.time.timeOfDay) parts.push(TIME_CN[s.time.timeOfDay] || s.time.timeOfDay);
    if (parts.length) sceneTime[sid] = parts.join(' · ');
  }

  const nameOf = (id) => (entities[id] && entities[id].name) || id;
  const charRelations = characterRelations.map((r) => ({
    id: r.id,
    kind: r.kind,
    direction: r.direction,
    description: r.description || '',
    source: r.sourceCharacterId,
    target: r.targetCharacterId,
    sourceName: nameOf(r.sourceCharacterId),
    targetName: nameOf(r.targetCharacterId),
    scopeType: obj(r.scope).type,
    sceneIds: obj(r.scope).type === 'global' ? sceneIds.slice() : arr(obj(r.scope).sceneIds),
  }));

  return {
    meta: obj(story.metadata),
    storyId: story.storyId,
    revision: story.revision,
    entities,
    threads,
    sceneIds,
    order,
    unarranged,
    tellingIndex,
    layer,
    sceneTime,
    timeKnown: [...timeKnown],
    inverted: [...inverted],
    actsFlat,
    beats,
    beatsOf,
    beatOwner,
    edges,
    characterRelations: charRelations,
    relationsByPair,
    relationGraph,
    entityScenes,
    entitiesByKind,
    stats: {
      scenes: sceneIds.length,
      beats: beats.length,
      entities: Object.keys(entities).length,
      logicRelations: edges.length,
      characterRelations: charRelations.length,
      acts: actsFlat.length,
      threads: Object.keys(threads).length,
    },
  };
}
