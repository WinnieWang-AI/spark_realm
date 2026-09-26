---
name: storygraph
description: "Create and edit a SparkRealm story (StoryGraph). Use when the user wants to (a) build a story from a conversation - characters, scenes, outline, beats - into a validated StoryDocument, or (b) modify an existing story, such as renaming characters/props/locations, changing scene titles/summaries/mood, adding or deleting beats or relations, fixing dialogue speakers, and global changes like renaming one entity across the whole story. For edits, always preview with plan and apply only after the user confirms."
---

# StoryGraph Skill（创建 + 编辑）

两个能力：
- **从零创建**：把与用户的对话整理成一份**结构化的故事（StoryDocument）**，校验通过后可可视化；
- **编辑**：把修改转成**受控的 ChangeSet**，先给用户看影响范围，确认后原子应用。

## 从零创建故事

> **Artifact first（默认交付 HTML）**：确认剧情后，**在同一轮内完成"写 JSON → `validate` → `render` HTML → 报告路径"**，默认交付可视化。除渲染失败外，**不要向用户询问产物形式**（不要问"要 JSON 还是可视化"）。

1. **先谈剧情**：和用户确认标题/主题、故事主线与结局、关键情节与转折、大致场景数。信息不足就问，别臆造。**剧情是主线，人物/地点/道具都从剧情里长出来。**
2. **再由剧情提取要素**：确定人物、地点、道具，并说清每个要素**出现在哪些场景**。得到用户确认后，再按 `reference/schema.md` 写 `StoryDocument`（可用 `templates/story.template.json` 起步）。先给用户看**剧情脉络与人物/场景清单**，确认后再展开细节。
3. **校验**：
   ```bash
   node <本 Skill 目录>/bin/store-cli.mjs validate <story.json>
   ```
   硬错误必须修复；软诊断（如动机不足）可保留、向用户说明。
4. **交付**：默认生成 HTML（见下方「可视化」），**不要问用户要哪种产物**。
5. 之后用户要求修改，走"编辑流程"（`plan` → 确认 → `apply --write`），改完**再次渲染** HTML。

## 工具位置（自包含）

本 Skill 自带工具，位于**本 SKILL.md 同级的 `bin/`**，不依赖任何特定仓库或工作目录：

```bash
node <本 Skill 目录>/bin/store-cli.mjs ...
```

若你的工作目录就是本 Skill 目录，直接用 `node bin/store-cli.mjs ...`；否则用其绝对路径。命令如下：

```bash
node bin/store-cli.mjs summary <story.json>
node bin/store-cli.mjs plan  <story.json> <changeset.json> [--json]
node bin/store-cli.mjs apply <story.json> <changeset.json> --write [--json]
```

- `summary`：列出实体/场景/关系的 ID 与名称，用来定位要改的对象。
- `plan`：**只读提案**。展开高层操作（如 `entity.replace`），列出受影响对象与软诊断。绝不改数据。
- `apply`：原子应用。成功则 `revision+1`；失败（非法/冲突）整批拒绝、原数据不变。
  - **`apply` 必须带 `--write`**，否则只在内存里改、不落盘。命令必须完整原样执行：
    `node <本 Skill 目录>/bin/store-cli.mjs apply <story.json> <changeset.json> --write`

`<story.json>` 是用户项目里的故事文件（含 `revision`）；不确定改哪个先问用户。

## 故事文件

故事是一个 `StoryDocument` JSON（含 `storyId`、`revision`、`entities`、`scenes`、`outline`、`logicRelations`、`characterRelations` 等）。字段与操作详见 `reference/operations.md`。

## 标准流程（必须遵守）

1. **定位**：确认目标 story 文件；`summary` 查 ID。
2. **转译**：把用户的话转成 ChangeSet 的 `operations`（见 `reference/operations.md`）。
   - 改名优先用 `entity.replace`（会自动替换全篇正文提及）。
   - 改场景标题/摘要用 `scene.update`；改对白说话人用 `beat.update`。
3. **写提案**：把 ChangeSet 写入临时文件（如 `/tmp/storygraph-change.json`）。`baseRevision` 必须等于 story.json 里的当前 `revision`。
4. **预览**：运行 `plan`，用中文向用户**列出受影响的场景/节拍/关系**（不要只说"成功"）。
5. **确认**：明确问用户是否应用。**未经确认不得 apply。**
6. **应用**：用户同意后运行 `apply ... --write`，回报新 `revision` 与 `changedIds`。
7. **回执 + 自检**：命令返回后，**必须读回该 `story.json` 的 `revision`**，确认已 +1；若未变化，说明没有落盘（多半漏了 `--write`），重跑正确命令。**未确认 revision 变化前，不得声称成功。**
8. 若被拒绝，展示错误（冲突/引用清单/硬错误），据此调整后重新 `plan`。
9. 可视化：**默认自动**生成 HTML，见「可视化」一节。

## 可视化

本 Skill **自带渲染器与服务**，不依赖任何仓库。**默认交付自包含 HTML——不要问用户"要 JSON 还是可视化"**。

**一次性生成（默认在浏览器打开）：**

```bash
node <本 Skill 目录>/bin/render.mjs <story.json> <story.html> --open
```

**迭代编辑（推荐，实时刷新）：** 先起一次服务并打开浏览器；之后每次 `apply --write`，页面会自动刷新并**保留视角**：

```bash
node <本 Skill 目录>/bin/serve.mjs <story.json> --port 4100 --open
```

- 汇报时给出 HTML 路径或服务地址（如"已生成可视化：<路径>"）。
- 修改后：已起 `serve` → 无需操作（约 2 秒自动刷新）；未起服务 → 重新 `render` 并提醒用户刷新。
- 仅当渲染/服务启动失败（校验未过或环境缺 Node）时，才退回"只产出 JSON"，并说明原因。

## 检测到错误时：直接修 还是 先确认

**直接修复（结构错误，不改变故事含义）——修完重新 `validate`，并在回报中说明修复了什么，不要为这类问题去问用户：**
- ID 重复、引用不存在、字段/枚举类型非法、对话说话人不是本场参与人物、outline 重复场景、`before` 成环等**硬校验错误**；
- 修复方式唯一或无歧义（补引用、去重、修正类型）。

**先与用户确认（涉及创作含义或多解）：**
- **软诊断**：动机不足、因果模糊、时间未定、角色突然出现、状态跳变、未编排场景、实体未在任何场景出现（`entity/unused`）；
- **删除被引用的对象**：清理/替代方式有多种，先展示引用清单让用户选择；
- **全局改名/替换后**需人工判断的设定与关系是否合理；
- 任何**可能改变故事含义**的改动。

**`baseRevision` 冲突**：不要静默合并。重新读取当前 `revision`，基于最新版本按用户原意重新生成提案，交用户确认后再 `apply`。

## 铁律

- **永远不要手改 `story.json`**。所有语义修改都走 ChangeSet。
- 先 `plan` 再 `apply`；`apply` 前必须得到用户确认。
- 删除被引用的对象会被拒绝并返回引用清单；要在**同一批**里添加清理操作，或先改引用。
- `baseRevision` 用错会导致 `change/conflict`；此时重新读取 `revision` 再提交。
- 不臆造故事事实；不确定的创作性内容先问用户。全局改名后，提示用户是否要人工复核新实体的设定（如"熊"的毛皮/音色）。
- **自由文本用故事语言，保持统一**：`fixedTraits` 的键与值、`tags`、关系 `kind` 等都用与故事一致的语言（中文故事写中文，如 `{ "物种": "兔子", "速度": "飞快" }`），不要写英文键（species/speed 等），避免界面中英混排。
- **加人物/地点/道具，先问剧情**：新增任何实体前，先问用户"它出现在哪些场景/情节？"，把实体落到对应场景——人物进该场 `participants`、道具进 `props`、地点作 `locationId`，必要时**新增承载它的场景**。剧情是主线，不能只建一个空壳实体。
- **用户明确说"先不加剧情"时才例外**：此时可只创建实体，但必须**明确告知**它会是"0 场出现"（`plan`/`validate` 也会给软诊断 `entity/unused`），并说明后续可随时补剧情。不要默认走这条路。

## 示例：把小红帽里的"狼"改成"熊"

1. `summary` 找到 `char_wolf`（名称"大灰狼"）。
2. 生成 ChangeSet：
   ```json
   { "changeId": "ui_wolf_bear", "storyId": "story_little_red", "baseRevision": 1,
     "actor": { "kind": "agent", "id": "codex" },
     "operations": [ { "op": "entity.replace", "entityId": "char_wolf", "newName": "熊", "aliases": ["大灰狼", "狼"] } ] }
   ```
3. `plan` → 展示受影响的场景/节拍/关系清单。
4. 用户确认后 `apply --write` → 回报 `revision 2`、`changedIds`。

更多操作与错误码见 `reference/operations.md`。
