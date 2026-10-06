const clone = (value) => JSON.parse(JSON.stringify(value));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

function fail(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  throw error;
}

function findBeat(doc, id) {
  for (const [sceneId, scene] of Object.entries(obj(doc.scenes))) {
    const index = arr(scene.beats).findIndex((beat) => beat && beat.id === id);
    if (index >= 0) return { sceneId, index, beat: scene.beats[index] };
  }
  return null;
}

// ---- 引用检查（删除前用）----
export function referencesTo(doc, id) {
  const refs = [];
  for (const [sceneId, scene] of Object.entries(obj(doc.scenes))) {
    if (obj(scene.participants)[id]) refs.push({ type: 'scene.participants', id: sceneId });
    if (obj(scene.props)[id]) refs.push({ type: 'scene.props', id: sceneId });
    if (scene.locationId === id) refs.push({ type: 'scene.locationId', id: sceneId });
    for (const [pid, ps] of Object.entries(obj(scene.props))) {
      if (ps && ps.holderId === id) refs.push({ type: 'scene.props.holderId', id: `${sceneId}/${pid}` });
    }
  }
  for (const [entityId, entity] of Object.entries(obj(doc.entities))) {
    if (entity.initialOwnerId === id) refs.push({ type: 'entity.initialOwnerId', id: entityId });
  }
  const outline = obj(doc.outline);
  const acts = outline.parts ? arr(outline.parts).flatMap((p) => arr(p.acts)) : arr(outline.acts);
  for (const act of acts) {
    if (arr(act.sceneIds).includes(id)) refs.push({ type: 'outline.sceneIds', id: act.id });
  }
  for (const relation of arr(doc.logicRelations)) {
    for (const key of ['source', 'target']) {
      if (relation[key] && relation[key].id === id) refs.push({ type: 'logicRelation', id: relation.id });
    }
  }
  for (const relation of arr(doc.characterRelations)) {
    if (relation.sourceCharacterId === id || relation.targetCharacterId === id) refs.push({ type: 'characterRelation', id: relation.id });
    if (arr(obj(relation.scope).sceneIds).includes(id)) refs.push({ type: 'characterRelation.scope', id: relation.id });
  }
  for (const [threadId, scene] of Object.entries(obj(doc.scenes))) {
    if (arr(scene.threadIds).includes(id)) refs.push({ type: 'scene.threadIds', id: threadId });
  }
  return refs;
}

// ---- 单项操作 ----
export function applyOperation(doc, op) {
  const kind = op && op.op;
  switch (kind) {
    case 'metadata.update': {
      doc.metadata = { ...obj(doc.metadata), ...obj(op.changes) };
      return;
    }
    case 'entity.create': {
      const value = clone(op.value);
      if (!value || !value.id) fail('op/invalid', 'entity.create 需要 value.id');
      if (doc.entities[value.id]) fail('op/duplicate-id', `实体已存在: ${value.id}`, { subject: { id: value.id } });
      doc.entities[value.id] = value;
      return;
    }
    case 'entity.update': {
      const entity = doc.entities[op.id];
      if (!entity) fail('op/missing', `实体不存在: ${op.id}`, { subject: { id: op.id } });
      Object.assign(entity, obj(op.changes));
      return;
    }
    case 'entity.delete': {
      if (!doc.entities[op.id]) fail('op/missing', `实体不存在: ${op.id}`, { subject: { id: op.id } });
      const refs = referencesTo(doc, op.id);
      if (refs.length) fail('delete/referenced', `实体仍被引用: ${op.id}`, { references: refs, subject: { id: op.id } });
      delete doc.entities[op.id];
      return;
    }
    case 'scene.create': {
      const value = clone(op.value);
      if (!value || !value.id) fail('op/invalid', 'scene.create 需要 value.id');
      if (doc.scenes[value.id]) fail('op/duplicate-id', `场景已存在: ${value.id}`, { subject: { id: value.id } });
      doc.scenes[value.id] = value;
      return;
    }
    case 'scene.update': {
      const scene = doc.scenes[op.id];
      if (!scene) fail('op/missing', `场景不存在: ${op.id}`, { subject: { id: op.id } });
      Object.assign(scene, obj(op.changes));
      return;
    }
    case 'scene.delete': {
      if (!doc.scenes[op.id]) fail('op/missing', `场景不存在: ${op.id}`, { subject: { id: op.id } });
      const refs = referencesTo(doc, op.id);
      if (refs.length) fail('delete/referenced', `场景仍被引用: ${op.id}`, { references: refs, subject: { id: op.id } });
      delete doc.scenes[op.id];
      return;
    }
    case 'beat.insert': {
      const scene = doc.scenes[op.sceneId];
      if (!scene) fail('op/missing', `场景不存在: ${op.sceneId}`, { subject: { id: op.sceneId } });
      const beat = clone(op.value);
      if (!beat || !beat.id) fail('op/invalid', 'beat.insert 需要 value.id');
      if (findBeat(doc, beat.id)) fail('op/duplicate-id', `节拍已存在: ${beat.id}`, { subject: { id: beat.id } });
      const index = Number.isInteger(op.index) ? op.index : scene.beats.length;
      scene.beats.splice(index, 0, beat);
      return;
    }
    case 'beat.update': {
      const found = findBeat(doc, op.id);
      if (!found) fail('op/missing', `节拍不存在: ${op.id}`, { subject: { id: op.id } });
      Object.assign(found.beat, obj(op.changes));
      return;
    }
    case 'beat.delete': {
      const found = findBeat(doc, op.id);
      if (!found) fail('op/missing', `节拍不存在: ${op.id}`, { subject: { id: op.id } });
      const refs = referencesTo(doc, op.id);
      if (refs.length) fail('delete/referenced', `节拍仍被引用: ${op.id}`, { references: refs, subject: { id: op.id } });
      doc.scenes[found.sceneId].beats.splice(found.index, 1);
      return;
    }
    case 'beat.move': {
      const found = findBeat(doc, op.id);
      if (!found) fail('op/missing', `节拍不存在: ${op.id}`, { subject: { id: op.id } });
      if (!doc.scenes[op.toSceneId]) fail('op/missing', `目标场景不存在: ${op.toSceneId}`, { subject: { id: op.toSceneId } });
      const [beat] = doc.scenes[found.sceneId].beats.splice(found.index, 1);
      const target = doc.scenes[op.toSceneId].beats;
      const index = Number.isInteger(op.index) ? op.index : target.length;
      target.splice(index, 0, beat);
      return;
    }
    case 'characterRelation.create': {
      const value = clone(op.value);
      if (!value || !value.id) fail('op/invalid', 'characterRelation.create 需要 value.id');
      if (arr(doc.characterRelations).some((r) => r.id === value.id)) fail('op/duplicate-id', `人物关系已存在: ${value.id}`, { subject: { id: value.id } });
      doc.characterRelations.push(value);
      return;
    }
    case 'characterRelation.update': {
      const relation = arr(doc.characterRelations).find((r) => r.id === op.id);
      if (!relation) fail('op/missing', `人物关系不存在: ${op.id}`, { subject: { id: op.id } });
      Object.assign(relation, obj(op.changes));
      return;
    }
    case 'characterRelation.delete': {
      const index = arr(doc.characterRelations).findIndex((r) => r.id === op.id);
      if (index < 0) fail('op/missing', `人物关系不存在: ${op.id}`, { subject: { id: op.id } });
      doc.characterRelations.splice(index, 1);
      return;
    }
    case 'outline.act.update': {
      const acts = doc.outline && doc.outline.parts ? arr(doc.outline.parts).flatMap((p) => arr(p.acts)) : arr(obj(doc.outline).acts);
      const act = acts.find((a) => a.id === op.id);
      if (!act) fail('op/missing', `幕不存在: ${op.id}`, { subject: { id: op.id } });
      Object.assign(act, obj(op.changes));
      return;
    }
    case 'outline.part.update': {
      const part = arr(obj(doc.outline).parts).find((p) => p.id === op.id);
      if (!part) fail('op/missing', `部不存在: ${op.id}`, { subject: { id: op.id } });
      Object.assign(part, obj(op.changes));
      return;
    }
    case 'thread.update': {
      const thread = obj(doc.threads)[op.id];
      if (!thread) fail('op/missing', `故事线不存在: ${op.id}`, { subject: { id: op.id } });
      Object.assign(thread, obj(op.changes));
      return;
    }
    case 'logicRelation.create': {
      const value = clone(op.value);
      if (!value || !value.id) fail('op/invalid', 'logicRelation.create 需要 value.id');
      if (arr(doc.logicRelations).some((r) => r.id === value.id)) fail('op/duplicate-id', `逻辑关系已存在: ${value.id}`, { subject: { id: value.id } });
      doc.logicRelations.push(value);
      return;
    }
    case 'logicRelation.update': {
      const relation = arr(doc.logicRelations).find((r) => r.id === op.id);
      if (!relation) fail('op/missing', `逻辑关系不存在: ${op.id}`, { subject: { id: op.id } });
      Object.assign(relation, obj(op.changes));
      return;
    }
    case 'logicRelation.delete': {
      const index = arr(doc.logicRelations).findIndex((r) => r.id === op.id);
      if (index < 0) fail('op/missing', `逻辑关系不存在: ${op.id}`, { subject: { id: op.id } });
      doc.logicRelations.splice(index, 1);
      return;
    }
    default:
      fail('op/unknown', `未知操作: ${kind}`, { subject: { op: kind } });
  }
}

// ---- 文本扫描与替换（全局推理）----
function replaceAll(text, pairs) {
  let out = String(text);
  for (const [from, to] of pairs) out = out.split(from).join(to);
  return out;
}

function textFields(doc) {
  const fields = [];
  const md = obj(doc.metadata);
  for (const key of ['title', 'logline', 'theme']) if (typeof md[key] === 'string') fields.push({ set: (v) => { md[key] = v; }, value: md[key] });
  for (const entity of Object.values(obj(doc.entities))) {
    for (const key of ['name', 'description', 'motivation', 'voiceDescription']) {
      if (typeof entity[key] === 'string') fields.push({ set: (v) => { entity[key] = v; }, value: entity[key] });
    }
    for (const [k, v] of Object.entries(obj(entity.fixedTraits))) {
      if (typeof v === 'string') fields.push({ set: (nv) => { entity.fixedTraits[k] = nv; }, value: v });
    }
  }
  for (const scene of Object.values(obj(doc.scenes))) {
    for (const key of ['title', 'summary', 'mood']) {
      if (typeof scene[key] === 'string') fields.push({ set: (v) => { scene[key] = v; }, value: scene[key] });
    }
    for (const beat of arr(scene.beats)) {
      if (typeof beat.text === 'string') fields.push({ set: (v) => { beat.text = v; }, value: beat.text });
    }
  }
  for (const relation of arr(doc.characterRelations)) {
    for (const key of ['kind', 'description']) if (typeof relation[key] === 'string') fields.push({ set: (v) => { relation[key] = v; }, value: relation[key] });
  }
  for (const relation of arr(doc.logicRelations)) {
    if (typeof relation.description === 'string') fields.push({ set: (v) => { relation.description = v; }, value: relation.description });
  }
  for (const thread of Object.values(obj(doc.threads))) {
    for (const key of ['name', 'description']) if (typeof thread[key] === 'string') fields.push({ set: (v) => { thread[key] = v; }, value: thread[key] });
  }
  const outline = obj(doc.outline);
  const outlineBlocks = outline.parts ? [...arr(outline.parts), ...arr(outline.parts).flatMap((p) => arr(p.acts))] : arr(outline.acts);
  for (const block of outlineBlocks) {
    for (const key of ['title', 'summary']) if (typeof block[key] === 'string') fields.push({ set: (v) => { block[key] = v; }, value: block[key] });
  }
  return fields;
}

export function textMentions(doc, names) {
  const found = [];
  for (const field of textFields(doc)) {
    if (names.some((name) => field.value.includes(name))) found.push(field.value);
  }
  return found;
}

function buildReplaceOps(doc, op) {
  const entity = doc.entities[op.entityId];
  if (!entity) fail('op/missing', `实体不存在: ${op.entityId}`, { subject: { id: op.entityId } });
  const newName = op.newName;
  if (!newName) fail('op/invalid', 'entity.replace 需要 newName');
  const aliases = [...new Set([entity.name, ...arr(op.aliases)].filter(Boolean))].sort((a, b) => b.length - a.length);
  const pairs = aliases.map((name) => [name, newName]);

  const ops = [];
  const entityChanges = {};
  for (const key of ['name', 'description', 'motivation', 'voiceDescription']) {
    if (typeof entity[key] === 'string' && (key === 'name' || aliases.some((a) => entity[key].includes(a)))) {
      entityChanges[key] = key === 'name' ? newName : replaceAll(entity[key], pairs);
    }
  }
  const traits = { ...obj(entity.fixedTraits) };
  let traitsChanged = false;
  for (const [k, v] of Object.entries(traits)) {
    if (typeof v === 'string' && aliases.some((a) => v.includes(a))) { traits[k] = replaceAll(v, pairs); traitsChanged = true; }
  }
  if (traitsChanged) entityChanges.fixedTraits = traits;
  ops.push({ op: 'entity.update', id: op.entityId, changes: entityChanges });

  for (const scene of Object.values(obj(doc.scenes))) {
    const changes = {};
    for (const key of ['title', 'summary', 'mood']) {
      if (typeof scene[key] === 'string' && aliases.some((a) => scene[key].includes(a))) changes[key] = replaceAll(scene[key], pairs);
    }
    if (Object.keys(changes).length) ops.push({ op: 'scene.update', id: scene.id, changes });
    for (const beat of arr(scene.beats)) {
      if (typeof beat.text === 'string' && aliases.some((a) => beat.text.includes(a))) {
        ops.push({ op: 'beat.update', id: beat.id, changes: { text: replaceAll(beat.text, pairs) } });
      }
    }
  }
  for (const relation of arr(doc.characterRelations)) {
    const changes = {};
    for (const key of ['kind', 'description']) {
      if (typeof relation[key] === 'string' && aliases.some((a) => relation[key].includes(a))) changes[key] = replaceAll(relation[key], pairs);
    }
    if (Object.keys(changes).length) ops.push({ op: 'characterRelation.update', id: relation.id, changes });
  }
  for (const relation of arr(doc.logicRelations)) {
    if (typeof relation.description === 'string' && aliases.some((a) => relation.description.includes(a))) {
      ops.push({ op: 'logicRelation.update', id: relation.id, changes: { description: replaceAll(relation.description, pairs) } });
    }
  }
  for (const thread of Object.values(obj(doc.threads))) {
    const changes = {};
    for (const key of ['name', 'description']) {
      if (typeof thread[key] === 'string' && aliases.some((a) => thread[key].includes(a))) changes[key] = replaceAll(thread[key], pairs);
    }
    if (Object.keys(changes).length) ops.push({ op: 'thread.update', id: thread.id, changes });
  }
  const outline = obj(doc.outline);
  const outlineActs = outline.parts ? arr(outline.parts).flatMap((p) => arr(p.acts)) : arr(outline.acts);
  for (const act of outlineActs) {
    const changes = {};
    for (const key of ['title', 'summary']) {
      if (typeof act[key] === 'string' && aliases.some((a) => act[key].includes(a))) changes[key] = replaceAll(act[key], pairs);
    }
    if (Object.keys(changes).length) ops.push({ op: 'outline.act.update', id: act.id, changes });
  }
  for (const part of arr(outline.parts)) {
    const changes = {};
    for (const key of ['title', 'summary']) {
      if (typeof part[key] === 'string' && aliases.some((a) => part[key].includes(a))) changes[key] = replaceAll(part[key], pairs);
    }
    if (Object.keys(changes).length) ops.push({ op: 'outline.part.update', id: part.id, changes });
  }
  const md = obj(doc.metadata);
  const mdChanges = {};
  for (const key of ['title', 'logline', 'theme']) {
    if (typeof md[key] === 'string' && aliases.some((a) => md[key].includes(a))) mdChanges[key] = replaceAll(md[key], pairs);
  }
  if (Object.keys(mdChanges).length) ops.push({ op: 'metadata.update', changes: mdChanges });
  return ops;
}

function collectChanged(set, op) {
  if (op.id) set.add(op.id);
  if (op.value && op.value.id) set.add(op.value.id);
  if (op.sceneId) set.add(op.sceneId);
  if (op.toSceneId) set.add(op.toSceneId);
  if (op.entityId) set.add(op.entityId);
}

// 顺序展开并应用（在传入的 doc 副本上就地修改）
export function runOperations(doc, operations) {
  const expanded = [];
  const changed = new Set();
  const queue = [...arr(operations)];
  while (queue.length) {
    const op = queue.shift();
    if (op && op.op === 'entity.replace') {
      queue.unshift(...buildReplaceOps(doc, op)); // 展开后逐一应用，届时记录
      continue;
    }
    applyOperation(doc, op);
    expanded.push(op);
    collectChanged(changed, op);
  }
  return { expanded, changedIds: [...changed] };
}

export { clone };
