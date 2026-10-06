# StoryDocument 结构速查

用于从零编写故事；写完必须用 `bin/store-cli.mjs validate` 校验。

## 顶层

```json
{
  "schemaVersion": 1,
  "storyId": "story_xxx",
  "revision": 1,
  "metadata": { "title": "标题", "logline": "一句话", "theme": "主题", "language": "zh-CN" },
  "entities": { "<id>": {...} },
  "scenes": { "<id>": {...} },
  "outline": { "acts": [ ... ] },
  "threads": { "<id>": { "id": "...", "name": "主线" } },
  "logicRelations": [ ... ],
  "characterRelations": [ ... ]
}
```

ID 全局唯一、稳定、不复用。前缀只为可读：`char_` / `loc_` / `prop_` / `scene_` / `beat_` / `act_` / `part_` / `thread_` / `cr_` / `lr_`。

## Entity

公共：`id`、`kind`（`character`|`location`|`prop`）、`name`、`description?`、`tags?[]`、`referenceImage?`。

- character：`fixedTraits?(map)`、`motivation?`、`voiceDescription?`

> **语言一致**：`fixedTraits` 的键与值、`tags`、关系 `kind` 等自由文本，都用**故事语言**（中文故事写中文），例如 `{ "物种": "兔子", "速度": "飞快", "性情": "轻敌自满" }`。**不要用英文键**（如 species/speed/temperament），否则界面会中英混排。
- location：`areas?[{ id, name, description }]`
- prop：`initialOwnerId?`（角色 id 或 null）

## Scene

```json
{
  "id": "scene_001", "title": "场景名", "summary": "情节概述",
  "locationId": "loc_x", "areaId": null,
  "time": { "period": "可选", "timeOfDay": "morning|midday|afternoon|evening|night" },
  "threadIds": ["thread_main"],
  "narrativeMode": "present|flashback|flashForward",
  "narrativeRole": "setup|turningPoint|climax|transition",
  "mood": "氛围",
  "participants": { "char_x": { "emotion": "", "goal": "", "knowledge": "", "appearance": "" } },
  "locationState": { "lighting": "", "weather": "", "condition": "" },
  "props": { "prop_x": { "appearance": "", "condition": "", "holderId": null } },
  "beats": [ ... ]
}
```

## Beat

`{ "id": "beat_0001", "kind": "action|dialogue|narration", "text": "...", "speakerId": "char_x", "tone": "..." }`
- `dialogue` 必须有 `speakerId`，且必须是**本场 participants** 之一。
- 旁白用 `kind: "narration"`，不要用 speakerId="narrator"。

## Outline

短故事：`{ "acts": [ { "id": "act_1", "title": "", "summary": "", "sceneIds": ["scene_001"] } ] }`
超长：`{ "parts": [ { "id": "part_1", "title": "", "acts": [ ... ] } ] }`（有 parts 时不要顶层 acts）。

## 关系

- 逻辑关系 `logicRelations`：`{ "id": "lr_x", "kind": "before|overlaps|causes|setsUp", "source": { "type": "scene|beat", "id": "..." }, "target": { ... }, "description": "" }`
- 人物关系 `characterRelations`：`{ "id": "cr_x", "sourceCharacterId": "char_a", "targetCharacterId": "char_b", "kind": "关系名", "direction": "directed|symmetric", "description": "", "scope": { "type": "global" } 或 { "type": "scenes", "sceneIds": ["scene_1"] } }`

## 硬校验要点（validate 会拦）

ID 唯一；引用存在（locationId/areaId/participants/props/holderId/threadIds/speakerId/outline.sceneIds/关系端点）；对话说话人在本场；before 子图无环；outline 无重复场景。软诊断（动机不足等）只提示，不拦。

最小起点见 `templates/story.template.json`。
