// 云组件的配置（用户 11-04「能不能搞成原生支持多层高度，并且可以配置算法？…抽离成可单独配置的组件，不过默认是启用的」）：
// 一份 云配置 = 几层云（层数不设上限，用户 11-04「肯定要允许超过三层」），每层自己的算法、高度、厚、覆盖……，加上整份的天气、曝光、质量档。纯模块（测试直接引）。
// 高度都是世界高度（格），进 Photon 的「云空间」时离海平面的高度 × 云空间倍数（同 engine/light/大气/云.ts 的 CLOUDS_SCALE）。
// 天气 → 各层覆盖、细节、消光照 Photon 的 get_clouds_parameters（同 大气/云.ts 的 cloudParams，那边应力转动在用、一行不改，这里抄一份）。

/** 方块到云空间的倍数（同 大气/云.ts 的 CLOUDS_SCALE，用户 10-14 定的 3） */
export const 云空间倍 = 3;

// 算法表（编号和出处见 docs/云.md 第 1 节；用户 11-04「可以配置算法」）。前四种在光影层画（./着色器.ts 一种一段 GLSL）；
// 原版方块是场景里的网格，光影层跳过它，由场景挂 ./原版方块.tsx；叠片、拉伸2D、烘焙体素只占了名字，配了报错（还没做）。
export const 云算法表 = {
  Photon积云: { 编号: 'A', 画法: '光影层', 说明: '体积：2D 覆盖 × 高度剖面 − 3D Worley 侵蚀，多八度多散射（Photon cumulus.glsl）' },
  Photon高积云: { 编号: 'B', 画法: '光影层', 说明: '体积薄层：同 A，层薄、步少（Photon altocumulus.glsl）' },
  Photon卷云: { 编号: 'C', 画法: '光影层', 说明: '平面：一张球面 + 卷曲噪声，朝太阳走 6 步算光学深度（Photon cirrus.glsl）' },
  贴图层: { 编号: 'C′', 画法: '光影层', 说明: '平面：高积云的覆盖噪声贴在球面上取一次，自阴影两点（Agent 写，用户 11-04 定 B5 远层用）' },
  原版方块: { 编号: 'F', 画法: '场景网格', 说明: '原版 clouds.png 的格子拉成盒子（./原版方块.tsx）' },
  叠片: { 编号: 'D', 画法: '没做', 说明: 'N 片平面叠出厚度（BSL、Lux 的思路，许可不让抄，要自己写）' },
  拉伸2D: { 编号: 'E', 画法: '没做', 说明: '2D 贴图按高度阈值曲线挤出（Complementary Reimagined 的思路，许可不让抄）' },
  烘焙体素: { 编号: 'G', 画法: '没做', 说明: '把 A 的密度烘成 3D 贴图（Nubis³ 的思路）' },
} as const;
export type 云算法 = keyof typeof 云算法表;
export type 光影层云算法 = 'Photon积云' | 'Photon高积云' | 'Photon卷云' | '贴图层';
export const 是光影层算法 = (a: 云算法): a is 光影层云算法 => 云算法表[a].画法 === '光影层';

// 层的字段照 UE、Photon、Bliss 的通行叫法起名（对照表见 docs/云.md 第 2 节），单位一律世界格（组件里乘 云空间倍 进云空间）
export type 云层 = {
  算法: 云算法;
  /** 云底的世界高度（格）。积云是各团里最低的那团的云底 */
  底高: number;
  /** 层顶 − 层底（格）：不给按算法（积云 400、高积云 160、卷云 500、贴图层 60）。积云各团云底再错开 高低差 */
  厚度?: number;
  /** 积云各团云底的高低差（格）：不给 800（Photon 原样 × 云空间倍，见 大气/云.ts 的 CU_BH） */
  高低差?: number;
  /** 覆盖区间 [少, 多]（0～1，大尺度噪声在区间里插值，Photon 的做法）：不给按天气算 */
  覆盖?: readonly [number, number];
  /** 覆盖乘多少（1 = 照天气或 覆盖） */
  覆盖倍?: number;
  /** 消光乘多少（大于 1 更实、更暗） */
  密度?: number;
  /** 噪声的尺寸倍数（大于 1 云团更大）：Photon SIZE */
  尺寸?: number;
  /** 细节（侵蚀噪声）的权重乘多少：Photon DETAIL_STRENGTH */
  细节?: number;
  /** 0 积云 ↔ 1 层云（Photon cumulus_stratus_blend）：不给按天气算。卷云不认 */
  形态?: number;
  /** 云往哪飘（格/秒，场景 x 往东、y 往北）：不给 = 不动（同 Photon 停住的风，首尾帧接得上）。位移只按段内秒数算，逐帧确定 */
  风?: readonly [number, number];
  /** 噪声平移（格，场景 x、y）：换一片云、两层同算法时错开形状 */
  偏移?: readonly [number, number];
  /** 主步数 [地平线, 天顶, 上限]：不给按质量档（Photon 默认 × 步数倍） */
  主步数?: readonly [number, number, number];
  /** 朝太阳几步：不给按质量档 */
  光步数?: number;
  /** 透过率低于这个就不往前走（UE Stop Tracing Transmittance Threshold、Photon 0.075） */
  透射率阈值?: number;
  /** 受不受 光影场.云.洞（让开的竖直圆柱）：不给按算法（积云、高积云、贴图层受，卷云不受） */
  受洞?: boolean;
  /** 受不受 光影场.云.亮（云底被照亮的一块）：只有积云认，不给 = 受 */
  受亮?: boolean;
};

export type 云抖动 = 'Bayer' | '交错梯度' | '蓝噪声';

/** 质量档：每一项都能单独开关（用户 11-04 要「给我过目以后看看质感」，一项一项比） */
export type 云质量 = {
  /** 云在几分之几的边长上算：1 = 成片原分辨率，0.5 = 半边长（四分之一的像素），再按深度加权放大 */
  分辨率: 1 | 0.5;
  /** 主步数是 Photon 默认（积云 40～20、高积云 12～6）的几倍：Photon 靠十几帧时间累积压噪点，我们每帧独立 */
  步数倍: number;
  /** 积云、高积云每一步朝太阳走几步（Photon 默认积云 6、高积云 4） */
  光步: number;
  /** 多次散射的内循环几次（Photon 积云、高积云 8） */
  散射次: number;
  /** 步进起点错开：Bayer = 4×4 固定格子（合成时 4×4 平均掉）；交错梯度 = Jimenez 的交错梯度噪声；蓝噪声 = ./蓝噪声.ts（docs/云.md 第 3 节） */
  抖动: 云抖动;
  /** 积云每一步比上一步长几倍（1 = 等长，同 Photon）：近处细、远处粗（docs/云.md 第 3 节） */
  远步增: number;
  /** 积云的壳顶按 高低差 收紧：false 照 Photon 写死 800 格（高低差改小了，壳上面一大截空跑） */
  紧壳: boolean;
  /** 输入一样时复用上一帧的云（逐像素比深度）：字节不变，乱序出帧就现算 */
  复用: boolean;
};

/** 精确 = 同 大气/云.ts（2-日落划船 等用户看过的画面逐字节一样）；快 = 用户 11-04 定的 B 类都开（画面会变，要过目） */
export const 质量档 = {
  精确: { 分辨率: 1, 步数倍: 4, 光步: 6, 散射次: 8, 抖动: 'Bayer', 远步增: 1, 紧壳: false, 复用: true },
  快: { 分辨率: 0.5, 步数倍: 2, 光步: 4, 散射次: 4, 抖动: '蓝噪声', 远步增: 1.02, 紧壳: true, 复用: true },
} as const satisfies Record<string, 云质量>;
export type 质量档名 = keyof typeof 质量档;

export type 云天气 = { 温度?: number; 湿度?: number; 风?: number };

export type 云配置 = {
  /** 关掉整份云（不给 = 开，用户 11-04「默认是启用的」） */
  开?: boolean;
  /** 天气 0～1（Photon 的 get_clouds_parameters）：不给 温度 0.5、湿度 0.55、风 0.6（同 大气/云.ts 的 defaultWeather） */
  天气?: 云天气;
  /** 云的曝光（乘在散射光上） */
  曝光?: number;
  /** 海平面的世界高度（格）：大气、地球曲率从这里起算。不给按场景的 光影场.海平面，再没有按 0 */
  海平面?: number;
  /** 不给 = 默认三层（积云、高积云、卷云，离海平面 300、1067、2000 格，同 大气/云.ts） */
  层?: readonly 云层[];
  /** 质量档名或在 快 上改几项；不给 = 快 */
  质量?: 质量档名 | ({ 档?: 质量档名 } & Partial<云质量>);
};

/** 一帧里场景给的事（光影场.云）：洞 = 让开的竖直圆柱 [x, y, 半径, 软边]（格），亮 = 云底被照亮的一块，曝光倍 乘在曝光上 */
export type 云底亮 = { 心: readonly [number, number]; 半径: number; 强: number; 色: string };
export type 云场 = { 洞?: readonly [number, number, number, number]; 亮?: 云底亮; 曝光倍?: number };

export const 默认天气 = { 温度: 0.5, 湿度: 0.55, 风: 0.6 } as const;

/** 默认三层（离海平面的高度，格）：积云云底 900 / 3、高积云 3200 / 3、卷云 6000 / 3（大气/云.ts 的 PC_CU_R、PC_AC_R、PC_CI_R） */
export const 默认层们 = (海平面: number): 云层[] => [
  { 算法: 'Photon积云', 底高: 海平面 + 900 / 云空间倍 },
  { 算法: 'Photon高积云', 底高: 海平面 + 3200 / 云空间倍 },
  { 算法: 'Photon卷云', 底高: 海平面 + 6000 / 云空间倍 },
];

export const 默认厚度: Record<光影层云算法, number> = { Photon积云: 400, Photon高积云: 160, Photon卷云: 500, 贴图层: 60 };

export const 取质量 = (q: 云配置['质量']): 云质量 => {
  if (q === undefined) return 质量档.快;
  if (typeof q === 'string') {
    const r = 质量档[q];
    if (!r) throw new Error(`没有云的质量档「${q}」，有：${Object.keys(质量档).join('、')}`);
    return r;
  }
  const { 档, ...改 } = q;
  return { ...取质量(档 ?? '快'), ...改 };
};

/** 一份配置里在光影层画的层（开了才有） */
export const 光影层们 = (c: 云配置 | false | undefined, 海平面: number): 云层[] => {
  if (!c || c.开 === false) return [];
  return (c.层 ?? 默认层们(c.海平面 ?? 海平面)).filter((l) => 是光影层算法(l.算法));
};

// ---------- 天气 → 各层参数（Photon include/weather/clouds.glsl 的 get_clouds_parameters；不下雨。同 大气/云.ts 的 cloudParams） ----------
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const linearStep = (a: number, b: number, x: number) => clamp01((x - a) / (b - a));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const dampen = (x: number) => {
  const c = clamp01(x);
  return c * (2 - c);
};
const cubicSmooth = (x: number) => x * x * (3 - 2 * x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export { smooth as 平滑阶 };

/** 积云厚（云空间米）进了 l0AltScale：大气/云.ts 写死 1200 */
export const 天气参数 = (w: Required<云天气>, sunY: number, 积云厚 = 1200) => {
  const T = w.温度, H = w.湿度, W = w.风;
  const dayFactor = smooth(0, 1, Math.abs(sunY) / 0.3);
  const l0Blend = clamp01(dampen(linearStep(0.5, 1, 1 - T)) * dampen(1 - W));
  const tw = 1 - 0.15 * linearStep(0.6, 1, T);
  const hw = 0.4 * H + 0.5 * H * H;
  const local = 0.1 + 0.1 * W;
  const l0Cov = [clamp01(tw * hw - 0.1 * local + 0.3 * l0Blend * l0Blend), clamp01(tw * hw + local + 0.3 * l0Blend * l0Blend)] as const;
  const torn = linearStep(0.66, 0.9, W) * (1 - l0Blend);
  const l0Detail = [mix(0.33 * (1 + 0.5 * torn), 0.07, l0Blend * l0Blend), mix(0.4 * (1 + 0.5 * torn), 0.1, l0Blend)] as const;
  const l0Edge = [mix(3, 2, l0Blend * l0Blend), mix(12, 7, l0Blend * l0Blend)] as const;
  const l0AltScale = 0.8 / (mix(0.5, 1, smooth(0.4, 0.6, 0.25 * l0Cov[0] + 0.75 * l0Cov[1])) * 积云厚);
  const l1Blend = cubicSmooth(linearStep(0.5, 0.66, 1 - T));
  const ac = (linearStep(0.4, 1, H) * 0.5 + 0.5) * linearStep(0.4, 0.66, W) * linearStep(1, 0.8, T);
  const as = linearStep(0.25, 0.45, W * H);
  const l1Cov = [clamp01(mix(ac * 0.5, as, l1Blend)), clamp01(mix(ac * 1.5, as, l1Blend))] as const;
  const cirrus = clamp01(0.5 * (0.6 - 0.4 * linearStep(0.5, 0.9, T) ** 2 + 0.4 * (1 - linearStep(0, 0.2, T))) * (1 - 0.5 * linearStep(0.5, 0.75, H)));
  const cirrocumulus = 0.8 * dampen((1 - 0.3 * linearStep(0.5, 1, T)) * (0.5 + 0.5 * linearStep(0.4, 1, H)) * W ** 1.5);
  const l0Shadow = linearStep(0.7, 1, (0.25 * l1Cov[0] + 0.75 * l1Cov[1]) * (1 + l1Blend)) * dampen(dayFactor);
  let ext = mix(0.05, 0.1, smooth(0, 0.3, Math.abs(sunY))) * (1 - 0.6 * l0Shadow);
  ext *= 1 - 0.4 * linearStep(0.8, 1, l0Cov[1] - l0Cov[1] * l0Blend);
  ext *= 1 - 0.5 * l0Blend;
  return { l0Cov, l0Detail, l0Edge, l0AltScale, l0Blend, l0Ext: ext, l0Shadow, l1Cov, l1Blend, cirrus, cirrocumulus, dayFactor };
};
