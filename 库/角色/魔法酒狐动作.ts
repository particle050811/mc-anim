// 魔法酒狐的表情、眨眼、尾巴：数值抄车万女仆（TLM）1.5.3 的 geckolib/animation/winefox_magical.main.animation.json。
// 纯函数，不 import react、three（分镜、编排这类纯模块也能算）；组件 魔法酒狐.tsx 把结果叠在坐姿表后面。
// 表情取游戏里用过的嘴型：微笑 sit、大笑 jump、惊讶 attacked、难过 idle 饿的分支（food_level ≤ 6）。嘴型都做在头里面，往前推出来才看得见；
// 几种嘴之间游戏里是硬切，这里也不做过渡。`zui` 是小狐狸形态（FOX）的嘴，模型里已经去掉了，不是表情骨骼。
// 眨眼取 pre_parallel3，尾巴取 pre_parallel2。TLM 的控制器顺序是 pre_parallel 在前、main（sit 在里面）在后，
// 后来的控制器把同一根骨骼的转角、位置、缩放整个盖掉（只有名字以 parallel_ 开头的控制器转角是叠加的，见 AnimationProcessor 反汇编），
// 所以坐着时 Tail2 被 sit 盖成 −15°、不摆；眼皮、眉毛 sit 没碰，照常眨。pre_parallel2 的 blend_weight 这个版本的 geckolib 不读，不管。

/** 和 engine/model/基岩模型.tsx 的 BonePose 同形（数值约定同基岩动画文件）；这里不 import 它，免得本文件带上 three */
export type 骨骼姿势 = { rot?: number[]; pos?: number[]; scale?: number | number[] };
type 骨骼表 = Record<string, 骨骼姿势>;

export type 魔法酒狐表情 = '微笑' | '大笑' | '惊讶' | '难过' | '无';
export const 魔法酒狐表情们: readonly 魔法酒狐表情[] = ['微笑', '大笑', '惊讶', '难过', '无'];

const 表情表: Record<魔法酒狐表情, 骨骼表> = {
  微笑: { weixiao: { pos: [0, 0, -0.91406] } },
  大笑: { xiao: { pos: [0, 0, -0.90235] } },
  惊讶: { jingya: { pos: [0, 0, -0.89843] } },
  难过: { kongju: { pos: [0, 0, -0.9] }, EyeBrow: { pos: [0, -0.6, 0] }, RightEyebrow: { rot: [0, 0, -5] }, LeftEyebrow: { rot: [0, 0, 5] } },
  无: {}, // 头的贴图上没画嘴，嘴型都不推就是脸上没有嘴
};

/** 表情的骨骼。坐姿表本身推了 weixiao（游戏里坐着一直在微笑），所以不是微笑时把它盖回 0 */
export const magicalWineFoxFace = (表情: 魔法酒狐表情): 骨骼表 => ({ weixiao: { pos: [0, 0, 0] }, ...表情表[表情] });

// 眨眼（pre_parallel3）：眼皮 scale y 的关键帧，循环 6.8333 秒，插值 catmullrom。开头眨一次，4 秒处连眨两次。
// 关键帧排到 8.0，超过循环长度的那段永远取不到，照抄。眉毛的位置关键帧正好是 −1.5 ×（1 − 眼皮），所以只存眼皮这一条。
const 眨眼周期 = 6.8333;
const 眼皮关键帧: readonly (readonly [number, number])[] = [
  [0, 1], [0.0833, 0], [0.1667, 0], [0.25, 1], [1, 1], [2, 1], [3, 1], [4, 1],
  [4.0833, 0], [4.1667, 1], [4.25, 0], [4.3333, 0], [4.4167, 1], [5.5, 1], [6.8333, 1], [8, 1],
];
/** 一次眨眼的长度（秒）：曲线开头那一下 */
export const 魔法酒狐眨眼时长 = 0.25;

// TLM geckolib 的 catmullrom（CatmullRomKeyFrame、MathUtil.catmullRom 反汇编）：第 i 段从 K[i−1] 到 K[i]，
// 两边的控制点取 K[max(0, i−2)]、K[min(n−1, i+1)]，段内按时间均匀取 u，不按关键帧间距加权
const catmullRom = (u: number, p0: number, p1: number, p2: number, p3: number) => {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  return (2 * p1 - 2 * p2 + v0 + v1) * u ** 3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * u ** 2 + v0 * u + p1;
};
const 取样 = (K: readonly (readonly [number, number])[], t: number): number => {
  const i = K.findIndex(([kt]) => kt > t);
  if (i <= 0) return K[i === 0 ? 0 : K.length - 1]![1];
  const [t1, p1] = K[i - 1]!;
  const [t2, p2] = K[i]!;
  return catmullRom((t - t1) / (t2 - t1), K[Math.max(0, i - 2)]![1], p1, p2, K[Math.min(K.length - 1, i + 1)]![1]);
};
const 夹 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 游戏里自动眨眼在第 秒 秒闭了多少：0 睁 ～ 1 闭，按 6.8333 秒循环。
 * 坑：catmullrom 在「闭、闭」两个关键帧之间会冲过头（眼皮 scale 到 −0.125，眼皮翻过来），所以夹在 [0, 1]
 */
export const magicalWineFoxBlink = (秒: number): number => 1 - 夹(取样(眼皮关键帧, ((秒 % 眨眼周期) + 眨眼周期) % 眨眼周期));

/** 在 开始们（秒）各眨一次（游戏曲线开头那 0.25 秒），不带 4 秒处的连眨；镜头里手放眨眼用 */
export const magicalWineFoxBlinkAt = (秒: number, 开始们: readonly number[]): number =>
  Math.max(0, ...开始们.map((起) => (秒 >= 起 && 秒 < 起 + 魔法酒狐眨眼时长 ? magicalWineFoxBlink(秒 - 起) : 0)));

/** 闭眼程度（0 睁 ～ 1 闭）→ 骨骼：眼皮（子骨骼是发光的虹膜）scale y 压扁，眉毛按同样比例往下，最低 −1.5 */
export const magicalWineFoxBlinkBones = (眨眼: number): 骨骼表 => {
  const c = 夹(眨眼);
  const 眼皮 = { scale: [1, 1 - c, 1] };
  const 眉毛 = { pos: [0, -1.5 * c, 0] };
  return { RightEyelid: 眼皮, LeftEyelid: 眼皮, RightEyebrow: 眉毛, LeftEyebrow: 眉毛 };
};

// 尾巴（pre_parallel2）：Tail…Tail6 的 y、z 转角跟着二阶弹簧 K2·ÿ + K1·ẏ + y = K3·目标 走（parallel4 每次推 0.01 秒），
// 参数 F=2、C=0.8、R=20：K1 = C/(πF)、K2 = 1/(2πF)²、K3 = R·C/(2πF)，即固有频率 F、阻尼比 C、静态增益 K3。
// 目标是 molang2 里的正弦 sin(120°·(t − 延迟))·振幅（v.s=72、v.f=1，周期 3 秒）。
// 这里直接用弹簧的稳态解：振幅 × K3/√((1−r²)² + (2Cr)²)、滞后 atan(2Cr/(1−r²))，r = 驱动频率/F。合下来约 ×1.26、晚 0.13 秒。
// 推断：游戏里弹簧每渲染一帧推 0.01 秒，帧率不是 100 时实际的固有频率会变，这里按实时算；开头的过渡段不算（她已经坐了很久）。
// rot x 的 −0.3·v.L1_P0 和 y 的 −0.1·v.L4_P0 跟走路、转身的速度走，坐着不动时是 0，不算。
const 弹簧 = { F: 2, C: 0.8, R: 20 };
const 尾巴周期 = 3;
const 尾巴目标: readonly { 骨骼: string; 轴: 1 | 2; 振幅: number; 延迟: number }[] = [
  { 骨骼: 'Tail', 轴: 1, 振幅: 5, 延迟: 0 },
  { 骨骼: 'Tail', 轴: 2, 振幅: 10, 延迟: 1 },
  { 骨骼: 'Tail2', 轴: 1, 振幅: 10, 延迟: 0.3 },
  { 骨骼: 'Tail2', 轴: 2, 振幅: 4, 延迟: 1.1 },
  { 骨骼: 'Tail3', 轴: 1, 振幅: 4, 延迟: 0.5 },
  { 骨骼: 'Tail3', 轴: 2, 振幅: 6, 延迟: 1.3 },
  { 骨骼: 'Tail4', 轴: 1, 振幅: 10, 延迟: 0.6 },
  { 骨骼: 'Tail4', 轴: 2, 振幅: 3, 延迟: 1.5 },
  { 骨骼: 'Tail5', 轴: 1, 振幅: 20, 延迟: 0.6 },
  { 骨骼: 'Tail6', 轴: 2, 振幅: 20, 延迟: 1.2 },
];
const 驱动角频率 = (2 * Math.PI) / 尾巴周期;
const 尾巴响应 = (() => {
  const r = 1 / 尾巴周期 / 弹簧.F;
  const K3 = (弹簧.R * 弹簧.C) / (2 * Math.PI * 弹簧.F);
  return { 增益: K3 / Math.hypot(1 - r * r, 2 * 弹簧.C * r), 滞后: Math.atan2(2 * 弹簧.C * r, 1 - r * r) };
})();

/** 第 秒 秒的尾巴骨骼（度）。坐着时不给 Tail2：sit 把它盖成 −15°（坐姿表里已经有） */
export const magicalWineFoxTail = (秒: number, 姿势: '坐' | '站' = '坐'): 骨骼表 => {
  const 表: Record<string, number[]> = {};
  for (const { 骨骼, 轴, 振幅, 延迟 } of 尾巴目标) {
    if (姿势 === '坐' && 骨骼 === 'Tail2') continue;
    (表[骨骼] ??= [0, 0, 0])[轴] = 尾巴响应.增益 * 振幅 * Math.sin(驱动角频率 * (秒 - 延迟) - 尾巴响应.滞后);
  }
  return Object.fromEntries(Object.entries(表).map(([k, rot]) => [k, { rot }]));
};

/** 几层骨骼表按字段合并：同一根骨骼，后面的层只盖它给了的 rot、pos、scale（难过的眉毛转角和眨眼的眉毛位置要同时生效） */
const 合并 = (...层们: 骨骼表[]): 骨骼表 => {
  const 结果: 骨骼表 = {};
  for (const 层 of 层们) for (const [k, v] of Object.entries(层)) 结果[k] = { ...结果[k], ...v };
  return 结果;
};

/**
 * 表情、眨眼、尾巴合成一层，叠在坐姿表后面。三样都不给时是空表，和没有这一层一样。
 * 表情：不给就照姿势表（坐姿表里是微笑）。秒：驱动尾巴和自动眨眼，不给就是静止姿势（尾巴不摆、不自动眨眼）。
 * 眨眼：'auto' 照游戏曲线按 秒 眨，给数字就是手写的闭眼程度 0～1
 */
export const magicalWineFoxMotion = (o: { 姿势: '坐' | '站'; 表情?: 魔法酒狐表情; 眨眼: number | 'auto'; 秒?: number }): 骨骼表 => {
  const 闭眼 = o.眨眼 !== 'auto' ? o.眨眼 : o.秒 === undefined ? undefined : magicalWineFoxBlink(o.秒);
  return 合并(
    o.秒 === undefined ? {} : magicalWineFoxTail(o.秒, o.姿势),
    o.表情 === undefined ? {} : magicalWineFoxFace(o.表情),
    闭眼 === undefined ? {} : magicalWineFoxBlinkBones(闭眼),
  );
};
