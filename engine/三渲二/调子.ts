// 调子：一套色板项的形状，3D 平涂、描边和整片后期都从它取数（05-画风 原则 1：一张色板管全片）。纯模块，作品的 色板.ts 照这个形状写。
// 颜色都是 sRGB 十六进制；调色在 sRGB 数值上做（SVG 滤镜 color-interpolation-filters="sRGB"），和设计软件里拖曲线的感觉一致。

export type 调色 = {
  /** 饱和度倍数，1 = 不变（按 Rec.709 亮度权重） */
  饱和: number;
  /** 对比度，绕 0.5 拉伸，1 = 不变 */
  对比: number;
  /** 乘色：整体乘上这个颜色（白 = 不变），偏暖偏冷靠它 */
  乘: string;
  /** 抬黑：纯黑抬到这个颜色、纯白不动（黑 = 不变），褪色、胶片感靠它 */
  抬: string;
  /** 暗角：四角压暗的不透明度，0 = 没有 */
  暗角: number;
  /** 颗粒：叠加层的不透明度，0 = 没有 */
  颗粒: number;
};

export type 调子 = {
  /** 3D 平涂里乘在受光面上的整体色调（白 = 贴图原色），夜里压暗偏蓝、夕阳偏暖；发光的部分不乘 */
  色调: string;
  /** 3D 画布的背景（天空）色 */
  天: string;
  /** 描边颜色 */
  描边: string;
  /** 整片后期的调色（3D、2D 一起） */
  调色: 调色;
};

const 拆色 = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`颜色要写成 #rrggbb：${hex}`);
  const v = parseInt(m[1]!, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const 合色 = (c: readonly number[]) =>
  '#' + c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');

/** feColorMatrix 的 20 个数（行优先，偏移以 0～1 计）：抬黑 ∘ 乘色 ∘ 对比 ∘ 饱和，都是仿射变换，合成一个矩阵 */
export const 调色矩阵 = (t: 调色): number[] => {
  const w = [0.2126, 0.7152, 0.0722];
  const s = t.饱和;
  const g = 拆色(t.乘);
  const l = 拆色(t.抬);
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    // 饱和：x' = s·x + (1 − s)·亮度；对比：c·x' + 0.5(1 − c)；乘色、抬黑：l + (1 − l)·g·x
    const k = (1 - l[i]!) * g[i]! * t.对比;
    for (let j = 0; j < 3; j++) out.push(k * ((i === j ? s : 0) + (1 - s) * w[j]!));
    out.push(0, l[i]! + (1 - l[i]!) * g[i]! * 0.5 * (1 - t.对比));
  }
  out.push(0, 0, 0, 1, 0);
  return out;
};

const 插数 = (a: number, b: number, k: number) => a + (b - a) * k;
const 插色 = (a: string, b: string, k: number) => {
  const [x, y] = [拆色(a), 拆色(b)];
  return 合色(x.map((v, i) => 插数(v, y[i]!, k)));
};

/** 两套调子之间插值（k = 0 是 a、1 是 b），给转场、慢慢褪色用；颜色在 sRGB 数值上线性插 */
export const 插调子 = (a: 调子, b: 调子, k: number): 调子 => ({
  色调: 插色(a.色调, b.色调, k),
  天: 插色(a.天, b.天, k),
  描边: 插色(a.描边, b.描边, k),
  调色: {
    饱和: 插数(a.调色.饱和, b.调色.饱和, k),
    对比: 插数(a.调色.对比, b.调色.对比, k),
    乘: 插色(a.调色.乘, b.调色.乘, k),
    抬: 插色(a.调色.抬, b.调色.抬, k),
    暗角: 插数(a.调色.暗角, b.调色.暗角, k),
    颗粒: 插数(a.调色.颗粒, b.调色.颗粒, k),
  },
});
