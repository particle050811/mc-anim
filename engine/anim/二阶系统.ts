// 二阶系统：YSM 的 ysm.second_order(名字, 输入, frequency, coefficient, response)，头发、裙摆、胸部跟着输入晃的那个弹簧。纯模块。
// 定义是推断的：YSM 2.6.5 的 Molang 在原生库里（META-INF/native/libysm-core.so，字符串加了密，查不到实现），官方 wiki
// （yesstevemodel.github.io/wiki/molang/ref）只给了签名和「二阶系统函数」一句。这里照参数名一样的通行写法（t3ssel8r「Giving Personality to
// Procedural Animations using Math」的 SecondOrderDynamics）：f 固有频率（赫兹）、ζ 阻尼比、r 初始响应，
//   k1 = ζ/(πf)，k2 = 1/(2πf)²，k3 = rζ/(2πf)；每步 y += T·y′；y′ += T·(x + k3·x′ − y − k1·y′)/k2，k2 取不小于 T²/2 + T·k1/2、T·k1（步长大了也不发散）。
// 游戏里每渲染一帧推一步，结果跟帧率走。这里要「结果只看时间」（docs/新生物.md 控制器一节）：从第 0 秒起按固定步长推到要的时刻，
// 中途每隔一段存一份状态，倒着取、跳着取都从最近的存档接着推，推出来的数和一口气从 0 推到底逐位相同。
import type { Molang值 } from './Molang.ts';

export type 二阶常数 = { k1: number; k2: number; k3: number };
export type 二阶状态 = { readonly y: number; readonly yd: number; readonly 上次x: number };

export const 二阶常数 = (f: number, ζ: number, r: number): 二阶常数 => ({
  k1: ζ / (Math.PI * f),
  k2: 1 / (2 * Math.PI * f) ** 2,
  k3: (r * ζ) / (2 * Math.PI * f),
});

/** 第一次见到输入：输出就停在输入上，速度 0 */
export const 二阶起始 = (x: number): 二阶状态 => ({ y: x, yd: 0, 上次x: x });

/** 推一步 T 秒，这一步的输入是 x */
export const 二阶一步 = (状态: 二阶状态, x: number, T: number, { k1, k2, k3 }: 二阶常数): 二阶状态 => {
  if (!(T > 0)) return 状态;
  const xd = (x - 状态.上次x) / T;
  const 稳k2 = Math.max(k2, (T * T) / 2 + (T * k1) / 2, T * k1);
  const y = 状态.y + T * 状态.yd;
  const yd = 状态.yd + (T * (x + k3 * xd - y - k1 * 状态.yd)) / 稳k2;
  return { y, yd, 上次x: x };
};

/** 交给 Molang环境.函数 的 'ysm.second_order'：参数 = [名字, 输入, f, ζ, r] */
export type 二阶函数 = (参: readonly Molang值[]) => number;

const 数 = (v: Molang值 | undefined): number => (typeof v === 'number' ? v : 0);

/** 稳态：输入不变时二阶系统的输出就是输入本身（不晃） */
export const 二阶稳态: 二阶函数 = (参) => 数(参[1]);

export type 二阶推进器 = {
  /** 推到 秒，得到那一刻各系统的输出（按名字查；这一路没出现过的名字原样给输入） */
  在: (秒: number) => 二阶函数;
  状态在: (秒: number) => ReadonlyMap<string, 二阶状态>;
};

/**
 * 跑(秒, second_order)：把角色在 秒 这一刻的动画求一遍，里面的 ysm.second_order 都调这个函数（只为了让各系统拿到这一刻的输入）。
 * 它得是时间的纯函数：同一个 秒 每次给出同样的输入。同一步里同一个名字调几次只推一次，后几次拿同一个输出。
 * 步长默认 1/60 秒（60 帧成片的每一帧正好落在格上）；不在格上的时刻，从前一格再推不满一步，不写回存档。
 */
export const 二阶推进器 = (跑: (秒: number, second_order: 二阶函数) => void, 选项: { 步长?: number; 存档每几步?: number } = {}): 二阶推进器 => {
  const h = 选项.步长 ?? 1 / 60;
  const 隔 = 选项.存档每几步 ?? 60;
  type 表 = ReadonlyMap<string, 二阶状态>;
  const 存档 = new Map<number, 表>();
  let 最近: { 步: number; 表: 表 } | undefined;

  const 走 = (前: 表, 秒: number, T: number): 表 => {
    const 后 = new Map(前);
    const 推过 = new Set<string>();
    跑(秒, (参) => {
      const 名 = String(参[0]);
      const x = 数(参[1]);
      if (!推过.has(名)) {
        推过.add(名);
        const 旧 = 前.get(名);
        const f = 数(参[2]);
        // f ≤ 0 没有意义（k 会除以 0），当成直通
        后.set(名, 旧 && f > 0 ? 二阶一步(旧, x, T, 二阶常数(f, 数(参[3]), 数(参[4]))) : 二阶起始(x));
      }
      return 后.get(名)!.y;
    });
    return 后;
  };

  const 状态在 = (秒: number): 表 => {
    const t = Math.max(0, 秒);
    const n = Math.floor(t / h + 1e-9);
    let 步: number;
    let 现: 表;
    const 档 = Math.floor(n / 隔) * 隔;
    if (最近 && 最近.步 <= n && 最近.步 >= 档) ({ 步, 表: 现 } = 最近);
    else {
      let k = 档;
      while (k > 0 && !存档.has(k)) k -= 隔;
      if (k > 0) [步, 现] = [k, 存档.get(k)!];
      else [步, 现] = [0, 走(new Map(), 0, 0)];
    }
    while (步 < n) {
      步++;
      现 = 走(现, 步 * h, h);
      if (步 % 隔 === 0) 存档.set(步, 现);
    }
    最近 = { 步, 表: 现 };
    const 余 = t - n * h;
    return 余 > 1e-9 ? 走(现, t, 余) : 现;
  };

  return {
    状态在,
    在: (秒) => {
      const 表 = 状态在(秒);
      return (参) => 表.get(String(参[0]))?.y ?? 数(参[1]);
    },
  };
};
