#!/usr/bin/env node
import fs from 'node:fs';
import { StoryStore } from './store.mjs';
import { validate } from './validate.mjs';

function usage() {
  return `Usage:
  node store-cli.mjs summary  <story.json>
  node store-cli.mjs validate <story.json> [--json]
  node store-cli.mjs plan     <story.json> <changeset.json> [--json]
  node store-cli.mjs apply    <story.json> <changeset.json> [--json] [--out <path> | --write]

summary  : 列出实体/场景/关系的 ID 与名称，便于构造 ChangeSet
validate : 校验 StoryDocument（硬错误/软诊断），硬错误时退出码 1
plan     : 只读提案（展开 entity.replace、列出受影响对象与软诊断）
apply    : 原子应用修改（revision+1），可选写出到文件`;
}

function printSummary(file) {
  const doc = readJson(file);
  const lines = [`# story ${doc.storyId} revision ${doc.revision}`];
  lines.push('entities:');
  for (const [id, e] of Object.entries(doc.entities || {})) lines.push(`  ${id}  [${e.kind}] ${e.name || ''}`);
  lines.push('scenes:');
  for (const [id, s] of Object.entries(doc.scenes || {})) lines.push(`  ${id}  ${s.title || ''}`);
  lines.push('characterRelations:');
  for (const r of doc.characterRelations || []) lines.push(`  ${r.id}  ${r.sourceCharacterId}->${r.targetCharacterId} ${r.kind} (${r.scope && r.scope.type})`);
  lines.push('logicRelations:');
  for (const r of doc.logicRelations || []) lines.push(`  ${r.id}  ${r.kind} ${r.source && r.source.id}->${r.target && r.target.id}`);
  console.log(lines.join('\n'));
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  let json = false;
  let write = false;
  let out = null;
  const files = [];
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--write') write = true;
    else if (a === '--out') { out = argv[i + 1]; i += 1; }
    else files.push(a);
  }

  if (command === 'summary') {
    if (files.length < 1) { console.error(usage()); process.exit(2); }
    printSummary(files[0]);
    return;
  }
  if (command === 'validate') {
    if (files.length < 1) { console.error(usage()); process.exit(2); }
    const result = validate(readJson(files[0]));
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`硬错误 ${result.errors.length}，软诊断 ${result.warnings.length}`);
      for (const e of result.errors) console.log(`  ✗ [${e.code}] ${e.message}`);
      for (const w of result.warnings) console.log(`  · [${w.code}] ${w.message}`);
    }
    if (result.errors.length) process.exitCode = 1;
    return;
  }
  if (!command || !['plan', 'apply'].includes(command) || files.length < 2) {
    console.error(usage());
    process.exit(2);
  }
  const store = new StoryStore(readJson(files[0]));
  const raw = readJson(files[1]);
  const changeSet = raw && raw.changeSet ? raw.changeSet : raw; // 兼容场景包装文件
  const result = command === 'plan' ? store.plan(changeSet) : store.apply(changeSet);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'plan') {
    console.log(`提案（当前 revision ${result.revision}）：`);
    for (const op of result.operations || []) console.log(`  ${op.op}${op.id ? ' ' + op.id : ''}`);
    console.log(`受影响对象：${(result.changedIds || []).join(', ') || '（无）'}`);
    if (result.warnings && result.warnings.length) console.log(`软诊断：${result.warnings.map((w) => w.message).join('；')}`);
    if (result.errors && result.errors.length) console.log(`硬错误：${result.errors.map((e) => e.message).join('；')}`);
  } else if (result.ok) {
    console.log(`已应用：revision ${result.revision}${result.replay ? '（幂等重放）' : ''}`);
    console.log(`受影响对象：${result.changedIds.join(', ')}`);
    if (write) { store.write(files[0]); console.log(`已写回 ${files[0]}`); }
    else if (out) { store.write(out); console.log(`已写出 ${out}`); }
  } else {
    console.error(`拒绝：${result.error}${result.message ? ' - ' + result.message : ''}`);
    if (result.references) console.error(`引用清单：${JSON.stringify(result.references)}`);
    if (result.errors) console.error(`错误：${result.errors.map((e) => e.message).join('；')}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
