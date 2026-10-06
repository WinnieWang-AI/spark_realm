# StoryGraph 测试用例

数据结构依据 [StoryGraph 数据结构规格 v1](../../docs/development-plans/storygraph_schema_v1.md)。

## 用例格式

每个用例目录包含：

| 文件 | 作用 | 必填 |
| --- | --- | --- |
| `story.json` | 输入 StoryDocument | 是 |
| `expected.json` | 期望结果（校验结论、派生事实） | 是 |
| `changes/*.json` | 模拟变更场景（ChangeSet + 期望） | 否 |

运行：`node tools/storygraph/run-tests.mjs`（跑用例断言与全部模拟变更）。

## 覆盖率矩阵（首版目标，见规格第 15 节）

| # | 用例 | 覆盖点 | 状态 |
| --- | --- | --- | --- |
| 1 | `little_red_riding_hood` | 线性讲述顺序、setsUp、场景级与 Beat 级 causes（含跨级）、areas、道具状态、人物关系通过 scope 变化 | 已建 |
| 2 | `lei_yu` | 多人物多线、身份揭穿导致关系变化（恋人→兄妹、劳资对立→父子）、Beat 级跨级 causes | 已建 |
| 3 | 匿名信 | 闪回：讲述顺序与故事时间分离、Beat 级 before | 待建 |
| 4 | 并行/交错双线 | Beat 级 before、overlaps | 待建 |
| 5 | 多线汇合 | threadIds、before 偏序 | 待建 |
| 6 | 场景内动作因果 | 同场景 Beat 级 causes 与数组顺序 | 待建 |
| 7 | 长故事骨架（约 100 场） | parts 层级、增量校验、版本压缩 | 待建 |

## expected.json 字段

- `validation`：期望的校验结论（如 `pass` 或含错误码）。
- `outlineOrder`：按 outline 展开的讲述顺序。
- `storyTimeOrder`：before 偏序的一种合法线性化（用于校验时间关系）。
- `relationChangePoints`：按 before 偏序推导的人物关系变化点。
- `featuresCovered` / `featuresNotCovered`：本用例覆盖与未覆盖的能力，避免误判覆盖范围。
