// 二阶系统：YSM 的 ysm.second_order(名字, 输入, frequency, coefficient, response)，头发、裙摆、胸部跟着输入晃的那个弹簧。纯模块。
// 定义是推断的：YSM 2.6.5 的 Molang 在原生库里（META-INF/native/libysm-core.so，字符串加了密，查不到实现），官方 wiki
// （yesstevemodel.github.io/wiki/molang/ref）只给了签名和「二阶系统函数」一句。这里照参数名一样的通行写法（t3ssel8r「Giving Personality to
// Procedural Animations using Math」的 SecondOrderDynamics）：f 固有频率（赫兹）、ζ 阻尼比、r 初始响应，
//   k1 = ζ/(πf)，k2 = 1/(2πf)²，k3 = rζ/(2πf)；每步 y += T·y′；y′ += T·(x + k3·x′ − y − k1·y′)/k2，k2 取不小于 T²/2 + T·k1/2、T·k1（步长大了也不发散）。
// 游戏里每渲染一帧推一步，结果跟帧率走。这里要「结果只看时间」（docs/新生物.md 控制器一节）：从第 0 秒起按固定步长推到要的时刻，
// 中途每隔一段存一份状态，最近推过的各步也留着，倒着取、跳着取都从留着的最近一步接着推，推出来的数和一口气从 0 推到底逐位相同。
import type { MolangValue } from './Molang.ts';

export type SecondOrderConst = { k1: number; k2: number; k3: number };
export type SecondOrderState = { readonly y: number; readonly yd: number; readonly prevX: number };

export const SecondOrderConst = (f: number, ζ: number, r: number): SecondOrderConst => ({
  k1: ζ / (Math.PI * f),
  k2: 1 / (2 * Math.PI * f) ** 2,
  k3: (r * ζ) / (2 * Math.PI * f),
});

/** 第一次见到输入：输出就停在输入上，速度 0 */
export const secondOrderStart = (x: number): SecondOrderState => ({ y: x, yd: 0, prevX: x });

/** 推一步 T 秒，这一步的输入是 x */
export const secondOrderStep = (secondOrderState: SecondOrderState, x: number, T: number, { k1, k2, k3 }: SecondOrderConst): SecondOrderState => {
  if (!(T > 0)) return secondOrderState;
  const xd = (x - secondOrderState.prevX) / T;
  const stableK2 = Math.max(k2, (T * T) / 2 + (T * k1) / 2, T * k1);
  const y = secondOrderState.y + T * secondOrderState.yd;
  const yd = secondOrderState.yd + (T * (x + k3 * xd - y - k1 * secondOrderState.yd)) / stableK2;
  return { y, yd, prevX: x };
};

/** 交给 Molang环境.函数 的 'ysm.second_order'：参数 = [名字, 输入, f, ζ, r] */
export type SecondOrderFn = (argParams: readonly MolangValue[]) => number;

const toNumber = (v: MolangValue | undefined): number => (typeof v === 'number' ? v : 0);

/** 稳态：输入不变时二阶系统的输出就是输入本身（不晃） */
export const secondOrderSteady: SecondOrderFn = (argParams) => toNumber(argParams[1]);

export type SecondOrderStepper = {
  /** 推到 秒，得到那一刻各系统的输出（按名字查；这一路没出现过的名字原样给输入） */
  在: (sec: number) => SecondOrderFn;
  statesAt: (sec: number) => ReadonlyMap<string, SecondOrderState>;
};

/**
 * 跑(秒, second_order)：把角色在 秒 这一刻的动画求一遍，里面的 ysm.second_order 都调这个函数（只为了让各系统拿到这一刻的输入）。
 * 它得是时间的纯函数：同一个 秒 每次给出同样的输入。同一步里同一个名字调几次只推一次，后几次拿同一个输出。
 * 步长默认 1/60 秒（60 帧成片的每一帧正好落在格上）；不在格上的时刻，从前一格再推不满一步，不写回存档。
 */
export const SecondOrderStepper = (run: (sec: number, second_order: SecondOrderFn) => void, options: { stepSec?: number; saveEverySteps?: number; keepRecentSteps?: number } = {}): SecondOrderStepper => {
  const h = options.stepSec ?? 1 / 60;
  const gap = options.saveEverySteps ?? 60;
  type StateMap = ReadonlyMap<string, SecondOrderState>;
  const saved = new Map<number, StateMap>();
  // 最近推过的各步的状态（超了丢最早推的）：一帧里会按几个时刻来回取（当前、法术出手那一刻、往前几帧），只留一份的话每换一个时刻都要从存档重推几十步，每步把动画求一遍
  const nearTables = new Map<number, StateMap>();
  const recentLimit = options.keepRecentSteps ?? 600;
  const remember = (stepIndex: number, stateMap: StateMap) => {
    nearTables.set(stepIndex, stateMap);
    if (nearTables.size > recentLimit) nearTables.delete(nearTables.keys().next().value!);
  };

  const advance = (prev: StateMap, sec: number, T: number): StateMap => {
    const next = new Map(prev);
    const advanced = new Set<string>();
    run(sec, (argParams) => {
      const inputName = String(argParams[0]);
      const x = toNumber(argParams[1]);
      if (!advanced.has(inputName)) {
        advanced.add(inputName);
        const prevState = prev.get(inputName);
        const f = toNumber(argParams[2]);
        // f ≤ 0 没有意义（k 会除以 0），当成直通
        next.set(inputName, prevState && f > 0 ? secondOrderStep(prevState, x, T, SecondOrderConst(f, toNumber(argParams[3]), toNumber(argParams[4]))) : secondOrderStart(x));
      }
      return next.get(inputName)!.y;
    });
    return next;
  };

  const statesAt = (sec: number): StateMap => {
    const t = Math.max(0, sec);
    const n = Math.floor(t / h + 1e-9);
    // 从第 n 步往回找留着的最近一步（哪一份都是从第 0 步一步步推出来的）
    let stepIndex = n;
    let cached = nearTables.get(stepIndex) ?? saved.get(stepIndex);
    while (!cached && stepIndex > 0) {
      stepIndex--;
      cached = nearTables.get(stepIndex) ?? saved.get(stepIndex);
    }
    if (!cached) remember(0, (cached = advance(new Map(), 0, 0)));
    while (stepIndex < n) {
      stepIndex++;
      cached = advance(cached, stepIndex * h, h);
      if (stepIndex % gap === 0) saved.set(stepIndex, cached);
      remember(stepIndex, cached);
    }
    const remainder = t - n * h;
    return remainder > 1e-9 ? advance(cached, t, remainder) : cached;
  };

  return {
    statesAt,
    在: (sec) => {
      const stateMap = statesAt(sec);
      return (argParams) => stateMap.get(String(argParams[0]))?.y ?? toNumber(argParams[1]);
    },
  };
};
