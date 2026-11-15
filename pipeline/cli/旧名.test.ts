import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { commandTable } from './命令表.ts';
import { oldNameError, passThroughCommands, renamedCommands, renamedFlags } from './旧名.ts';

const hasHan = (s: string) => /[㐀-鿿]/.test(s);

describe('旧名', () => {
  it('旧命令、旧子命令、旧参数报「改名了」并给新名；新写法不报', () => {
    expect(oldNameError(['调度', '--一行'])).toBe('改名了，用新名（旧的中文命令、参数不再认）：\n  anim 调度 → anim sched\n  --一行 → --oneline');
    expect(oldNameError(['--作品', '应力转动', '调度', '盯', '--最长', '300'])).toMatch(/anim 调度 盯 → anim sched watch[\s\S]*--作品 → --work[\s\S]*--最长 → --max-sec/);
    expect(oldNameError(['world', '远景', '任务', '暮色'])).toMatch(/anim world 远景 任务 → anim world far tasks/);
    expect(oldNameError(['world', 'far', '任务', '暮色'])).toMatch(/anim world far 任务 → anim world far tasks/);
    expect(oldNameError(['check', '类型', 'structure', '资产', '--快'])).toMatch(/anim check 类型 structure 资产 → anim check types structure assets[\s\S]*--快 → --fast/);
    expect(oldNameError(['bili', '导入', 'a.json'])).toMatch(/anim bili 导入 → anim platform import/);
    expect(oldNameError(['still', '6-追来', '0', '--到预览=主题'])).toMatch(/--到预览 → --to-preview/);
    expect(oldNameError(['sched', '--oneline'])).toBeNull();
    expect(oldNameError(['--work', '应力转动', 'still', '6-追来', '0', '--to-preview', '远景发白', '--tele', '1,2,3'])).toBeNull();
    expect(oldNameError(['sched', 'note', '--why', '调度 盯 --作品 写在值里不算'])).toBeNull();
  });

  it('-- 之后、转给别的程序的命令后面不查', () => {
    expect(oldNameError(['world', 'server', '暮色', '--sandbox', '--', 'say', '--作品'])).toBeNull();
    expect(oldNameError(['mcai', 'record', '--种子', '1'])).toBeNull();
    expect(oldNameError(['--作品', 'x', 'mcai', 'record'])).toMatch(/--作品 → --work/);
  });

  it('表和命令表对得上：新名都在、旧名都不在，转发命令一致，命令表里没有中文命令和参数', () => {
    for (const [oldPath, newPath] of Object.entries(renamedCommands)) {
      expect(commandTable[newPath.split(' ')[0]!], newPath).toBeDefined();
      if (!oldPath.includes(' ')) expect(commandTable[oldPath], oldPath).toBeUndefined();
    }
    expect(Object.keys(commandTable).filter((k) => commandTable[k]!.passThrough).sort()).toEqual([...passThroughCommands].sort());
    expect(Object.keys(commandTable).filter(hasHan)).toEqual([]);
    for (const c of Object.values(commandTable)) expect([c.用法, c.help?.() ?? ''].join('\n')).not.toMatch(/--[㐀-鿿]/);
    for (const v of [...Object.values(renamedCommands), ...Object.values(renamedFlags)]) expect(hasHan(v), v).toBe(false);
  });

  it('入口报错退出 2、不执行（快路径的 sched 也一样）', () => {
    const main = path.join(codeRoot(), 'pipeline', 'cli', 'main.ts');
    for (const argv of [['调度', '--一行'], ['sched', 'note', '--为什么', 'x']]) {
      const r = spawnSync(process.execPath, [main, ...argv], { encoding: 'utf8' });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/^改名了/);
      expect(r.stdout).toBe('');
    }
  });
});
