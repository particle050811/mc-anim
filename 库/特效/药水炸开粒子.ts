// 药水炸开的粒子（纯模块，不引 react、three）：照 1.20.1 `LevelRenderer.levelEvent` 2007 抽出生参数，再按刻求位置、贴图帧、大小。出处和常数见 药水炸开.tsx 文件头。
// 随机数按 seed 一条 mulberry32 串，先 8 个物品碎片、后 count 个效果粒子；颜色只给明暗系数 shade（0.75～1），药水色和掺白由组件乘（要 three 的 Color 解析色值）。
import type { V3 } from '../../engine/core/坐标.ts';
import { mulberry32 } from '../../engine/core/数学.ts';

// 粒子画大 1.4 倍（参考视频里游戏尺寸看不见）
const visualScale = 1.4;

const gauss = (rand: () => number) => {
  const uniformSample = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(uniformSample)) * Math.cos(2 * Math.PI * rand());
};

export type PotionSpell = { p: V3; v: V3; life: number; half: number; shade: number };
export type PotionChip = { p: V3; v: V3; life: number; half: number; uo: number; vo: number };

// at：砸中的位置；count：效果粒子的个数（游戏里 100）
export const potionSplashSpawns = (at: V3, seed: number, count: number): { spells: PotionSpell[]; chips: PotionChip[] } => {
  const rand = mulberry32(seed * 4099 + 11);
  const chips: PotionChip[] = Array.from({ length: 8 }, () => {
    // Particle 构造函数里的随机速度 ×0.1 再加上给定的速度
    const rv = () => (rand() * 2 - 1) * 0.4 * 0.1;
    return {
      p: [...at] as V3,
      v: [gauss(rand) * 0.15 + rv(), gauss(rand) * 0.15 + rv(), rand() * 0.2 + rv()] as V3,
      life: Math.floor(4 / (rand() * 0.9 + 0.1)),
      half: 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.5,
      uo: Math.floor(rand() * 4),
      vo: Math.floor(rand() * 4),
    };
  });
  const spells: PotionSpell[] = Array.from({ length: count }, () => {
    const power = rand() * 4;
    const angle = rand() * Math.PI * 2;
    const d2 = Math.cos(angle) * power;
    const d4 = Math.sin(angle) * power;
    const d3 = 0.01 + rand() * 0.5;
    // `SpellParticle`：传给 Particle 的水平速度是 0.5 - 随机，竖直是 d3；Particle 再加随机、归一化到 (随机+随机+1)×0.15×0.4
    let x = 0.5 - rand() + (rand() * 2 - 1) * 0.4;
    let y = d3 + (rand() * 2 - 1) * 0.4;
    let z = 0.5 - rand() + (rand() * 2 - 1) * 0.4;
    const len = Math.hypot(x, y, z) || 1;
    const speed = (rand() + rand() + 1) * 0.15 * 0.4;
    x = (x / len) * speed;
    y = (y / len) * speed + 0.1;
    z = (z / len) * speed;
    y *= 0.2;
    x *= power;
    y = (y - 0.1) * power + 0.1;
    z *= power;
    const f3 = 0.75 + rand() * 0.25;
    // MC 坐标（y 朝上）→ 场景（z 朝上）：(x, z, y) 里南北随便取，这里 (x, -z, y)
    return {
      p: [at[0] + d2 * 0.1, at[1] - d4 * 0.1, at[2] + 0.3] as V3,
      v: [x, -z, y] as V3,
      life: Math.floor(8 / (rand() * 0.8 + 0.2)),
      half: 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75,
      shade: f3,
    };
  });
  return { spells, chips };
};

// 第 tick 刻还活着的粒子：index = 在出生表里的序号；size = 画出来的边长（已乘画大倍数）；效果粒子给贴图帧 spell_<frame>（7 → 0 逐帧变小）
export const potionSplashAt = (spawns: { spells: PotionSpell[]; chips: PotionChip[] }, tick: number) => {
  const spells: { index: number; pos: V3; frame: number; size: number }[] = [];
  const chips: { index: number; pos: V3; size: number }[] = [];
  spawns.spells.forEach((spell, i) => {
    if (tick >= spell.life) return;
    // 每刻：位置 += 速度；速度 ×0.96；竖直速度 += 0.004（gravity -0.1 × 0.04）
    const k = (1 - 0.96 ** tick) / 0.04;
    const rise = (0.004 * (tick - k)) / 0.04; // Σ 0.004×(1-0.96^n)/0.04 的闭式近似
    const pos: V3 = [spell.p[0] + spell.v[0] * k, spell.p[1] + spell.v[1] * k, spell.p[2] + spell.v[2] * k + rise];
    spells.push({ index: i, pos, frame: 7 - Math.min(7, Math.floor((tick / spell.life) * 8)), size: spell.half * 2 * visualScale });
  });
  spawns.chips.forEach((chip, i) => {
    if (tick >= chip.life) return;
    // 每刻：速度 ×0.98，竖直 -= 0.04（gravity 1.0）
    const k = (1 - 0.98 ** tick) / 0.02;
    const fall = (0.04 * (tick - k)) / 0.02;
    const pos: V3 = [chip.p[0] + chip.v[0] * k, chip.p[1] + chip.v[1] * k, chip.p[2] + chip.v[2] * k - fall];
    chips.push({ index: i, pos, size: chip.half * 2 * visualScale });
  });
  return { spells, chips };
};
