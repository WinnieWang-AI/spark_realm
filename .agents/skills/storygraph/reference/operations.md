# ChangeSet 与操作参考

## ChangeSet 信封

```json
{
  "changeId": "唯一字符串（幂等键）",
  "storyId": "story_little_red",
  "baseRevision": 1,
  "actor": { "kind": "user|agent", "id": "codex" },
  "operations": [ /* 一条或多条 */ ]
}
```

- `baseRevision`：必须等于故事当前 `revision`，否则报 `change/conflict`。
- 同一 `changeId` + 相同操作重放 → 幂等返回原结果；携带不同操作 → 报 `change/duplicate-id`。
- 一批操作**要么全成功、要么全不改**。

## 操作集

| op | 参数 | 说明 |
| --- | --- | --- |
| `metadata.update` | `changes` | 改 title/logline/theme 等 |
| `entity.create` | `value`（含 id、kind、name…） | 新建人物/地点/道具 |
| `entity.update` | `id`, `changes` | 字段级部分更新 |
| `entity.delete` | `id` | 仍被引用则拒绝并返回引用清单 |
| `entity.replace` | `entityId`, `newName`, `aliases?` | **全局改名**：实体名 + 全篇正文提及（场景标题/摘要/氛围、节拍文本、人物/逻辑关系说明、故事线、幕摘要、元信息）一并替换 |
| `scene.create` | `value` | 新场景 |
| `scene.update` | `id`, `changes` | 改 title/summary/mood/participants/props/… |
| `scene.delete` | `id` | 仍被引用则拒绝 |
| `beat.insert` | `sceneId`, `index`, `value` | 插入节拍（id 全局唯一） |
| `beat.update` | `id`, `changes` | 改 text/speakerId/kind/tone |
| `beat.delete` | `id` | 仍被引用则拒绝 |
| `beat.move` | `id`, `toSceneId`, `index` | 移动节拍 |
| `characterRelation.create` | `value` | 人物关系 |
| `characterRelation.update` | `id`, `changes` | 改 kind/direction/scope/description |
| `characterRelation.delete` | `id` | |
| `logicRelation.create` | `value` | 场景/节拍逻辑关系（before/overlaps/causes/setsUp） |
| `logicRelation.update` | `id`, `changes` | |
| `logicRelation.delete` | `id` | |
| `thread.update` | `id`, `changes` | 故事线名称/说明 |
| `outline.act.update` / `outline.part.update` | `id`, `changes` | 幕/部的 title/summary |

## 常见错误码

- `change/invalid`：操作不合法，或应用后未通过结构校验（返回 `errors`）。
- `change/conflict`：`baseRevision` 过期（返回 `currentRevision`）。
- `change/duplicate-id`：同一 `changeId` 用于不同内容。
- `change/story-mismatch`：`storyId` 不一致。
- `delete/referenced`：删除对象仍被引用（返回 `references` 清单）。
- `op/missing`、`op/duplicate-id`、`op/unknown`：对象不存在 / ID 重复 / 未知操作。

## 规则

- 引用按稳定 ID，不会因改名自动级联；**正文文字**里的旧名需靠 `entity.replace` 或逐条 `beat.update` 处理。
- 删除前先看引用清单，在同一批里补清理操作。
- 硬校验（ID 唯一、引用存在、时序无环等）不通过则整批拒绝；软诊断（如动机不足）只提示，放行。

## 查看结果

本 Skill 只负责修改（`bin/store-cli.mjs`）。可视化查看器属于 SparkRealm 仓库（`tools/storygraph/render.mjs`、`serve.mjs`），不在本 Skill 内。
