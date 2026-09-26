// 查看器 UI 文案（中/英）。作者内容不在此翻译；仅界面标签。
const DICT = {
  'zh-CN': {
    // 通用分类
    kind_character: '人物', kind_location: '地点', kind_prop: '道具',
    beat_action: '动作', beat_dialogue: '对白', beat_narration: '旁白',
    rel_before: '先后', rel_overlaps: '同时', rel_causes: '因果', rel_setsUp: '伏笔',
    role_setup: '铺垫', role_turningPoint: '转折', role_climax: '高潮', role_transition: '过渡',
    mode_flashback: '闪回', mode_flashForward: '闪前',
    // 图节点（render/layout）
    unplaced: '未编排', location_tbd: '地点未定', summary_tbd: '情节待补充', people_tbd: '人物未定',
    beats_count: '{n} 个节拍', appears_count: '{n} 场出现',
    aria_telling: '讲述顺序图', aria_time: '故事时间图', aria_charmap: '要素关系图',
    layout_saved: '已保存布局', time_point: '时间点 {n}', time_unknown: '先后未定',
    // 查看器
    help_telling: '按观众看到的顺序阅读，灰线表示连续场景。',
    help_time: '只呈现已明确的时间先后；没有约束的场景归入“先后未定”。',
    help_charmap: '查看人物、地点和道具在哪些场景出现，以及人物关系如何变化。',
    scenes_count: '{n} 场', show_edges: '显示连线', scope_all: '全部变化',
    hint: '选择一个场景或故事要素，查看完整内容及其关联。',
    selected: '{x} 已选择', unspecified: '未指定', none: '—',
    holder_none: '无人持有', holder_by: '由 {x} 持有',
    scope_global: '全篇有效', scope_scenes: '{n} 场有效',
    rename: '改名', prompt_scene_title: '新的场景标题', prompt_entity_name: '新的名称',
    no_beats: '尚无节拍', no_logic: '尚无显式逻辑关系', no_relations: '本场没有人物关系记录',
    no_rel_change: '本场没有关系变化', time_unknown_detail: '故事时间先后未定',
    scene_index: '第 {n} 场', nonlinear: '非线性讲述', prev: '上一场', next: '下一场',
    sec_location: '地点', sec_mood: '氛围', sec_thread: '故事线', sec_characters: '人物',
    sec_props: '道具', sec_beats: '场景节拍', sec_logic: '故事逻辑',
    sec_relations: '本场人物关系', sec_rel_change: '本场关系变化',
    speaker: '说话人', related_logic: '相关逻辑',
    traits: '固定设定', motive: '动机', relations_title: '人物关系', appears_in: '出现的场景',
    not_appeared: '尚未出场', scope: '生效场景',
    edge_detail_title: '故事逻辑关系', charrel_detail_title: '人物关系',
    to_time: '切换为故事时间', to_telling: '切换为讲述顺序',
    story_count: '{n} 场 · {m} 个要素',
    search_placeholder: '搜索故事', search_no_match: '没有匹配内容', scene_word: '场景',
    beat_label: '节拍', reason_prefix: '原因：', pair_with: '与',
    // 模板静态
    nav_outline: '故事大纲', nav_entities: '故事要素', nav_plot: '故事情节',
    tab_logic: '故事逻辑', tab_charmap: '要素关系',
    title_theme: '切换主题', title_toggle_left: '显示或收起目录', title_toggle_right: '显示或收起详情',
    title_zoom_out: '缩小', title_zoom_reset: '恢复可读缩放', title_zoom_in: '放大',
    title_fit: '查看全图', title_focus: '定位所选节点', clear_selection: '清除选择',
    story_detail: '故事详情', title_back: '返回上一处', title_close: '关闭详情',
    relation_scope_label: '关系时点', empty_state: '故事尚无场景',
    aria_search: '搜索场景、节拍或要素', aria_workspace: '图谱视图', aria_views: '故事视图',
    aria_canvas: '故事图谱画布', aria_zoom: '画布缩放', aria_minimap: '图谱缩略图', aria_detail: '故事详情',
    validation_failed: '校验失败',
    reject_prefix: '修改被拒绝：', submit_failed: '提交失败：', all_scenes: '全部场景',
    summary_detail_tbd: '情节概述待补充', back: '返回',
  },
  en: {
    kind_character: 'Character', kind_location: 'Location', kind_prop: 'Prop',
    beat_action: 'Action', beat_dialogue: 'Dialogue', beat_narration: 'Narration',
    rel_before: 'Sequence', rel_overlaps: 'Overlap', rel_causes: 'Causality', rel_setsUp: 'Setup',
    role_setup: 'Setup', role_turningPoint: 'Turning point', role_climax: 'Climax', role_transition: 'Transition',
    mode_flashback: 'Flashback', mode_flashForward: 'Flash-forward',
    unplaced: 'Unplaced', location_tbd: 'Location TBD', summary_tbd: 'Summary TBD', people_tbd: 'Characters TBD',
    beats_count: '{n} beats', appears_count: 'in {n} scenes',
    aria_telling: 'Telling-order graph', aria_time: 'Story-time graph', aria_charmap: 'Element-relations graph',
    layout_saved: 'Saved layout', time_point: 'Time point {n}', time_unknown: 'Time unknown',
    help_telling: 'Read in the order the audience sees; grey lines connect consecutive scenes.',
    help_time: 'Only explicit story-time order; scenes without constraints go to "Time unknown".',
    help_charmap: 'See which scenes each character, location and prop appears in, and how relationships change.',
    scenes_count: '{n} scenes', show_edges: 'Show edges', scope_all: 'All changes',
    hint: 'Select a scene or an element to see its details and relations.',
    selected: '{x} selected', unspecified: 'Unspecified', none: '—',
    holder_none: 'No holder', holder_by: 'Held by {x}',
    scope_global: 'Global', scope_scenes: 'Active in {n} scenes',
    rename: 'Rename', prompt_scene_title: 'New scene title', prompt_entity_name: 'New name',
    no_beats: 'No beats yet', no_logic: 'No explicit logic relations yet', no_relations: 'No character relations in this scene',
    no_rel_change: 'No relationship change in this scene', time_unknown_detail: 'Story-time order unknown',
    scene_index: 'Scene {n}', nonlinear: 'non-linear telling', prev: 'Prev scene', next: 'Next scene',
    sec_location: 'Location', sec_mood: 'Mood', sec_thread: 'Thread', sec_characters: 'Characters',
    sec_props: 'Props', sec_beats: 'Beats', sec_logic: 'Story logic',
    sec_relations: 'Character relations (this scene)', sec_rel_change: 'Relationship changes (this scene)',
    speaker: 'Speaker', related_logic: 'Related logic',
    traits: 'Fixed traits', motive: 'Motivation', relations_title: 'Character relations', appears_in: 'Appears in',
    not_appeared: 'Not appeared yet', scope: 'Active scenes',
    edge_detail_title: 'Story logic relation', charrel_detail_title: 'Character relation',
    to_time: 'Switch to story time', to_telling: 'Switch to telling order',
    story_count: '{n} scenes · {m} elements',
    search_placeholder: 'Search story', search_no_match: 'No matches', scene_word: 'scene',
    beat_label: 'Beat', reason_prefix: 'Why: ', pair_with: 'with',
    nav_outline: 'Outline', nav_entities: 'Entities', nav_plot: 'Plot',
    tab_logic: 'Story logic', tab_charmap: 'Element relations',
    title_theme: 'Toggle theme', title_toggle_left: 'Show/hide outline', title_toggle_right: 'Show/hide details',
    title_zoom_out: 'Zoom out', title_zoom_reset: 'Reset zoom', title_zoom_in: 'Zoom in',
    title_fit: 'Fit to view', title_focus: 'Focus selected', clear_selection: 'Clear selection',
    story_detail: 'Details', title_back: 'Back', title_close: 'Close details',
    relation_scope_label: 'Relation at', empty_state: 'No scenes yet',
    aria_search: 'Search scenes, beats or elements', aria_workspace: 'Graph view', aria_views: 'Story views',
    aria_canvas: 'Story graph canvas', aria_zoom: 'Canvas zoom', aria_minimap: 'Graph minimap', aria_detail: 'Story details',
    validation_failed: 'validation failed',
    reject_prefix: 'Change rejected: ', submit_failed: 'Submit failed: ', all_scenes: 'All scenes',
    summary_detail_tbd: 'Summary TBD', back: 'Back',
  },
};

export function localeOf(story, override) {
  if (override) return DICT[override] ? override : 'en';
  const lang = (story && story.metadata && story.metadata.language) || '';
  return String(lang).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function stringsFor(locale) {
  return DICT[locale] || DICT['zh-CN'];
}

export function makeT(locale) {
  const s = stringsFor(locale);
  return (key, params) => {
    let out = s[key] != null ? s[key] : key;
    if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}
