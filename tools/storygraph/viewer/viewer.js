(function () {
  const data = window.__STORYGRAPH__;
  const svgs = [...document.querySelectorAll('.story-svg')];
  const body = document.body;
  const state = {
    mode: '', lastLogicMode: 'telling', selected: null, relationScene: 'all', fitted: false, history: [], restoring: false,
    relationKinds: { telling: new Set(), time: new Set() },
    entityKinds: new Set(['character', 'location', 'prop']),
  };
  const view = new Map();
  const S = (window.__I18N__ && window.__I18N__.strings) || {};
  const isEn = (window.__I18N__ && window.__I18N__.locale) === 'en';
  const t = (key, params) => {
    let out = S[key] != null ? S[key] : key;
    if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
  const TYPES = { character: 'kind_character', location: 'kind_location', prop: 'kind_prop' };
  const BEATS = { action: 'beat_action', dialogue: 'beat_dialogue', narration: 'beat_narration' };
  const RELS = { before: 'rel_before', overlaps: 'rel_overlaps', causes: 'rel_causes', setsUp: 'rel_setsUp' };
  const traitLabel = (key) => (isEn ? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : TRAIT_LABELS[key]);
  const TRAIT_LABELS = {
    age: '年龄', hair: '发型', signatureLook: '标志外观', look: '外观', appearance: '外观',
    body: '体型', build: '体型', size: '体形', features: '面容特征', face: '面容', personality: '性格',
    temperament: '性情', condition: '状态', wardrobe: '着装', costume: '服装', traits: '特征',
    gender: '性别', role: '角色定位', species: '物种', speed: '速度', color: '颜色', colour: '颜色',
    habitat: '栖息地', ability: '能力', voice: '嗓音', occupation: '职业', age_range: '年龄段',
  };
  const HELP = { telling: 'help_telling', time: 'help_time', charmap: 'help_charmap' };
  const MINI = { w: 144, h: 96, pad: 5 };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => `<svg class="icon"><use href="#icon-${name}"/></svg>`;
  const activeSvg = () => svgs.find((svg) => svg.dataset.mode === state.mode);
  const entity = (id) => data.entities[id] || {};
  const nameOf = (id) => entity(id).name || id;
  const typeName = (kind) => t(TYPES[kind] || kind);
  const beatName = (kind) => t(BEATS[kind] || kind);
  const relName = (kind) => t(RELS[kind] || kind);
  const sceneTitle = (id) => data.scenes[id]?.title || id;
  const sceneLabel = (id) => { const n = data.tellingIndex[id]; return n == null ? sceneTitle(id) : `${String(n + 1).padStart(2, '0')} ${sceneTitle(id)}`; };
  const beatOf = (id) => data.beats.find((beat) => beat.id === id);

  for (const svg of svgs) {
    const full = (svg.getAttribute('viewBox') || '0 0 100 100').split(/\s+/).map(Number);
    view.set(svg, { x: full[0], y: full[1], w: full[2], h: full[3], full: { x: full[0], y: full[1], w: full[2], h: full[3] } });
  }

  function status(message) { document.getElementById('status').textContent = message; }
  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.title = `${data.title} · SparkRealm StoryGraph`;
  }

  // ---- 编辑：提交 ChangeSet 并保留视角 ----
  function saveSession() {
    try {
      const views = {};
      for (const svg of svgs) { const v = view.get(svg); views[svg.dataset.mode] = { x: v.x, y: v.y, w: v.w, h: v.h }; }
      sessionStorage.setItem('sparkrealm-view', JSON.stringify({ mode: state.mode, selected: state.selected, relationScene: state.relationScene, views }));
    } catch (_) { /* ignore */ }
  }
  function restoreSession() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('sparkrealm-view') || 'null'); } catch (_) { saved = null; }
    if (!saved) return;
    try { sessionStorage.removeItem('sparkrealm-view'); } catch (_) { /* ignore */ }
    if (saved.relationScene) state.relationScene = saved.relationScene;
    if (saved.mode) setMode(saved.mode);
    for (const svg of svgs) { const s = saved.views && saved.views[svg.dataset.mode]; if (s) Object.assign(view.get(svg), { x: s.x, y: s.y, w: s.w, h: s.h }); }
    if (saved.selected) select(saved.selected.type, saved.selected.id);
    applyView(activeSvg());
  }
  async function sendChange(operations) {
    if (!window.__SERVED__) return;
    saveSession();
    const changeSet = { changeId: `ui_${Date.now()}`, storyId: data.storyId, baseRevision: data.revision, actor: { kind: 'user', id: 'local' }, operations };
    try {
      const response = await fetch('/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ changeSet }) });
      const out = await response.json();
      if (out.ok) location.reload();
      else alert(`${t('reject_prefix')}${out.error || ''}${out.message ? ' - ' + out.message : ''}`);
    } catch (error) { alert(`${t('submit_failed')}${error.message}`); }
  }
  function updateBack() { const button = document.getElementById('detail-back'); if (button) button.disabled = state.history.length === 0; }
  function pushHistory() {
    state.history.push({ mode: state.mode, selected: state.selected ? { ...state.selected } : null });
    updateBack();
  }
  function goBack() {
    const prev = state.history.pop();
    updateBack();
    if (!prev) return;
    state.restoring = true;
    if (prev.mode && prev.mode !== state.mode) setMode(prev.mode);
    state.restoring = false;
    if (prev.selected) select(prev.selected.type, prev.selected.id, true);
    else clearSelection();
  }
  function navigateTo(mode, type, id, focus = false) {
    const same = state.selected && state.selected.type === type && state.selected.id === id && (!mode || mode === state.mode);
    if (!same && !state.restoring) pushHistory();
    if (mode && mode !== state.mode) setMode(mode);
    select(type, id, focus);
  }
  function canvasSize() {
    const rect = document.getElementById('canvas').getBoundingClientRect();
    const width = Math.max(320, rect.width), height = Math.max(240, rect.height);
    return { width, height, ratio: width / height };
  }
  function applyView(svg) {
    const current = view.get(svg);
    svg.setAttribute('viewBox', `${current.x} ${current.y} ${current.w} ${current.h}`);
    if (svg === activeSvg()) {
      document.getElementById('zoom-reset').textContent = `${Math.round((canvasSize().width / current.w) * 100)}%`;
      renderMinimap();
    }
  }
  function readableView() {
    const svg = activeSvg(), current = view.get(svg), canvas = canvasSize();
    const width = Math.max(canvas.width, Math.min(current.full.w, canvas.width / 0.88)); // 图比画布窄时按 100% 显示
    current.w = width; current.h = width / canvas.ratio;
    current.x = current.full.x;
    current.y = current.full.y;
    applyView(svg);
  }
  function fitAll() {
    const svg = activeSvg(), current = view.get(svg), canvas = canvasSize();
    const graphRatio = current.full.w / current.full.h;
    if (graphRatio > canvas.ratio) {
      current.w = current.full.w; current.h = current.w / canvas.ratio;
      current.x = current.full.x; current.y = current.full.y - (current.h - current.full.h) / 2;
    } else {
      current.h = current.full.h; current.w = current.h * canvas.ratio;
      current.y = current.full.y; current.x = current.full.x - (current.w - current.full.w) / 2;
    }
    applyView(svg);
  }
  function zoom(factor, center) {
    const svg = activeSvg(), current = view.get(svg);
    const nextWidth = Math.min(Math.max(current.full.w * 2.4, 280), Math.max(280, current.w * factor));
    const actual = nextWidth / current.w;
    const point = center || { x: current.x + current.w / 2, y: current.y + current.h / 2 };
    current.x = point.x - (point.x - current.x) * actual;
    current.y = point.y - (point.y - current.y) * actual;
    current.w = nextWidth; current.h *= actual; applyView(svg);
  }
  function focusNode(id, force = false) {
    const rect = data.geoms[state.mode]?.rects?.[id];
    if (!rect) return;
    const svg = activeSvg(), current = view.get(svg), canvas = canvasSize();
    const pad = 40;
    const inside = rect.x >= current.x + pad && rect.y >= current.y + pad
      && rect.x + rect.w <= current.x + current.w - pad && rect.y + rect.h <= current.y + current.h - pad;
    if (inside && !force) return; // 已在视野内则不调整
    if (force) { // 仅主动“定位”时才改变缩放：放大到可读比例
      current.w = Math.min(current.full.w, Math.max(520, canvas.width / 0.92));
      current.h = current.w / canvas.ratio;
    }
    // 其余情况保持当前缩放，只平移到可见
    current.x = rect.x + rect.w / 2 - current.w / 2;
    current.y = rect.y + rect.h / 2 - current.h / 2;
    applyView(svg);
  }

  function renderOutline() {
    const acts = data.actsFlat.length ? data.actsFlat : [{ id: 'all', title: t('all_scenes'), sceneIds: data.order }];
    document.getElementById('scene-count').textContent = t('scenes_count', { n: data.stats.scenes });
    document.getElementById('outline').innerHTML = acts.map((act) => `<details class="act" open><summary>${esc(act.title || act.id)}</summary>${(act.sceneIds || []).map((id) => {
      if (!data.scenes[id]) return '';
      const number = data.tellingIndex[id] == null ? '—' : String(data.tellingIndex[id] + 1).padStart(2, '0');
      return `<button class="scene-item" data-scene="${esc(id)}"><span class="item-number">${number}</span><span>${esc(sceneTitle(id))}</span></button>`;
    }).join('')}</details>`).join('');
    document.querySelectorAll('.scene-item').forEach((button) => button.addEventListener('click', () => navigateTo(null, 'scene', button.dataset.scene, true)));
  }
  function renderEntities() {
    document.getElementById('entities').innerHTML = Object.entries(TYPES).map(([kind, label]) => {
      const list = data.entitiesByKind[kind] || [];
      return list.length ? `<details class="entity-group" open><summary>${esc(t(label))} · ${list.length}</summary>${list.map((item) => `<button class="entity-item" data-entity="${esc(item.id)}"><span>${esc(item.name)}</span><span class="count">${esc(t('scenes_count', { n: item.scenes.length }))}</span></button>`).join('')}</details>` : '';
    }).join('');
    document.querySelectorAll('.entity-item').forEach((button) => button.addEventListener('click', () => navigateTo('charmap', 'entity', button.dataset.entity, true)));
  }
  function renderFilters() {
    const target = document.getElementById('legend');
    target.innerHTML = state.mode === 'charmap'
      ? Object.entries(TYPES).map(([kind, label]) => `<label class="filter-label"><input type="checkbox" data-entity-kind="${kind}" ${state.entityKinds.has(kind) ? 'checked' : ''}>${esc(t(label))}</label>`).join('')
        + `<label class="filter-label"><input type="checkbox" data-showedges>${esc(t('show_edges'))}</label>`
      : Object.entries(RELS).map(([kind, label]) => `<label class="filter-label"><input type="checkbox" data-relation-kind="${kind}" ${state.relationKinds[state.mode].has(kind) ? 'checked' : ''}><span class="line-swatch ${kind}"></span>${esc(t(label))}</label>`).join('');
    target.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => {
      if (input.hasAttribute('data-showedges')) { svgs.forEach((svg) => svg.classList.toggle('show-edges', input.checked)); return; }
      const set = input.dataset.entityKind ? state.entityKinds : state.relationKinds[state.mode];
      const value = input.dataset.entityKind || input.dataset.relationKind;
      input.checked ? set.add(value) : set.delete(value); applyFilters();
    }));
  }
  function renderRelationScope() {
    const select = document.getElementById('relation-scope');
    select.innerHTML = `<option value="all">${esc(t('scope_all'))}</option>${data.order.map((id) => `<option value="${esc(id)}">${data.tellingIndex[id] + 1}. ${esc(sceneTitle(id))}</option>`).join('')}`;
    select.value = state.relationScene;
  }
  function applyFilters() {
    for (const svg of svgs) {
      svg.querySelectorAll('.logic-edge').forEach((edge) => {
        const visible = state.mode === svg.dataset.mode && state.relationKinds[state.mode]?.has(edge.dataset.kind);
        edge.classList.toggle('filter-off', !visible); edge.classList.toggle('visible', visible);
      });
      svg.querySelectorAll('.entity').forEach((node) => node.classList.toggle('type-off', !state.entityKinds.has(node.dataset.kind)));
      svg.querySelectorAll('.part-edge').forEach((edge) => edge.classList.toggle('type-off', !state.entityKinds.has(edge.dataset.kind)));
      svg.querySelectorAll('.pair-edge').forEach((edge) => {
        const relation = data.characterRelations.find((item) => item.id === edge.dataset.relationId);
        edge.classList.toggle('scope-off', state.relationScene !== 'all' && !relation?.sceneIds.includes(state.relationScene));
      });
    }
    renderMinimap();
  }

  function clearMarks() {
    svgs.forEach((svg) => svg.querySelectorAll('.selected,.neighbor,.hot,.dim,.hover-show').forEach((node) => node.classList.remove('selected', 'neighbor', 'hot', 'dim', 'hover-show')));
    document.querySelectorAll('.scene-item,.entity-item').forEach((item) => item.classList.remove('active'));
  }
  function openDetail() {
    body.classList.add('right-open'); document.getElementById('right-panel').inert = false;
    document.getElementById('toggle-right').setAttribute('aria-expanded', 'true');
  }
  function closeDetail() {
    body.classList.remove('right-open'); document.getElementById('right-panel').inert = true;
    document.getElementById('toggle-right').setAttribute('aria-expanded', 'false');
  }
  function clearSelection() {
    state.selected = null; clearMarks();
    document.getElementById('focus').disabled = true; document.getElementById('clear-selection').hidden = true;
    document.getElementById('detail').innerHTML = `<p>${esc(t('hint'))}</p>`; closeDetail();
  }
  function select(type, id, shouldFocus = false) {
    state.selected = { type, id }; clearMarks();
    const svg = activeSvg();
    svg.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.classList.add('selected');
    if (type === 'scene') {
      document.querySelectorAll(`.scene-item[data-scene="${CSS.escape(id)}"]`).forEach((item) => item.classList.add('active'));
      if (state.mode === 'charmap') {
        svg.querySelectorAll('.part-edge').forEach((edge) => {
          if (edge.dataset.source === id) { edge.classList.add('hot'); svg.querySelector(`[data-node-id="${CSS.escape(edge.dataset.target)}"]`)?.classList.add('neighbor'); }
        });
        state.relationScene = id; document.getElementById('relation-scope').value = id; applyFilters();
      } else {
        svg.querySelectorAll('.logic-edge').forEach((edge) => {
          if (edge.dataset.source === id || edge.dataset.target === id) {
            edge.classList.add('visible', 'hot');
            svg.querySelector(`[data-node-id="${CSS.escape(edge.dataset.source === id ? edge.dataset.target : edge.dataset.source)}"]`)?.classList.add('neighbor');
          }
        });
      }
      renderSceneDetail(id);
    } else if (type === 'entity') {
      document.querySelectorAll(`.entity-item[data-entity="${CSS.escape(id)}"]`).forEach((item) => item.classList.add('active'));
      svg.querySelectorAll('.part-edge').forEach((edge) => {
        if (edge.dataset.target === id) { edge.classList.add('hot'); svg.querySelector(`[data-node-id="${CSS.escape(edge.dataset.source)}"]`)?.classList.add('neighbor'); }
      });
      svg.querySelectorAll('.pair-edge').forEach((edge) => { if (edge.dataset.source === id || edge.dataset.target === id) edge.classList.add('hot'); });
      renderEntityDetail(id);
    } else if (type === 'beat') {
      const beat = beatOf(id);
      if (beat) { svg.querySelector(`[data-node-id="${CSS.escape(beat.sceneId)}"]`)?.classList.add('selected'); renderBeatDetail(id); }
    }
    openDetail();
    document.getElementById('focus').disabled = !['scene', 'entity'].includes(type);
    document.getElementById('clear-selection').hidden = false;
    if (shouldFocus) focusNode(type === 'beat' ? beatOf(id)?.sceneId : id);
    status(t('selected', { x: type === 'entity' ? nameOf(id) : type === 'beat' ? t('beat_label') : sceneLabel(id) }));
  }

  function changeOf(pair, sid) {
    const scenes = data.order;
    const factsById = new Map(pair.facts.map((fact) => [fact.id, fact]));
    const activeAt = (s) => (pair.perScene[s] || []).map((fid) => factsById.get(fid)).filter(Boolean);
    const idx = scenes.indexOf(sid);
    const prevSid = idx > 0 ? scenes[idx - 1] : null;
    const current = [...new Set(activeAt(sid).map((fact) => fact.kind))];
    const previous = prevSid ? [...new Set(activeAt(prevSid).map((fact) => fact.kind))] : [];
    const reasons = [...new Set(activeAt(sid).filter((fact) => !previous.includes(fact.kind)).map((fact) => fact.description).filter(Boolean))];
    const reason = reasons.length ? reasons.join('；') : (data.scenes[sid]?.summary || '');
    return { from: previous.join('、'), to: current.join('、'), reason };
  }

  function relationChain(pair) {
    const factsById = new Map(pair.facts.map((fact) => [fact.id, fact]));
    const seq = [];
    let prev = null;
    for (const sid of data.order) {
      const kinds = [...new Set((pair.perScene[sid] || []).map((fid) => factsById.get(fid)).filter(Boolean).map((fact) => fact.kind))];
      if (!kinds.length) continue; // 未声明关系的场次不参与
      const joined = kinds.join('、');
      if (joined !== prev) { seq.push(joined); prev = joined; }
    }
    return seq.join(' → ');
  }

  function relationEvents(pair) {
    if (!pair) return '';
    return pair.changePoints.map((sid) => {
      const { from, to, reason } = changeOf(pair, sid);
      const label = from ? `${from} → ${to}` : to;
      return `<button type="button" class="evo-event" data-jump-scene="${esc(sid)}" data-pair="${esc(pair.key)}"><b>${esc(sceneLabel(sid))}</b><span class="evo-transition">${esc(label)}</span>${reason ? `<span class="evo-reason">${esc(t('reason_prefix'))}${esc(reason)}</span>` : ''}</button><div class="evo-preview" hidden></div>`;
    }).join('');
  }

  function scenePreviewHtml(sid) {
    const s = data.scenes[sid];
    if (!s) return '';
    const loc = s.locationId ? entity(s.locationId) : null;
    const people = Object.entries(s.participants || {}).map(([cid, st]) => `${nameOf(cid)}${st.emotion ? `（${st.emotion}）` : ''}`).join('、') || t('unspecified');
    const beats = (s.beats || []).map((b) => `<div class="preview-beat"><b>${esc(beatName(b.kind))}</b>${esc(b.text)}</div>`).join('');
    return `<div class="row">${esc(s.summary || '')}</div>
      <div class="row"><b>${esc(t('sec_location'))}</b>　${esc(loc ? loc.name : t('unspecified'))}</div>
      <div class="row"><b>${esc(t('sec_characters'))}</b>　${esc(people)}</div>${beats}`;
  }
  function toggleEvoPreview(button, sid) {
    let box = button.nextElementSibling;
    if (!box || !box.classList.contains('evo-preview')) { box = document.createElement('div'); box.className = 'evo-preview'; button.after(box); }
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = scenePreviewHtml(sid);
  }
  function highlightSceneInCharmap(sid) {
    svgs.forEach((svg) => svg.querySelectorAll('.selected,.neighbor,.hot,.dim,.hover-show').forEach((n) => n.classList.remove('selected', 'neighbor', 'hot', 'dim', 'hover-show')));
    const svg = activeSvg();
    const ents = new Set(Object.entries(data.entityScenes).filter(([, sids]) => sids.includes(sid)).map(([e]) => e));
    svg.querySelectorAll('.rscene').forEach((n) => n.classList.toggle('selected', n.dataset.nodeId === sid));
    svg.querySelectorAll('.char-node').forEach((n) => { if (ents.has(n.dataset.nodeId)) n.classList.add('selected'); else n.classList.add('dim'); });
    svg.querySelectorAll('.part-edge').forEach((e) => { if (e.dataset.scene === sid) e.classList.add('hot'); else e.classList.add('dim'); });
    document.querySelectorAll('.scene-item').forEach((el) => el.classList.toggle('active', el.dataset.scene === sid));
  }

  function relationText(relation) {
    const arrow = relation.direction === 'directed' ? '→' : '↔';
    const scope = relation.scopeType === 'global' ? t('scope_global') : t('scope_scenes', { n: relation.sceneIds.length });
    return `<div class="relation-item"><b>${esc(relation.sourceName)}</b> ${arrow} <b>${esc(relation.targetName)}</b>：${esc(relation.kind)}<span class="scope-label">${scope}${relation.description ? ` · ${esc(relation.description)}` : ''}</span></div>`;
  }
  function edgeText(edge) {
    const endpoint = (part) => part.type === 'scene' ? sceneLabel(part.id) : (beatOf(part.id)?.text || part.id);
    return `<div class="relation-item"><b>${esc(relName(edge.kind))}</b>：${esc(endpoint(edge.source))} → ${esc(endpoint(edge.target))}${edge.description ? `<span class="scope-label">${esc(edge.description)}</span>` : ''}</div>`;
  }
  function bindDetailActions() {
    const panel = document.getElementById('detail');
    panel.querySelectorAll('[data-jump-scene]:not([data-pair])').forEach((button) => button.addEventListener('click', () => navigateTo('telling', 'scene', button.dataset.jumpScene, true)));
    panel.querySelectorAll('[data-pair][data-jump-scene]').forEach((button) => button.addEventListener('click', () => {
      const sid = button.dataset.jumpScene;
      if (state.mode === 'charmap') { highlightSceneInCharmap(sid); toggleEvoPreview(button, sid); }
      else { navigateTo('telling', 'scene', sid, true); }
    }));
    panel.querySelectorAll('[data-jump-entity]').forEach((button) => button.addEventListener('click', () => navigateTo('charmap', 'entity', button.dataset.jumpEntity, true)));
    panel.querySelectorAll('[data-beat]').forEach((button) => button.addEventListener('click', () => navigateTo(null, 'beat', button.dataset.beat)));
    panel.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => navigateScene(Number(button.dataset.nav))));
    panel.querySelectorAll('[data-edit-scene-title]').forEach((button) => button.addEventListener('click', () => {
      const sid = button.dataset.editSceneTitle;
      const current = (data.scenes[sid] && data.scenes[sid].title) || sid;
      const title = prompt(t('prompt_scene_title'), current);
      if (title && title !== current) sendChange([{ op: 'scene.update', id: sid, changes: { title } }]);
    }));
    panel.querySelectorAll('[data-edit-entity-name]').forEach((button) => button.addEventListener('click', () => {
      const eid = button.dataset.editEntityName;
      const current = nameOf(eid);
      const name = prompt(t('prompt_entity_name'), current);
      if (name && name !== current) sendChange([{ op: 'entity.replace', entityId: eid, newName: name, aliases: [current] }]);
    }));
  }
  function refRow(id, state) {
    return `<div class="ref-row"><button class="jump" data-jump-entity="${esc(id)}">${esc(nameOf(id))}</button>${state ? `<span class="ref-state">：${esc(state)}</span>` : ''}</div>`;
  }

  function renderSceneDetail(id) {
    const scene = data.scenes[id], index = data.order.indexOf(id);
    const location = scene.locationId ? entity(scene.locationId) : null;
    const area = location && scene.areaId ? (location.areas || []).find((item) => item.id === scene.areaId) : null;
    const locRow = location ? refRow(scene.locationId, area ? area.name : '') : `<div class="row">${esc(t('unspecified'))}</div>`;
    const people = Object.entries(scene.participants || {}).map(([personId, value]) => {
      const detail = [value.emotion, value.goal, value.knowledge, value.appearance].filter(Boolean).join('；');
      return refRow(personId, detail);
    }).join('') || `<div class="row">${esc(t('unspecified'))}</div>`;
    const props = Object.entries(scene.props || {}).map(([propId, value]) => {
      const holder = value && Object.hasOwn(value, 'holderId') ? (value.holderId == null ? t('holder_none') : t('holder_by', { x: nameOf(value.holderId) })) : '';
      const detail = [value?.condition, value?.appearance, holder].filter(Boolean).join('；');
      return refRow(propId, detail);
    }).join('') || `<div class="row">${esc(t('unspecified'))}</div>`;
    const beats = (scene.beats || []).map((beat) => `<button class="beat-item" data-beat="${esc(beat.id)}"><b>${esc(beatName(beat.kind))}${beat.kind === 'dialogue' && beat.speakerId ? ` · ${esc(nameOf(beat.speakerId))}` : ''}</b>${esc(beat.text)}</button>`).join('') || `<div class="row">${esc(t('no_beats'))}</div>`;
    const logic = data.edges.filter((edge) => edge.sourceScene === id || edge.targetScene === id).map(edgeText).join('') || `<div class="row">${esc(t('no_logic'))}</div>`;
    const relations = data.characterRelations.filter((relation) => relation.sceneIds.includes(id)).map(relationText).join('') || `<div class="row">${esc(t('no_relations'))}</div>`;
    const changesHere = data.relationsByPair.filter((pair) => pair.changePoints.includes(id));
    const changeHtml = changesHere.map((pair) => {
      const { from, to, reason } = changeOf(pair, id);
      const label = from ? `${from} → ${to}` : to;
      return `<div class="evo-event"><b>${esc(nameOf(pair.a))} ⇄ ${esc(nameOf(pair.b))}</b><span class="evo-transition">${esc(label)}</span>${reason ? `<span class="evo-reason">${esc(t('reason_prefix'))}${esc(reason)}</span>` : ''}</div>`;
    }).join('') || `<div class="row">${esc(t('no_rel_change'))}</div>`;
    const sceneTime = data.sceneTime && data.sceneTime[id];
    const timeLabel = data.timeKnown.includes(id) ? `${t('time_point', { n: (data.layer[id] || 0) + 1 })}${sceneTime ? `（${sceneTime}）` : ''}` : (sceneTime ? `${t('time_unknown_detail')}（${sceneTime}）` : t('time_unknown_detail'));
    document.getElementById('detail').innerHTML = `<div class="scene-nav"><button data-nav="-1" ${index <= 0 ? 'disabled' : ''}>${icon('chevron-left')}${esc(t('prev'))}</button><button data-nav="1" ${index < 0 || index >= data.order.length - 1 ? 'disabled' : ''}>${esc(t('next'))}${icon('chevron-right')}</button></div>
      <h3>${esc(scene.title || id)}${window.__SERVED__ ? ` <button class="edit-btn" data-edit-scene-title="${esc(id)}">${esc(t('rename'))}</button>` : ''}</h3><div class="sub">${esc(t('scene_index', { n: index + 1 }))} · ${timeLabel}${data.inverted.includes(id) ? ' · ' + esc(t('nonlinear')) : ''}</div><p>${esc(scene.summary || t('summary_detail_tbd'))}</p>
      <h4>${esc(t('sec_location'))}</h4>${locRow}
      <h4>${esc(t('sec_mood'))}</h4><div class="row">${esc(scene.mood || t('unspecified'))}</div>
      <h4>${esc(t('sec_thread'))}</h4><div class="row">${(scene.threadIds || []).map((threadId) => `<span class="tag">${esc(data.threads[threadId]?.name || threadId)}</span>`).join('') || esc(t('unspecified'))}</div>
      <h4>${esc(t('sec_characters'))}</h4>${people}<h4>${esc(t('sec_props'))}</h4>${props}
      <details open><summary>${esc(t('sec_beats'))} · ${(scene.beats || []).length}</summary>${beats}</details>
      <details><summary>${esc(t('sec_logic'))}</summary>${logic}</details>
      <details><summary>${esc(t('sec_relations'))}</summary>${relations}</details>
      <details ${changesHere.length ? 'open' : ''}><summary>${esc(t('sec_rel_change'))} · ${changesHere.length}</summary>${changeHtml}</details>`;
    bindDetailActions();
  }
  function renderBeatDetail(id) {
    const beat = beatOf(id); if (!beat) return;
    const logic = data.edges.filter((edge) => edge.source.id === id || edge.target.id === id).map(edgeText).join('') || `<div class="row">${esc(t('no_logic'))}</div>`;
    document.getElementById('detail').innerHTML = `<button class="jump" data-jump-scene="${esc(beat.sceneId)}">${icon('chevron-left')} ${esc(t('back'))} ${esc(sceneLabel(beat.sceneId))}</button>
      <h3>${esc(beatName(beat.kind))}</h3><div class="sub">${esc(t('sec_beats'))}</div>
      ${beat.kind === 'dialogue' ? `<div class="row"><b>${esc(t('speaker'))}</b>　<button class="jump" data-jump-entity="${esc(beat.speakerId)}">${esc(nameOf(beat.speakerId))}</button>${beat.tone ? ` · ${esc(beat.tone)}` : ''}</div>` : ''}
      <p>${esc(beat.text)}</p><h4>${esc(t('related_logic'))}</h4>${logic}`;
    bindDetailActions();
  }
  function renderEntityDetail(id) {
    const item = entity(id), appearances = data.entityScenes[id] || [];
    const traits = Object.entries(item.fixedTraits || {}).map(([key, value]) => `<div class="row"><b>${esc(traitLabel(key) || key)}</b>　${esc(value)}</div>`).join('');
    const pairs = data.relationsByPair.filter((pair) => pair.a === id || pair.b === id);
    document.getElementById('detail').innerHTML = `<h3>${item.referenceImage ? `<img class="ref-thumb" src="${esc(item.referenceImage)}" alt="">` : ''}${esc(item.name || id)}${window.__SERVED__ ? ` <button class="edit-btn" data-edit-entity-name="${esc(id)}">${esc(t('rename'))}</button>` : ''}</h3>
      <div class="sub">${esc(typeName(item.kind))} · ${esc(t('appears_count', { n: appearances.length }))}</div>${item.description ? `<p>${esc(item.description)}</p>` : ''}
      ${(item.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}${traits ? `<h4>${esc(t('traits'))}</h4>${traits}` : ''}${item.motivation ? `<div class="row"><b>${esc(t('motive'))}</b>　${esc(item.motivation)}</div>` : ''}
      ${pairs.length ? `<details open><summary>${esc(t('relations_title'))} · ${pairs.length}</summary>${pairs.map((pair) => {
        const other = pair.a === id ? pair.b : pair.a;
        const chain = relationChain(pair);
        const events = relationEvents(pair);
        const head = `${esc(t('pair_with'))} <button class="jump" data-jump-entity="${esc(other)}">${esc(nameOf(other))}</button>${chain ? `<span class="pair-chain">${esc(chain)}</span>` : ''}`;
        return events ? `<details class="pair-block"><summary>${head}</summary>${events}</details>` : `<div class="pair-block static">${head}</div>`;
      }).join('')}</details>` : ''}
      <details open><summary>${esc(t('appears_in'))} · ${appearances.length}</summary>${appearances.map((sceneId) => {
        const number = data.tellingIndex[sceneId] == null ? '—' : String(data.tellingIndex[sceneId] + 1).padStart(2, '0');
        return `<div class="scene-appearance"><button class="jump" data-jump-scene="${esc(sceneId)}"><span class="item-number">${number}</span><b>${esc(sceneTitle(sceneId))}</b></button><p>${esc(data.scenes[sceneId].summary || '')}</p></div>`;
      }).join('') || `<div class="row">${esc(t('not_appeared'))}</div>`}</details>`;
    bindDetailActions();
  }
  function navigateScene(delta) {
    const currentId = state.selected?.type === 'scene' ? state.selected.id : beatOf(state.selected?.id)?.sceneId;
    const next = data.order[data.order.indexOf(currentId) + delta]; if (next) navigateTo(null, 'scene', next, true);
  }
  function setMode(mode) {
    const changed = state.mode !== mode;
    state.mode = mode;
    if (mode === 'telling' || mode === 'time') state.lastLogicMode = mode;
    svgs.forEach((svg) => svg.classList.toggle('active', svg.dataset.mode === mode));
    const logicView = mode !== 'charmap';
    document.querySelectorAll('[data-view]').forEach((tab) => {
      const active = (tab.dataset.view === 'logic') === logicView; tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    });
    const layoutToggle = document.getElementById('layout-toggle');
    layoutToggle.hidden = !logicView;
    layoutToggle.textContent = mode === 'time' ? t('to_telling') : t('to_time');
    document.getElementById('mode-context').textContent = t(HELP[mode]);
    document.getElementById('relation-scope-wrap').hidden = mode !== 'charmap';
    document.getElementById('story-count').textContent = t('story_count', { n: data.stats.scenes, m: data.stats.entities });
    renderFilters(); applyFilters();
    if (state.selected) {
      const valid = mode === 'charmap' ? ['scene', 'entity'] : ['scene', 'beat'];
      valid.includes(state.selected.type) ? select(state.selected.type, state.selected.id) : clearSelection();
    }
    if (changed) readableView(); // 切换视图时按画布比例重新适配（选择/跳转不改缩放）
  }
  function setView(view) { const mode = view === 'charmap' ? 'charmap' : state.lastLogicMode || 'telling'; if (mode !== state.mode) pushHistory(); setMode(mode); }

  function bindCanvas() {
    for (const svg of svgs) {
      svg.addEventListener('wheel', (event) => {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        const current = view.get(svg);
        if (event.ctrlKey || event.metaKey) {
          // 缩放：Ctrl/⌘ + 滚轮（或触控板双指缩放）
          zoom(event.deltaY > 0 ? 1.12 : 1 / 1.12, { x: current.x + ((event.clientX - rect.left) / rect.width) * current.w, y: current.y + ((event.clientY - rect.top) / rect.height) * current.h });
        } else {
          // 平移：滚轮上下、Shift+滚轮或横向滚动左右
          const unitX = current.w / rect.width;
          const unitY = current.h / rect.height;
          current.x += (event.shiftKey ? event.deltaY : event.deltaX) * unitX;
          current.y += (event.shiftKey ? 0 : event.deltaY) * unitY;
          applyView(svg);
        }
      }, { passive: false });
      let drag = null;
      svg.addEventListener('pointerdown', (event) => {
        if (event.target.closest('[data-node-id],.logic-edge,.pair-edge')) return;
        drag = { x: event.clientX, y: event.clientY, view: { ...view.get(svg) } };
        svg.setPointerCapture(event.pointerId); svg.classList.add('panning');
      });
      svg.addEventListener('pointermove', (event) => {
        if (!drag) return; const rect = svg.getBoundingClientRect(), current = view.get(svg);
        current.x = drag.view.x - (event.clientX - drag.x) * (drag.view.w / rect.width);
        current.y = drag.view.y - (event.clientY - drag.y) * (drag.view.h / rect.height); applyView(svg);
      });
      const stop = () => { drag = null; svg.classList.remove('panning'); };
      svg.addEventListener('pointerup', stop); svg.addEventListener('pointercancel', stop);
      svg.addEventListener('click', (event) => {
        const node = event.target.closest('[data-node-id]'); if (node) return navigateTo(null, node.dataset.nodeType, node.dataset.nodeId);
        const logic = event.target.closest('.logic-edge'); if (logic) { pushHistory(); return renderLogicDetail(logic.dataset.edgeId); }
        const relation = event.target.closest('.pair-edge'); if (relation) { pushHistory(); return renderCharacterRelationDetail(relation.dataset.relationId); }
      });
      svg.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return; event.preventDefault();
        const node = event.target.closest('[data-node-id]'); if (node) navigateTo(null, node.dataset.nodeType, node.dataset.nodeId);
      });
      svg.addEventListener('mouseover', (event) => {
        const node = event.target.closest('[data-node-id]'); if (!node) return;
        const id = node.dataset.nodeId;
        svg.querySelectorAll('.logic-edge, .part-edge, .pair-edge').forEach((edge) => {
          if (edge.dataset.source === id || edge.dataset.target === id) edge.classList.add('hover-show');
        });
      });
      svg.addEventListener('mouseout', (event) => {
        if (event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('[data-node-id]')) return;
        svg.querySelectorAll('.hover-show').forEach((edge) => edge.classList.remove('hover-show'));
      });
    }
  }
  function renderLogicDetail(id) {
    const edge = data.edges.find((item) => item.id === id); if (!edge) return;
    state.selected = { type: 'relation', id }; openDetail();
    document.getElementById('detail').innerHTML = `<h3>${esc(relName(edge.kind))}</h3><div class="sub">${esc(t('edge_detail_title'))}</div>${edgeText(edge)}`;
  }
  function renderCharacterRelationDetail(id) {
    const relation = data.characterRelations.find((item) => item.id === id); if (!relation) return;
    state.selected = { type: 'characterRelation', id }; openDetail();
    document.getElementById('detail').innerHTML = `<h3>${esc(relation.kind)}</h3><div class="sub">${esc(t('charrel_detail_title'))}</div>${relationText(relation)}<h4>${esc(t('scope'))}</h4>${relation.sceneIds.map((sceneId) => `<div class="row"><button class="jump" data-jump-scene="${esc(sceneId)}">${esc(sceneLabel(sceneId))}</button></div>`).join('')}`;
    bindDetailActions();
  }
  function renderMinimap() {
    const container = document.getElementById('minimap'), geom = data.geoms[state.mode], svg = activeSvg(); if (!geom || !svg) return;
    const scale = Math.min((MINI.w - MINI.pad * 2) / geom.w, (MINI.h - MINI.pad * 2) / geom.h);
    const ox = MINI.pad + (MINI.w - MINI.pad * 2 - geom.w * scale) / 2, oy = MINI.pad + (MINI.h - MINI.pad * 2 - geom.h * scale) / 2, current = view.get(svg);
    const nodes = geom.nodes.map((rect) => `<rect x="${ox + rect.x * scale}" y="${oy + rect.y * scale}" width="${Math.max(1, rect.w * scale)}" height="${Math.max(1, rect.h * scale)}" rx="1"/>`).join('');
    container.innerHTML = `<svg viewBox="0 0 ${MINI.w} ${MINI.h}" width="${MINI.w}" height="${MINI.h}">${nodes}<rect class="vp" x="${ox + current.x * scale}" y="${oy + current.y * scale}" width="${current.w * scale}" height="${current.h * scale}"/></svg>`;
  }

  function searchItems(query) {
    const q = query.toLocaleLowerCase(), results = [];
    for (const [id, scene] of Object.entries(data.scenes)) if (`${scene.title || ''} ${scene.summary || ''} ${id}`.toLocaleLowerCase().includes(q)) results.push({ type: 'scene', id, label: sceneLabel(id), detail: scene.summary || t('scene_word') });
    for (const beat of data.beats) if (`${beat.text} ${beat.id}`.toLocaleLowerCase().includes(q)) results.push({ type: 'beat', id: beat.id, label: beat.text, detail: `${t('beat_label')} · ${sceneLabel(beat.sceneId)}` });
    for (const [id, item] of Object.entries(data.entities)) if (`${item.name || ''} ${item.description || ''} ${(item.tags || []).join(' ')} ${id}`.toLocaleLowerCase().includes(q)) results.push({ type: 'entity', id, label: item.name || id, detail: typeName(item.kind) });
    return results.slice(0, 12);
  }
  function renderSearch(query) {
    const panel = document.getElementById('search-results'), input = document.getElementById('search');
    if (!query.trim()) { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    const results = searchItems(query.trim());
    panel.innerHTML = results.length ? results.map((result, index) => `<button class="search-result${index === 0 ? ' active' : ''}" data-result-type="${result.type}" data-result-id="${esc(result.id)}"><span class="result-type">${esc(result.detail)}</span><span class="result-text">${esc(result.label)}</span></button>`).join('') : `<div class="search-empty">${esc(t('search_no_match'))}</div>`;
    panel.hidden = false; input.setAttribute('aria-expanded', 'true');
    panel.querySelectorAll('.search-result').forEach((button) => button.addEventListener('click', () => chooseSearchResult(button)));
  }
  function chooseSearchResult(button) {
    const type = button.dataset.resultType; navigateTo(type === 'entity' ? 'charmap' : 'telling', type, button.dataset.resultId, true);
    document.getElementById('search-results').hidden = true; document.getElementById('search').setAttribute('aria-expanded', 'false');
  }
  function bindControls() {
    document.querySelectorAll('[data-view]').forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
    document.getElementById('layout-toggle').addEventListener('click', () => { pushHistory(); setMode(state.mode === 'time' ? 'telling' : 'time'); });
    document.getElementById('detail-back').addEventListener('click', goBack);
    document.getElementById('zoom-in').addEventListener('click', () => zoom(1 / 1.18));
    document.getElementById('zoom-out').addEventListener('click', () => zoom(1.18));
    document.getElementById('zoom-reset').addEventListener('click', readableView);
    document.getElementById('fit').addEventListener('click', fitAll);
    document.getElementById('focus').addEventListener('click', () => focusNode(state.selected?.type === 'beat' ? beatOf(state.selected.id)?.sceneId : state.selected?.id, true));
    document.getElementById('clear-selection').addEventListener('click', clearSelection);
    document.getElementById('close-detail').addEventListener('click', closeDetail);
    document.getElementById('toggle-right').addEventListener('click', () => body.classList.contains('right-open') ? closeDetail() : openDetail());
    document.getElementById('toggle-left').addEventListener('click', () => {
      body.classList.toggle('left-closed'); const open = !body.classList.contains('left-closed');
      document.getElementById('toggle-left').setAttribute('aria-expanded', String(open)); requestAnimationFrame(readableView);
    });
    document.getElementById('theme').addEventListener('click', () => {
      const root = document.documentElement; root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('sparkrealm-theme', root.dataset.theme); } catch (_) {}
    });
    document.getElementById('relation-scope').addEventListener('change', (event) => { state.relationScene = event.target.value; applyFilters(); });
    const search = document.getElementById('search');
    search.addEventListener('input', () => renderSearch(search.value));
    search.addEventListener('keydown', (event) => {
      const results = [...document.querySelectorAll('.search-result')];
      if (event.key === 'Enter' && results.length) { event.preventDefault(); chooseSearchResult(results.find((item) => item.classList.contains('active')) || results[0]); }
    });
    document.addEventListener('pointerdown', (event) => { if (!event.target.closest('.search-wrap')) document.getElementById('search-results').hidden = true; });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { if (!document.getElementById('search-results').hidden) document.getElementById('search-results').hidden = true; else clearSelection(); }
      if (event.target.matches('input,select,button')) return;
      if (event.key === 'ArrowRight') navigateScene(1); if (event.key === 'ArrowLeft') navigateScene(-1);
    });
    document.getElementById('minimap').addEventListener('click', (event) => {
      const geom = data.geoms[state.mode], rect = event.currentTarget.getBoundingClientRect();
      const scale = Math.min((MINI.w - MINI.pad * 2) / geom.w, (MINI.h - MINI.pad * 2) / geom.h);
      const ox = MINI.pad + (MINI.w - MINI.pad * 2 - geom.w * scale) / 2, oy = MINI.pad + (MINI.h - MINI.pad * 2 - geom.h * scale) / 2, current = view.get(activeSvg());
      current.x = (event.clientX - rect.left - ox) / scale - current.w / 2; current.y = (event.clientY - rect.top - oy) / scale - current.h / 2; applyView(activeSvg());
    });
    window.addEventListener('resize', () => applyView(activeSvg()));
  }

  try { const theme = localStorage.getItem('sparkrealm-theme'); if (['dark', 'light'].includes(theme)) document.documentElement.dataset.theme = theme; } catch (_) {}
  applyStaticI18n(); renderOutline(); renderEntities(); renderRelationScope(); bindCanvas(); bindControls();
  document.getElementById('empty-state').hidden = data.stats.scenes !== 0;
  document.getElementById('detail').innerHTML = `<p>${esc(t('hint'))}</p>`;
  if (window.matchMedia('(max-width: 700px)').matches) {
    body.classList.add('left-closed');
    document.getElementById('toggle-left').setAttribute('aria-expanded', 'false');
  }

  setMode('telling');
  restoreSession();

  // 服务模式：轮询 revision，外部（Agent 经 CLI）改动后自动刷新并保留视角
  if (window.__SERVED__) {
    const last = data.revision;
    setInterval(async () => {
      try {
        const response = await fetch('/state');
        const state = await response.json();
        if (state.revision !== last) { saveSession(); location.reload(); }
      } catch (_) { /* 忽略网络错误 */ }
    }, 2000);
  }

  window.__storygraph = {
    sendChange,
    getState: () => ({ mode: state.mode, revision: data.revision, selected: state.selected, served: Boolean(window.__SERVED__) }),
  };
})();
