// 调子：一套色板项的形状，3D 平涂、描边和整片后期都从它取数（05-画风 原则 1：一张色板管全片）。纯模块，作品的 色板.ts 照这个形状写。
// 颜色都是 sRGB 十六进制；调色在 sRGB 数值上做（SVG 滤镜 color-interpolation-filters="sRGB"），和设计软件里拖曲线的感觉一致。

export type Grade = {
  /** 饱和度倍数，1 = 不变（按 Rec.709 亮度权重） */
  饱和: number;
  /** 对比度，绕 0.5 拉伸，1 = 不变 */
  对比: number;
  /** 乘色：整体乘上这个颜色（白 = 不变），偏暖偏冷靠它 */
  multiply: string;
  /** 抬黑：纯黑抬到这个颜色、纯白不动（黑 = 不变），褪色、胶片感靠它 */
  lift: string;
  /** 暗角：四角压暗的不透明度，0 = 没有 */
  暗角: number;
  /** 颗粒：叠加层的不透明度，0 = 没有 */
  颗粒: number;
};

export type Tone = {
  /** 3D 平涂里乘在受光面上的整体色调（白 = 贴图原色），夜里压暗偏蓝、夕阳偏暖；发光的部分不乘 */
  tint: string;
  /** 3D 画布的背景（天空）色 */
  天: string;
  /** 描边颜色 */
  outlineColor: string;
  /** 整片后期的调色（3D、2D 一起） */
  grade: Grade;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`颜色要写成 #rrggbb：${hex}`);
  const v = parseInt(m[1]!, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const blendColor = (c: readonly number[]) =>
  '#' + c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');

/** feColorMatrix 的 20 个数（行优先，偏移以 0～1 计）：抬黑 ∘ 乘色 ∘ 对比 ∘ 饱和，都是仿射变换，合成一个矩阵 */
export const gradeMatrix = (t: Grade): number[] => {
  const w = [0.2126, 0.7152, 0.0722];
  const s = t.饱和;
  const g = hexToRgb(t.multiply);
  const l = hexToRgb(t.lift);
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

const lerpNumber = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpColor = (a: string, b: string, k: number) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return blendColor(x.map((v, i) => lerpNumber(v, y[i]!, k)));
};

/** 两套调子之间插值（k = 0 是 a、1 是 b），给转场、慢慢褪色用；颜色在 sRGB 数值上线性插 */
export const lerpTone = (a: Tone, b: Tone, k: number): Tone => ({
  tint: lerpColor(a.tint, b.tint, k),
  天: lerpColor(a.天, b.天, k),
  outlineColor: lerpColor(a.outlineColor, b.outlineColor, k),
  grade: {
    饱和: lerpNumber(a.grade.饱和, b.grade.饱和, k),
    对比: lerpNumber(a.grade.对比, b.grade.对比, k),
    multiply: lerpColor(a.grade.multiply, b.grade.multiply, k),
    lift: lerpColor(a.grade.lift, b.grade.lift, k),
    暗角: lerpNumber(a.grade.暗角, b.grade.暗角, k),
    颗粒: lerpNumber(a.grade.颗粒, b.grade.颗粒, k),
  },
});
