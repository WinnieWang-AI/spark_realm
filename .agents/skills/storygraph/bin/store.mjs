import fs from 'node:fs';
import { validate } from './validate.mjs';
import { runOperations, clone } from './operations.mjs';

function mkError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export class StoryStore {
  constructor(doc) {
    this.doc = clone(doc);
    this.revision = this.doc.revision ?? 1;
    this.history = [{ revision: this.revision, doc: clone(this.doc) }];
    this.applied = new Map(); // changeId -> { hash, result }
  }

  snapshot() { return clone(this.doc); }
  getScene(id) { return this.doc.scenes ? this.doc.scenes[id] : undefined; }
  getEntity(id) { return this.doc.entities ? this.doc.entities[id] : undefined; }
  subtree(id) { return { scene: this.getScene(id), entity: this.getEntity(id) }; }

  _prepare(changeSet, { requireBase }) {
    if (!changeSet || typeof changeSet !== 'object') throw mkError('change/invalid', 'ChangeSet 不是对象');
    if (!changeSet.changeId) throw mkError('change/invalid', '缺少 changeId');
    const opsJson = JSON.stringify(changeSet.operations || []);
    const seen = this.applied.get(changeSet.changeId);
    if (seen) {
      if (seen.hash === opsJson) return { replay: seen.result };
      throw mkError('change/duplicate-id', `changeId 已用于不同内容: ${changeSet.changeId}`);
    }
    if (changeSet.storyId && this.doc.storyId && changeSet.storyId !== this.doc.storyId) {
      throw mkError('change/story-mismatch', `storyId 不匹配: ${changeSet.storyId}`);
    }
    if (requireBase && changeSet.baseRevision !== this.revision) {
      throw mkError('change/conflict', `baseRevision 过期: 收到 ${changeSet.baseRevision}，当前 ${this.revision}`, { currentRevision: this.revision });
    }
    const work = clone(this.doc);
    const { expanded, changedIds } = runOperations(work, changeSet.operations || []);
    const validation = validate(work);
    return { work, expanded, changedIds, validation, hash: opsJson };
  }

  // 只读提案：展开高层操作、返回受影响对象与软诊断，不提交
  plan(changeSet) {
    try {
      const prepared = this._prepare(changeSet, { requireBase: false });
      if (prepared.replay) return { ok: true, replay: true, revision: this.revision, ...prepared.replay };
      return {
        ok: prepared.validation.errors.length === 0,
        revision: this.revision,
        operations: prepared.expanded,
        changedIds: prepared.changedIds,
        warnings: prepared.validation.warnings,
        errors: prepared.validation.errors,
      };
    } catch (error) {
      return { ok: false, error: error.code, message: error.message, references: error.references, currentRevision: error.currentRevision };
    }
  }

  apply(changeSet) {
    let prepared;
    try {
      prepared = this._prepare(changeSet, { requireBase: true });
    } catch (error) {
      return { ok: false, error: error.code, message: error.message, references: error.references, currentRevision: error.currentRevision };
    }
    if (prepared.replay) return { ok: true, replay: true, revision: this.revision, ...prepared.replay };
    if (prepared.validation.errors.length) {
      return { ok: false, error: 'change/invalid', errors: prepared.validation.errors };
    }
    this.revision += 1;
    prepared.work.revision = this.revision;
    this.doc = prepared.work;
    this.history.push({ revision: this.revision, doc: clone(this.doc) });
    const result = { revision: this.revision, changedIds: prepared.changedIds, warnings: prepared.validation.warnings };
    this.applied.set(changeSet.changeId, { hash: prepared.hash, result });
    return { ok: true, ...result };
  }

  write(targetPath) {
    const tmp = `${targetPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.doc, null, 2));
    fs.renameSync(tmp, targetPath);
  }
}
