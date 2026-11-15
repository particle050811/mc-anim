import { beforeEach, describe, expect, it, vi } from 'vitest';

// 一个组件 = 调一次钩子、记下 effect；卸载 = 跑 effect 的清理。只为看清时序，不起真的 React
const cleanups: (() => void)[] = [];
vi.mock('react', () => ({
  useState: <T,>(init: () => T) => [init()],
  useEffect: (fn: () => () => void) => {
    cleanups.push(fn());
  },
}));
const { useWriter, newWriteSlot } = await import('./写入者.ts');
const { selfLight, overworldMix, useSelfLight } = await import('../light/光照配比.ts');

/** 挂一个组件，返回卸载函数 */
const mount = (render: () => void) => {
  const startIndex = cleanups.length;
  render();
  const batchCleanups = cleanups.splice(startIndex);
  return () => batchCleanups.forEach((f) => f());
};

describe('use写入者', () => {
  beforeEach(() => {
    cleanups.length = 0;
  });

  it('Studio 切到没有这层的段：写入者卸载就复位', () => {
    const writeSlot = newWriteSlot();
    let value = 1;
    const reset = () => {
      value = 0;
    };
    const dispose = mount(() => useWriter(writeSlot, reset));
    dispose();
    expect(value).toBe(0);
    expect(writeSlot.writer).toBeNull();
  });

  it('拼段切点：新画布先写、旧画布后卸，旧的不冲掉新值', () => {
    const writeSlot = newWriteSlot();
    let value = 0;
    const reset = () => {
      value = 0;
    };
    const unmountOld = mount(() => {
      useWriter(writeSlot, reset);
      value = 1;
    });
    const unmountNew = mount(() => {
      useWriter(writeSlot, reset);
      value = 2;
    });
    unmountOld();
    expect(value).toBe(2);
    unmountNew();
    expect(value).toBe(0);
  });

  it('旧的先卸、新的后写：照样是新值，新的卸载时复位', () => {
    const writeSlot = newWriteSlot();
    let value = 0;
    const reset = () => {
      value = 0;
    };
    mount(() => {
      useWriter(writeSlot, reset);
      value = 1;
    })();
    expect(value).toBe(0);
    const unmountNew = mount(() => {
      useWriter(writeSlot, reset);
      value = 2;
    });
    expect(value).toBe(2);
    unmountNew();
    expect(value).toBe(0);
  });

  it('不同的槽互不相干', () => {
    const slot = newWriteSlot();
    const secondSlot = newWriteSlot();
    let valueA = 1;
    let writtenValue = 1;
    const unmountA = mount(() =>
      useWriter(slot, () => {
        valueA = 0;
      }),
    );
    mount(() =>
      useWriter(secondSlot, () => {
        writtenValue = 0;
      }),
    );
    unmountA();
    expect([valueA, writtenValue]).toEqual([0, 1]);
  });
});

describe('useSelfLight', () => {
  beforeEach(() => {
    cleanups.length = 0;
  });

  it('切点旧画布后卸不冲掉新值；世界全卸下后回到主世界的值', () => {
    const unmountOld = mount(() => useSelfLight(0.3));
    const unmountNew = mount(() => useSelfLight(0.5));
    unmountOld();
    expect(selfLight.value).toBe(0.5);
    unmountNew();
    expect(selfLight.value).toBe(overworldMix.selfLight);
  });
});
