import { describe, expect, it } from 'vitest';
import { 主厅门们, 开着的门洞 } from './隐世之境主厅门数据.ts';

// 光从正西水平照进西门（往 +x 走）
const 往东 = [1, 0, 0];

describe('开着的门洞', () => {
  const 西门 = 主厅门们.西门;
  it('开到底就是门洞本身，关着全挡住', () => {
    expect(开着的门洞(西门, 1, 往东)).toBe(西门.洞);
    expect(开着的门洞(西门, 0, 往东)).toBeNull();
  });
  it('开一半：门扇外沿转到 45°，挡住门轴（北）那一截', () => {
    const 洞 = 开着的门洞(西门, 0.5, 往东)!;
    // 门扇外沿两个角绕轴 (6.09375, −10.09375) 转 45°，最南的那个（外侧那面的角）落在 y ≈ −10.80
    expect(洞.a[1]).toBeCloseTo(-10.801, 3);
    expect(洞.b).toEqual(西门.洞.b);
    expect(洞.a[0]).toBe(7);
  });
  it('开得越大门缝越宽', () => {
    const 宽 = (开: number) => {
      const 洞 = 开着的门洞(西门, 开, 往东);
      return 洞 ? 洞.a[1] - 洞.b[1] : 0;
    };
    expect(宽(0.3)).toBeLessThan(宽(0.6));
    expect(宽(0.6)).toBeLessThan(宽(1));
  });
  it('北门两扇往两边开，门缝在中间', () => {
    const 北门 = 主厅门们.北门;
    const 往南 = [0, -1, 0];
    const 洞 = 开着的门洞(北门, 0.5, 往南)!;
    expect(洞.a[0]).toBeGreaterThan(北门.洞.a[0]);
    expect(洞.b[0]).toBeLessThan(北门.洞.b[0]);
    expect(洞.a[0]).toBeLessThan(洞.b[0]);
  });
});
