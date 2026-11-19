import { expect, it } from 'vitest';
import { chainCastTable } from '../../场/1-台地/齐放拍.ts';
import { spellDuration, spellSoundAt, type Vec3 } from './接口.ts';
import { getSpellMeta } from './元表.ts';
import { iceSpikePath } from './法术/ice_spike.元.ts';
import { magicSwordPath } from './法术/sword.元.ts';
import { soulBeamHitTick } from './法术/灵魂束.元.ts';

it('45格的快弹、加速弹和照射分别结算；附魔和无演出倍率的核对段不变', () => {
  const from: Vec3 = [-36, 0, 27.9], target: Vec3 = [0, 0, 0];
  const options = (id: string) => ({ highSpeed: 5, ...chainCastTable.find(item => item.id === id)!.options });
  for (const [id, path] of [['ice_spike', iceSpikePath], ['sword', magicSwordPath]] as const) {
    const shot = path(from, target, 5, options(id).flightPower);
    expect(shot.arriveTick * 3).toBe(15);
    expect(shot.trajectory(shot.arriveTick)[2]).toBeCloseTo(0.9, 8);
    expect(path(from, target, 5).arriveTick).toBeGreaterThan(shot.arriveTick);
    expect(spellDuration(getSpellMeta(id), from, target, options(id)).hitSec).toBe(shot.arriveTick / 20);
    expect(spellSoundAt(getSpellMeta(id), from, target, options(id)).some(sound => sound.sec === shot.arriveTick / 20)).toBe(true);
  }
  const soul = soulBeamHitTick(from, target, 5, options('soul_bolt').flightPower);
  expect(Math.ceil(soul * 3)).toBe(69);
  expect(spellDuration(getSpellMeta('soul_bolt'), from, target, options('soul_bolt')).hitSec).toBe(soul / 20);
  expect(spellDuration(getSpellMeta('prisma_beam'), from, target, options('prisma_beam')).hitSec).toBe(1);
  expect(options('fireball').flightPower).toBeUndefined();
});
