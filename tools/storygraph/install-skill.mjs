#!/usr/bin/env node
// 把 storygraph Skill 打包为自包含目录（SKILL.md + reference + templates + bin/ 工具）。
//   node install-skill.mjs          安装/同步到仓库内 .agents/skills 与各宿主全局目录
//   node install-skill.mjs --check  只校验（CI 用）：源工具与 Skill bin/ 是否一致
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const srcSkill = path.join(repoRoot, '.agents', 'skills', 'storygraph');
const toolFiles = ['validate.mjs', 'derive.mjs', 'layout.mjs', 'i18n.mjs', 'render.mjs', 'serve.mjs', 'operations.mjs', 'store.mjs', 'store-cli.mjs'];
const viewerFiles = ['template.html', 'viewer.css', 'viewer.js', 'icons.svg', 'logo-v1.png'];

const check = process.argv.includes('--check');

if (check) {
  let stale = 0;
  for (const file of toolFiles) {
    const a = fs.readFileSync(path.join(here, file), 'utf8');
    const target = path.join(srcSkill, 'bin', file);
    const b = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (a !== b) { console.error(`不同步: bin/${file}`); stale += 1; }
  }
  for (const file of viewerFiles) {
    const a = fs.readFileSync(path.join(here, 'viewer', file), 'utf8');
    const target = path.join(srcSkill, 'bin', 'viewer', file);
    const b = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (a !== b) { console.error(`不同步: bin/viewer/${file}`); stale += 1; }
  }
  for (const rel of ['SKILL.md', 'reference/operations.md', 'reference/schema.md', 'templates/story.template.json']) {
    if (!fs.existsSync(path.join(srcSkill, rel))) { console.error(`缺失: ${rel}`); stale += 1; }
  }
  if (stale) { console.error(`\nSkill 包已过期（${stale} 处），请运行 node tools/storygraph/install-skill.mjs 同步。`); process.exit(1); }
  console.log('Skill 包一致。');
  process.exit(0);
}

const targets = [
  srcSkill, // 仓库内（提交这一份）
  path.join(os.homedir(), '.config', 'opencode', 'skills', 'storygraph'),
  path.join(os.homedir(), '.codex', 'skills', 'storygraph'),
  path.join(os.homedir(), '.agents', 'skills', 'storygraph'),
  path.join(os.homedir(), '.claude', 'skills', 'storygraph'),
];

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'storygraph-skill-'));
fs.cpSync(path.join(srcSkill, 'SKILL.md'), path.join(stage, 'SKILL.md'));
fs.cpSync(path.join(srcSkill, 'reference'), path.join(stage, 'reference'), { recursive: true });
fs.cpSync(path.join(srcSkill, 'templates'), path.join(stage, 'templates'), { recursive: true });
fs.mkdirSync(path.join(stage, 'bin'), { recursive: true });
for (const file of toolFiles) fs.cpSync(path.join(here, file), path.join(stage, 'bin', file));
fs.cpSync(path.join(here, 'viewer'), path.join(stage, 'bin', 'viewer'), { recursive: true });

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(stage, target, { recursive: true });
  console.log(`已安装 -> ${target}`);
}
fs.rmSync(stage, { recursive: true, force: true });
console.log('完成。任意工作目录下的 opencode/codex/claude 均可使用 storygraph Skill。');
