import { describe, expect, it } from 'vitest';
import { terrainPolicies } from './版本.ts';

const entries = {
  world: { version: '底包', activePolicy: 'outside', policies: { '4': { version: '底包四' }, copy: { version: '照抄底包' } } },
  overlay: { version: '覆盖', policyFrom: 'world', policies: { '4': { version: '覆盖四' }, copy: { version: '照抄覆盖' } } },
  other: { version: '原样' },
};

describe('覆盖层跟随世界底包选版', () => {
  it('正式只改一处，试看不改变正式登记，也不影响其他世界', () => {
    expect(terrainPolicies(entries)).toEqual(entries);
    const trial = terrainPolicies(entries, 4);
    expect(Object.values(trial).map((r) => r.version)).toEqual(['底包四', '覆盖四', '原样']);
    expect(terrainPolicies({ ...entries, world: { ...entries.world, activePolicy: '4' } })).toEqual(trial);
    expect(entries.world.activePolicy).toBe('outside');
    expect(Object.values(terrainPolicies(entries, 'copy')).map(entry => entry.version)).toEqual(['照抄底包', '照抄覆盖', '原样']);
  });

  it('缺底包或缺当前档的作品层，不能串用其他版本', () => {
    expect(() => terrainPolicies<{ version: string }>({ overlay: entries.overlay })).toThrow(/缺少配套底包/);
    expect(() => terrainPolicies({ ...entries, overlay: { version: '覆盖', policyFrom: 'world' } }, 4)).toThrow(/缺模拟起级 4/);
  });
});
