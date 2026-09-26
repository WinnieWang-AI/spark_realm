<p align="center"><img src="assets/logo-v1.png" alt="SparkRealm" width="420"></p>

<p align="center"><b>简体中文</b> · <a href="README_EN.md">English</a></p>

# SparkRealm

> *A single spark can start a prairie fire.*

SparkRealm 是一个正在不断成长（开发）的 AIGC 创作助手。<br>
它的目标是帮助更多人自由表达和创作，将闪光的灵感转化为动人的作品。<br>
SparkRealm 正在起步阶段，欢迎建议和反馈。

## 功能

### 故事梳理

把零散的想法或一段剧本，整理成清晰、可查看的故事结构。

1. **要素提取** 解析故事中出现的人物、地点、道具，标出它们出现的场景、以及它们的状态如何随故事发展发生变化。
2. **故事线梳理** 按幕与场景整理情节，梳理先后、因果、铺垫关系，在「故事时间」与「讲述顺序」两种视图下展示。
3. **人物关系** 追踪人物关系随故事发展的变化。
4. **可视化查看** 图谱化浏览，点选即可查看详情与节拍，支持缩放、搜索与缩略图定位。

**[▶ 打开交互示例](https://winniewang-ai.github.io/spark_realm/)**

| 故事逻辑 | 要素关系 |
| --- | --- |
| [<img src="assets/story-v1.png" alt="故事逻辑图" width="380">](https://winniewang-ai.github.io/spark_realm/little_red.html) | [<img src="assets/relation-v1.png" alt="要素关系图" width="380">](https://winniewang-ai.github.io/spark_realm/little_red.html) |

> **TODO · 可视化界面交互编辑** 支持在图谱界面上直接编辑故事（修改场景/人物、增删与调整关系、拖动布局）；当前通过对话与 Agent 修改。

## 安装，然后说出你的想法

```bash
npx skills add WinnieWang-AI/spark_realm -g
```

把这句话发给你的 Agent：

```text
使用 storygraph skill，帮我写一个关于……的短故事 / 基于XXX文件，帮我梳理出故事线。
```
Agent 会梳理故事逻辑并生成可视化图谱。

### 更多安装方式

显式安装到指定宿主：

```bash
npx -y skills add WinnieWang-AI/spark_realm --skill storygraph --agent opencode --global --copy --yes
```

临时体验（不安装）：

```bash
npx skills use WinnieWang-AI/spark_realm --skill storygraph --agent opencode
```

也可以直接指向仓库里的 Skill 子目录：

```bash
npx skills add https://github.com/WinnieWang-AI/spark_realm/tree/main/.agents/skills/storygraph -g
```

`npx skills` 会自动识别已安装的宿主（OpenCode、Codex、Claude Code 等）并写入其 skills 目录。需要本机有 **Node.js**。
