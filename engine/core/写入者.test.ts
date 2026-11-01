import { beforeEach, describe, expect, it, vi } from 'vitest';

// 一个组件 = 调一次钩子、记下 effect；卸载 = 跑 effect 的清理。只为看清时序，不起真的 React
const 清理们: (() => void)[] = [];
vi.mock('react', () => ({
  useState: <T,>(init: () => T) => [init()],
  useEffect: (fn: () => () => void) => {
    清理们.push(fn());
  },
}));
const { use写入者, 新写入槽 } = await import('./写入者.ts');
const { selfLight, overworldMix, useSelfLight } = await import('../light/光照配比.ts');

/** 挂一个组件，返回卸载函数 */
const 挂 = (渲染: () => void) => {
  const 起 = 清理们.length;
  渲染();
  const 这批 = 清理们.splice(起);
  return () => 这批.forEach((f) => f());
};

describe('use写入者', () => {
  beforeEach(() => {
    清理们.length = 0;
  });

  it('Studio 切到没有这层的段：写入者卸载就复位', () => {
    const 槽 = 新写入槽();
    let 值 = 1;
    const 复位 = () => {
      值 = 0;
    };
    const 卸 = 挂(() => use写入者(槽, 复位));
    卸();
    expect(值).toBe(0);
    expect(槽.写入者).toBeNull();
  });

  it('拼段切点：新画布先写、旧画布后卸，旧的不冲掉新值', () => {
    const 槽 = 新写入槽();
    let 值 = 0;
    const 复位 = () => {
      值 = 0;
    };
    const 卸旧 = 挂(() => {
      use写入者(槽, 复位);
      值 = 1;
    });
    const 卸新 = 挂(() => {
      use写入者(槽, 复位);
      值 = 2;
    });
    卸旧();
    expect(值).toBe(2);
    卸新();
    expect(值).toBe(0);
  });

  it('旧的先卸、新的后写：照样是新值，新的卸载时复位', () => {
    const 槽 = 新写入槽();
    let 值 = 0;
    const 复位 = () => {
      值 = 0;
    };
    挂(() => {
      use写入者(槽, 复位);
      值 = 1;
    })();
    expect(值).toBe(0);
    const 卸新 = 挂(() => {
      use写入者(槽, 复位);
      值 = 2;
    });
    expect(值).toBe(2);
    卸新();
    expect(值).toBe(0);
  });

  it('不同的槽互不相干', () => {
    const 甲 = 新写入槽();
    const 乙 = 新写入槽();
    let 值甲 = 1;
    let 值乙 = 1;
    const 卸甲 = 挂(() =>
      use写入者(甲, () => {
        值甲 = 0;
      }),
    );
    挂(() =>
      use写入者(乙, () => {
        值乙 = 0;
      }),
    );
    卸甲();
    expect([值甲, 值乙]).toEqual([0, 1]);
  });
});

describe('useSelfLight', () => {
  beforeEach(() => {
    清理们.length = 0;
  });

  it('切点旧画布后卸不冲掉新值；世界全卸下后回到主世界的值', () => {
    const 卸旧 = 挂(() => useSelfLight(0.3));
    const 卸新 = 挂(() => useSelfLight(0.5));
    卸旧();
    expect(selfLight.value).toBe(0.5);
    卸新();
    expect(selfLight.value).toBe(overworldMix.自发光);
  });
});
