// 贴图发光（真实方块表.ts 的 textureGlow）：模组方块借了熔岩贴图不能让熔岩不亮；原版不发光的方块共用的贴图（南瓜侧面）不亮。
import { describe, expect, it, vi } from 'vitest';

const mockTable = vi.hoisted(() => {
  const face = (t: number) => [['+z', '+z', t, -1, 0, 1, 0, 16, 16, 16, 16, 16, 16, 0, 16, 0, 0, 16, 0, 0, 16, 0, 16, 16, 0, 16]];
  return {
    blockTable: {
      贴图: ['minecraft:block/lava_still', 'minecraft:block/pumpkin_side', 'minecraft:block/jack_o_lantern', 'minecraft:block/fire_0'],
      面组: [face(0), face(1), face(2), face(3)],
      方块: {
        'minecraft:lava[level=0]': [3, null, 0],
        'tconstruct:ichor_slime[level=0]': [3, null, 0],
        'minecraft:pumpkin': [4 + 8, null, 1],
        'minecraft:jack_o_lantern[facing=north]': [4 + 8, null, 1, 2],
        'minecraft:fire[age=0]': [1, null, 3],
      },
    },
    biomeColor: { 群系: {} },
  };
});
vi.mock('asset:数据/场景/关键帧/方块表', () => ({ default: mockTable.blockTable }));
vi.mock('asset:数据/场景/关键帧/群系色', () => ({ default: mockTable.biomeColor }));

const { textureGlow, blockProps, voxelFromState } = await import('./真实方块表.ts');

describe('贴图发光', () => {
  it('模组方块借熔岩贴图，熔岩照样亮', () => expect(textureGlow[0]).toBe(255));
  it('南瓜侧面和南瓜灯共用，不亮；刻脸那面亮', () => expect([textureGlow[1], textureGlow[2]]).toEqual([0, 255]));
  it('火亮，方块的发光强度按状态给', () => {
    expect(textureGlow[3]).toBe(255);
    expect(blockProps.glow[voxelFromState('minecraft:fire[age=0]')]).toBe(255);
    expect(blockProps.glow[voxelFromState('minecraft:pumpkin')]).toBe(0);
  });
});
