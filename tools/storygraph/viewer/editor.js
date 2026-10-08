// 交互编辑（仅在服务模式注入）。改动经 /apply 写回 story.json；布局经 /view 写回 view.json。
(function () {
  if (!window.__SERVED__ || !window.__storygraph) return;
  const api = window.__storygraph;
  const doc = () => window.__TELLING_DOC__;
  let editing = false;
  let lastSel = '__none__';

  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const send = (operations) => api.sendChange(operations);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 样式 ----------
  const style = document.createElement('style');
  style.textContent = `
    #sge-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9000;display:flex;gap:8px;align-items:center;
      background:#111a2ef2;border:1px solid #2a3a58;border-radius:12px;padding:8px 10px;box-shadow:0 10px 30px rgba(0,0,0,.45);
      font:13px/1 ui-sans-serif,system-ui,"PingFang SC",sans-serif;color:#e6edf7}
    #sge-bar button{background:#17233a;color:#e6edf7;border:1px solid #33456a;border-radius:8px;padding:7px 11px;cursor:pointer;font:inherit}
    #sge-bar button:hover{border-color:#ffd47a}
    #sge-bar button[disabled]{opacity:.4;cursor:default}
    #sge-bar .on{background:#3a2f12;border-color:#ffd47a;color:#ffd47a}
    #sge-panel{position:fixed;right:16px;top:64px;width:330px;max-height:78vh;overflow:auto;z-index:9000;
      background:#0f1830f2;border:1px solid #2a3a58;border-radius:12px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.45);
      font:13px/1.6 ui-sans-serif,system-ui,"PingFang SC",sans-serif;color:#e6edf7;display:none}
    #sge-panel h4{margin:0 0 10px;font-size:13px;color:#ffd47a}
    #sge-panel label{display:block;color:#93a3bd;font-size:12px;margin:8px 0 3px}
    #sge-panel input,#sge-panel textarea,#sge-panel select{width:100%;background:#0b1220;border:1px solid #2a3a58;border-radius:7px;
      color:#e6edf7;padding:6px 8px;font:inherit}
    #sge-panel textarea{min-height:64px;resize:vertical}
    #sge-panel .row{display:flex;gap:8px;margin-top:10px}
    #sge-panel .row button{flex:1;background:#17233a;color:#e6edf7;border:1px solid #33456a;border-radius:8px;padding:7px;cursor:pointer}
    #sge-panel .row button.danger{border-color:#7a2b2b;color:#ff9a9a}
    #sge-panel .row button:hover{border-color:#ffd47a}
    #sge-panel .muted{color:#93a3bd;font-size:12px}
    #sge-panel hr{border:0;border-top:1px solid #24324a;margin:12px 0}
    #sge-toast{position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:9001;background:#17233a;border:1px solid #33456a;
      border-radius:8px;padding:8px 12px;color:#e6edf7;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;display:none}
    .sge-drag{outline:2px solid #ffd47a;cursor:move}
  `;
  document.head.appendChild(style);

  // ---------- 工具条 ----------
  const bar = document.createElement('div');
  bar.id = 'sge-bar';
  bar.innerHTML = `
    <button id="sge-edit" type="button">✎ 编辑</button>
    <button id="sge-scene" type="button">＋场景</button>
    <button id="sge-entity" type="button">＋要素</button>
    <button id="sge-logic" type="button">＋逻辑关系</button>
    <button id="sge-charrel" type="button">＋人物关系</button>
    <button id="sge-undo" type="button">↶ 撤销</button>
    <button id="sge-redo" type="button">↷ 重做</button>
  `;
  document.body.appendChild(bar);

  const panel = document.createElement('div');
  panel.id = 'sge-panel';
  document.body.appendChild(panel);

  const toast = document.createElement('div');
  toast.id = 'sge-toast';
  document.body.appendChild(toast);
  const say = (m) => { toast.textContent = m; toast.style.display = 'block'; clearTimeout(say._t); say._t = setTimeout(() => { toast.style.display = 'none'; }, 2600); };

  const editBtn = document.getElementById('sge-edit');
  const undoBtn = document.getElementById('sge-undo');
  const redoBtn = document.getElementById('sge-redo');

  async function refreshHistory() {
    try {
      const s = await (await fetch('/state')).json();
      undoBtn.disabled = !s.canUndo; redoBtn.disabled = !s.canRedo;
    } catch (_) { /* ignore */ }
  }
  editBtn.addEventListener('click', () => {
    editing = !editing;
    editBtn.classList.toggle('on', editing);
    ['sge-scene', 'sge-entity', 'sge-logic', 'sge-charrel'].forEach((id) => { document.getElementById(id).disabled = !editing; });
    renderPanel();
  });
  undoBtn.addEventListener('click', async () => { await fetch('/undo', { method: 'POST' }); window.__storygraphReload?.(); location.reload(); });
  redoBtn.addEventListener('click', async () => { await fetch('/redo', { method: 'POST' }); window.__storygraphReload?.(); location.reload(); });
  document.getElementById('sge-scene').disabled = true;
  document.getElementById('sge-entity').disabled = true;
  document.getElementById('sge-logic').disabled = true;
  document.getElementById('sge-charrel').disabled = true;

  document.getElementById('sge-logic').addEventListener('click', () => {
    const source = prompt('源场景 ID（如 scene_001）'); if (!source) return;
    const target = prompt('目标 ID（场景或节拍）'); if (!target) return;
    const kind = prompt('类型：before / overlaps / causes / setsUp', 'before') || 'before';
    send([{ op: 'logicRelation.create', value: { id: uid('lr'), kind, source: { type: 'scene', id: source }, target: { type: 'scene', id: target } } }]);
  });
  document.getElementById('sge-charrel').addEventListener('click', () => {
    const a = prompt('人物 A 的 ID'); if (!a) return;
    const b = prompt('人物 B 的 ID'); if (!b) return;
    const kind = prompt('关系类型（如 亲友/对手）', '亲友') || '亲友';
    send([{ op: 'characterRelation.create', value: { id: uid('cr'), sourceCharacterId: a, targetCharacterId: b, kind, direction: 'symmetric', scope: { type: 'global' } } }]);
  });

  // ---------- 增删 ----------
  document.getElementById('sge-scene').addEventListener('click', () => {
    const id = uid('scene');
    send([{ op: 'scene.create', value: { id, title: '新场景', summary: '', narrativeMode: 'present', narrativeRole: 'setup', threadIds: [], participants: {}, props: {}, beats: [] } }]);
  });
  document.getElementById('sge-entity').addEventListener('click', () => {
    const id = uid('char');
    send([{ op: 'entity.create', value: { id, kind: 'character', name: '新人物', description: '', tags: [] } }]);
  });

  // ---------- 选择变化 → 渲染面板 ----------
  function selectedKey() {
    const s = api.getState().selected;
    return s ? `${s.type}:${s.id}` : 'none';
  }
  setInterval(() => {
    if (!editing) return;
    const k = selectedKey();
    if (k !== lastSel) { lastSel = k; renderPanel(); }
  }, 250);

  function field(label, value, onCommit, { area = false } = {}) {
    const wrap = document.createElement('div');
    const l = document.createElement('label'); l.textContent = label;
    const input = document.createElement(area ? 'textarea' : 'input');
    input.value = value ?? '';
    input.addEventListener('change', () => onCommit(input.value));
    wrap.append(l, input);
    return wrap;
  }

  function renderPanel() {
    if (!editing) { panel.style.display = 'none'; return; }
    const d = doc();
    const s = api.getState().selected;
    if (!s) { panel.style.display = 'block'; panel.innerHTML = '<h4>编辑</h4><div class="muted">在图谱中点选一个场景 / 要素 / 关系开始编辑。</div>'; return; }
    panel.style.display = 'block';

    if (s.type === 'scene') return renderScene(d, s.id);
    if (s.type === 'entity') return renderEntity(d, s.id);
    if (s.type === 'beat') return renderBeat(d, s.id);
    if (s.type === 'relation') return renderLogicRelation(d, s.id);
    if (s.type === 'characterRelation') return renderCharacterRelation(d, s.id);
    panel.innerHTML = '<h4>编辑</h4><div class="muted">该类型暂不支持编辑。</div>';
  }

  function renderScene(d, id) {
    const sc = d.scenes[id];
    panel.innerHTML = '';
    const h = document.createElement('h4'); h.textContent = `场景 · ${id}`; panel.appendChild(h);
    panel.appendChild(field('标题', sc.title, (v) => send([{ op: 'scene.update', id, changes: { title: v } }])));
    panel.appendChild(field('概要', sc.summary, (v) => send([{ op: 'scene.update', id, changes: { summary: v } }]), { area: true }));
    panel.appendChild(field('氛围', sc.mood, (v) => send([{ op: 'scene.update', id, changes: { mood: v } }])));

    const hr = document.createElement('hr'); panel.appendChild(hr);
    const beatsH = document.createElement('div'); beatsH.className = 'muted'; beatsH.textContent = `节拍（${(sc.beats || []).length}）`; panel.appendChild(beatsH);
    (sc.beats || []).forEach((b) => {
      const wrap = document.createElement('div');
      wrap.appendChild(field(`${b.kind} · ${b.id}`, b.text, (v) => send([{ op: 'beat.update', id: b.id, changes: { text: v } }]), { area: true }));
      const row = document.createElement('div'); row.className = 'row';
      const del = document.createElement('button'); del.className = 'danger'; del.textContent = '删除节拍';
      del.addEventListener('click', () => send([{ op: 'beat.delete', id: b.id }]));
      row.appendChild(del); wrap.appendChild(row);
      panel.appendChild(wrap);
    });
    const addRow = document.createElement('div'); addRow.className = 'row';
    const add = document.createElement('button'); add.textContent = '＋节拍';
    add.addEventListener('click', () => send([{ op: 'beat.insert', sceneId: id, value: { id: uid('beat'), kind: 'action', text: '新节拍' } }]));
    addRow.appendChild(add); panel.appendChild(addRow);

    const hr2 = document.createElement('hr'); panel.appendChild(hr2);
    const row2 = document.createElement('div'); row2.className = 'row';
    const delScene = document.createElement('button'); delScene.className = 'danger'; delScene.textContent = '删除场景';
    delScene.addEventListener('click', () => { if (confirm(`删除场景 ${id}？`)) send([{ op: 'scene.delete', id }]); });
    row2.appendChild(delScene); panel.appendChild(row2);
  }

  function renderEntity(d, id) {
    const e = d.entities[id];
    panel.innerHTML = '';
    const h = document.createElement('h4'); h.textContent = `要素 · ${id}`; panel.appendChild(h);
    panel.appendChild(field('名称（会同步更新所有引用）', e.name, (v) => { if (v && v !== e.name) send([{ op: 'entity.replace', entityId: id, newName: v }]); }));
    panel.appendChild(field('描述', e.description, (v) => send([{ op: 'entity.update', id, changes: { description: v } }]), { area: true }));
    panel.appendChild(field('动机', e.motivation, (v) => send([{ op: 'entity.update', id, changes: { motivation: v } }])));

    const hr = document.createElement('hr'); panel.appendChild(hr);
    const row = document.createElement('div'); row.className = 'row';
    const del = document.createElement('button'); del.className = 'danger'; del.textContent = '删除要素';
    del.addEventListener('click', () => { if (confirm(`删除要素 ${id}？`)) send([{ op: 'entity.delete', id }]); });
    row.appendChild(del); panel.appendChild(row);
  }

  function renderBeat(d, id) {
    let beat = null; let sceneId = null;
    for (const [sid, sc] of Object.entries(d.scenes)) { const b = (sc.beats || []).find((x) => x.id === id); if (b) { beat = b; sceneId = sid; break; } }
    panel.innerHTML = '';
    const h = document.createElement('h4'); h.textContent = `节拍 · ${id}`; panel.appendChild(h);
    if (!beat) { panel.appendChild(Object.assign(document.createElement('div'), { className: 'muted', textContent: '未找到。' })); return; }
    panel.appendChild(field('类型', beat.kind, (v) => send([{ op: 'beat.update', id, changes: { kind: v } }])));
    panel.appendChild(field('文本', beat.text, (v) => send([{ op: 'beat.update', id, changes: { text: v } }]), { area: true }));
    const row = document.createElement('div'); row.className = 'row';
    const del = document.createElement('button'); del.className = 'danger'; del.textContent = '删除节拍';
    del.addEventListener('click', () => send([{ op: 'beat.delete', id }]));
    row.appendChild(del); panel.appendChild(row);
  }

  function renderLogicRelation(d, id) {
    const r = (d.logicRelations || []).find((x) => x.id === id);
    panel.innerHTML = '';
    const h = document.createElement('h4'); h.textContent = `逻辑关系 · ${id}`; panel.appendChild(h);
    if (!r) { panel.appendChild(Object.assign(document.createElement('div'), { className: 'muted', textContent: '未找到。' })); return; }
    panel.appendChild(field('类型（before/overlaps/causes/setsUp）', r.kind, (v) => send([{ op: 'logicRelation.update', id, changes: { kind: v } }])));
    panel.appendChild(field('说明', r.description, (v) => send([{ op: 'logicRelation.update', id, changes: { description: v } }]), { area: true }));
    const row = document.createElement('div'); row.className = 'row';
    const del = document.createElement('button'); del.className = 'danger'; del.textContent = '删除关系';
    del.addEventListener('click', () => send([{ op: 'logicRelation.delete', id }]));
    row.appendChild(del); panel.appendChild(row);
  }

  function renderCharacterRelation(d, id) {
    const r = (d.characterRelations || []).find((x) => x.id === id);
    panel.innerHTML = '';
    const h = document.createElement('h4'); h.textContent = `人物关系 · ${id}`; panel.appendChild(h);
    if (!r) { panel.appendChild(Object.assign(document.createElement('div'), { className: 'muted', textContent: '未找到。' })); return; }
    panel.appendChild(field('类型', r.kind, (v) => send([{ op: 'characterRelation.update', id, changes: { kind: v } }])));
    panel.appendChild(field('说明', r.description, (v) => send([{ op: 'characterRelation.update', id, changes: { description: v } }]), { area: true }));
    const row = document.createElement('div'); row.className = 'row';
    const del = document.createElement('button'); del.className = 'danger'; del.textContent = '删除关系';
    del.addEventListener('click', () => send([{ op: 'characterRelation.delete', id }]));
    row.appendChild(del); panel.appendChild(row);
  }

  // ---------- 拖动布局并保存 ----------
  const svgNS = 'http://www.w3.org/2000/svg';
  function bindDrag() {
    const svg = [...document.querySelectorAll('.story-svg')].find((s) => s.dataset.mode === 'telling');
    if (!svg) return;
    let drag = null;
    svg.addEventListener('pointerdown', (event) => {
      if (!editing) return;
      const g = event.target.closest('.graph-node[data-node-type="scene"]');
      if (!g) return;
      event.stopPropagation(); event.preventDefault();
      const ctm = svg.getScreenCTM(); if (!ctm) return;
      const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      const m = /translate\(([-\d.]+)\s+([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
      const ox = m ? Number(m[1]) : 0, oy = m ? Number(m[2]) : 0;
      drag = { g, ox, oy, px: pt.x, py: pt.y };
      g.classList.add('sge-drag'); g.parentNode.appendChild(g);
      g.setPointerCapture(event.pointerId);
    }, true);
    svg.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const ctm = svg.getScreenCTM(); if (!ctm) return;
      const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      drag.g.setAttribute('transform', `translate(${drag.ox + (pt.x - drag.px)} ${drag.oy + (pt.y - drag.py)})`);
    });
    svg.addEventListener('pointerup', async () => {
      if (!drag) return;
      drag.g.classList.remove('sge-drag');
      const nodePositions = {};
      svg.querySelectorAll('.graph-node[data-node-type="scene"]').forEach((g) => {
        const m = /translate\(([-\d.]+)\s+([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
        if (m) nodePositions[g.dataset.nodeId] = { x: Number(m[1]), y: Number(m[2]) };
      });
      drag = null;
      try {
        const cur = await (await fetch('/view')).json();
        await fetch('/view', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...cur, nodePositions }) });
        say('布局已保存');
      } catch (_) { say('布局保存失败'); }
    });
  }

  window.__storygraphReload = () => { lastSel = '__none__'; };
  refreshHistory();
  setInterval(refreshHistory, 3000);
  bindDrag();
})();
