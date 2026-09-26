#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './validate.mjs';
import { derive } from './derive.mjs';
import { StoryStore } from './store.mjs';
import { textMentions } from './operations.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const casesDir = path.join(repoRoot, 'tests', 'storygraph', 'cases');

let passed = 0;
const failures = [];
const check = (cond, label) => { if (cond) passed += 1; else failures.push(label); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function linearization(vm) {
  const known = new Set(vm.timeKnown);
  const withLayer = vm.sceneIds.filter((id) => known.has(id)).sort((a, b) => (vm.layer[a] - vm.layer[b]) || (vm.tellingIndex[a] - vm.tellingIndex[b]));
  const unknown = vm.sceneIds.filter((id) => !known.has(id)).sort((a, b) => vm.tellingIndex[a] - vm.tellingIndex[b]);
  return [...withLayer, ...unknown];
}

function runCase(caseName) {
  const dir = path.join(casesDir, caseName);
  const story = JSON.parse(fs.readFileSync(path.join(dir, 'story.json'), 'utf8'));
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
  const vm = derive(story);

  check(validate(story).errors.length === 0, `${caseName}: 校验应通过`);
  if (expected.outlineOrder) check(eq(vm.order, expected.outlineOrder), `${caseName}: 讲述顺序`);
  if (expected.storyTimeLinearization) check(eq(linearization(vm), expected.storyTimeLinearization), `${caseName}: 故事时间顺序`);
  if (expected.stats) for (const [k, v] of Object.entries(expected.stats)) check(vm.stats[k] === v, `${caseName}: 统计 ${k}=${v}`);
  if (expected.relationChangePoints) {
    for (const [key, points] of Object.entries(expected.relationChangePoints)) {
      const pair = vm.relationsByPair.find((p) => p.key === key);
      check(pair && eq(pair.changePoints, points), `${caseName}: 关系变化点 ${key}`);
    }
  }

  const changesDir = path.join(dir, 'changes');
  if (!fs.existsSync(changesDir)) return;
  for (const file of fs.readdirSync(changesDir).filter((f) => f.endsWith('.json')).sort()) {
    const scenario = JSON.parse(fs.readFileSync(path.join(changesDir, file), 'utf8'));
    const label = `${caseName}/${file}`;
    const store = new StoryStore(story);
    const before = store.snapshot();
    const expect = scenario.expect || {};

    if (expect.planNonEmpty) {
      const plan = store.plan(scenario.changeSet);
      check(plan.ok !== false && (plan.operations || []).length > 0, `${label}: 提案非空`);
      if (expect.planUnchanged) check(store.revision === before.revision, `${label}: 提案不改版本`);
    }

    const result = store.apply(scenario.changeSet);
    if (expect.repeatSame) {
      const again = store.apply(scenario.changeSet);
      check(again.ok && again.replay && store.revision === result.revision, `${label}: 幂等重放`);
    }
    if (expect.repeatDifferent) {
      const other = { ...scenario.changeSet, operations: expect.repeatDifferent.operations };
      const rejected = store.apply(other);
      check(!rejected.ok && JSON.stringify(rejected).includes('duplicate'), `${label}: 同 changeId 不同内容被拒`);
    }
    if (expect.ok) {
      check(result.ok === true, `${label}: 应成功`);
      if (expect.revision != null) check(store.revision === expect.revision, `${label}: revision=${expect.revision}`);
      if (expect.changedIdsIncludes) for (const id of expect.changedIdsIncludes) check((result.changedIds || []).includes(id), `${label}: 受影响含 ${id}`);
      if (expect.afterNoText) check(textMentions(store.snapshot(), expect.afterNoText).length === 0, `${label}: 文本已无 ${expect.afterNoText.join('/')}`);
      if (expect.afterEntityName) {
        const snap = store.snapshot();
        for (const [id, name] of Object.entries(expect.afterEntityName)) check(snap.entities[id] && snap.entities[id].name === name, `${label}: 实体 ${id} 名为 ${name}`);
      }
    } else {
      check(result.ok === false, `${label}: 应被拒绝`);
      const text = JSON.stringify(result);
      if (expect.errorIncludes) for (const s of expect.errorIncludes) check(text.includes(s), `${label}: 错误含 "${s}"`);
      if (expect.unchanged) check(eq(store.snapshot(), before), `${label}: 数据未变`);
    }
  }
}

const caseNames = fs.readdirSync(casesDir).filter((name) => fs.existsSync(path.join(casesDir, name, 'story.json')));
for (const name of caseNames) runCase(name);

console.log(`\n通过 ${passed}，失败 ${failures.length}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
