// 三渲二光影层的参数和几组预设（用户 11-02 定：自己写光影，先出静帧给他挑风格）。纯模块。
// 预设只照实机截图（数据根 run/草稿/光影包实机/）的观感调数，不搬任何光影包的代码：Complementary、BSL、Super Duper Vanilla 都不许转发代码。
// 颜色都是 sRGB 数值上的乘数（同 平涂.tsx 在 sRGB 数值上乘），乘在平涂算好的颜色上：白 = 不变；可以大于 1（受光面提亮），所以另给 强。
// 时段：白天、日落、夜三套灯，场景没说就按平涂色调猜（光影渲染.tsx 的 猜时段）。
import type { CloudLayer, CloudScene, CloudConfig } from '../../light/云/配置.ts';
import type { SkyColorAlgorithm } from '../../light/天/Photon天.ts';

export type TimeOfDay = '白天' | '日落' | '夜';

export type DaypartLight = {
  /** 场景没给太阳方向时用：仰角（度）、相对镜头朝向的方位（度）。坑：代码里正 = 从镜头背后偏左照过来、负 = 偏右（原注释写反了；各段看过的画面都是按代码出的，所以改注释不改代码） */
  sunElevation: number;
  sunAzimuth: number;
  /** 受光面乘的颜色和倍数 */
  sunColor: string;
  sunIntensity: number;
  /** 影子里（被挡、背着太阳）乘的颜色和倍数 */
  shadowColor: string;
  shadowStrength: number;
  /** 受光面按朝向（法线和太阳的夹角）再亮暗多少：0 = 只分受光和影子两档（平涂味），1 = 照余弦 */
  facing: number;
  /** 平涂的 MC 面明暗留几成：1 = 原样（顶 1、南北 0.8、东西 0.6、底 0.5），0 = 不要（全靠太阳分明暗） */
  faceShadeK: number;
  /** 发光区（灯笼、火把）里乘的倍数（大于 1 才吃得到泛光） */
  glowStrength: number;
  /** 灯光：发光区往外照多远（格）、颜色和倍数；强 0 = 不照 */
  lampLight: { radius: number; 色: string; 强: number };
  /** 泛光：线性颜色最亮的通道超过 阈 的部分往外晕（软 是渐入的宽），强 是叠回去的倍数，宽 0～1 是光晕往外扩多远（不给 = 0，紧贴着亮处）。
   *  阈 定在受光面最亮（白 × 日光强）之上：只有水面碎光、发光区（× 发光强）晕得出来（粒子另走 粒子晕），人物的发光贴图（满亮度也只到 1）不晕，脸不被冲白 */
  bloom: { threshold: number; softKnee: number; 强: number; 宽?: number };
  /** 粒子（烟花火花、闪光这类粒子面片）进泛光的倍数：不过阈，画面里的粒子颜色不变；0 = 不晕 */
  particleGlow: number;
  /** 粒子照亮（光影选项.粒子照亮 开了才用）：烟花火花这类粒子当点光源照周围的方块和人，照多远（格）、多亮；按原版方块光一格一级（15 级），不打影子 */
  particleLight: { radius: number; 强: number };
  /** 水面（海面这种认得的水材质）：天顶色（反射往上看到的天）、反射多少、太阳碎光的颜色和倍数；
   *  水体：不反光的那部分的颜色（不用原版水贴图，用户 11-02 定去掉原版颗粒），近反射：正对着往下看也至少反射这么多（近处也看得到波纹） */
  水: { zenithColor: string; reflectivity: number; glintColor: string; glintStrength: number; waterBodyColor: string; nearReflect: number };
};

export type ShadingGrade = {
  /** 都在 sRGB 数值上做：饱和、对比绕 0.5、暗部往 暗色 推、亮部往 亮色 推（分离色调），强度 0～1 */
  saturation: number;
  对比: number;
  darkColor: string;
  brightColor: string;
  colorSplit: number;
};

export type ShadingParams = {
  名: string;
  /** 仿哪个包（只是观感参照） */
  shaderPack: string;
  白天: DaypartLight;
  日落: DaypartLight;
  夜: DaypartLight;
  grade: ShadingGrade;
  /** 影子按贴图像素（1/16 格）一格一格算：边是硬的方块台阶，和方块、人物的像素一样大 */
  pixelShadow: boolean;
  /** 不按像素算影子时，影子边按相邻 2×2 纹素双线性加权过滤（不给就是硬比较，一个画面像素只取一次）：
   *  硬比较时影子图纹素比贴图像素粗，和纹素行差一点点没对齐的影子边会一格一格错开成锯齿（用户 11-07 看 2-收集快乐 屋檐影子）。像素阴影开着时不起作用 */
  shadowFilter?: boolean;
  /** 不按像素算影子时，影子图的格子和方块对齐（横轴转到画面里最横的那条方块轴），纹素按框取到最细：那个方向的方块边投出来是直的。见 光影渲染.tsx 的 摆影子机 */
  shadowAlign?: boolean;
  /** 影子图边长（纹素），不给是 4096。对齐只把一条方块轴投直，别的方向的边（斜的、另一条轴、人物）光贴着地斜照时仍按纹素一格格错开，边长翻倍台阶减半 */
  shadowMapSize?: number;
  /** 太阳影子怎么算，不给是 '影子图'（正交深度图，上面三项管它）。'光线' = 每个画面像素朝太阳打射线和挡光的三角形求交（光线影子.ts），影子边由几何定、放多大都直，
   *  镂空贴图的影子边落在贴图像素边上（用户 11-07「这个东西不应该用矢量图去存…像素无限放大」）。像素阴影开着时不起作用，照旧走影子图 */
  shadowAlgo?: '影子图' | '光线';
};

/** 场景交代给光影的事实（三渲二画布的 光影场）：和样式无关，不开光影时不管 */
export type ShadingSceneParams = {
  /** 不给按平涂色调猜 */
  timeOfDay?: TimeOfDay;
  /** 太阳方向（场景坐标，Z 朝上，指向太阳），不给按时段的仰角、方位跟着镜头摆 */
  sun?: readonly [number, number, number];
  /** 没给 太阳 时，时段的仰角、方位按这个镜头朝向摆（场景坐标，镜头看的方向），整段太阳不动；不给 = 跟着每一帧的镜头转。
   *  镜头一转太阳跟着转，草的十字面一齐翻面、影子边一格一格地爬（用户 11-03「为什么上一帧草有的阴影 下一帧就没了？」「这边边缘像素为什么光影会乱动？」） */
  sunRefDir?: readonly [number, number, number];
  /** 海面的世界高度（Photon 云层从这里起算），不给按 0 */
  海平面?: number;
  /** 太阳（月亮）照进来几成，0～1：月落、日出这种慢慢变的；0 = 受光面和影子里一样。不给 = 1 */
  lightIntensity?: number;
  /** 光影层的云这一帧的事（engine/light/云/配置.ts 的 云场）：洞 = 让开的竖直圆柱 [x, y, 半径, 软边]（格），亮 = 云底被照亮的一块，曝光倍 = 乘在云的曝光上（闪电、转晴） */
  cloud?: CloudScene;
  /** 这个场景的云层（世界高度，格）：样式（光影选项.云.层）没写时用；都没写按默认三层 */
  cloudLayers?: readonly CloudLayer[];
};

/** 补一盏灯（光影选项.补光）：不打影子，叠在太阳、影子之上，场景坐标（Z 朝上，同 光影场.太阳）。
 *  方向光：方向 = 指向光源，'镜头' = 从镜头那边照过去（跟着镜头转，往上抬 20°）；点光：位置、半径（格），照到的亮度按距离平方衰减到半径处为 0。
 *  色是 sRGB，强 是倍数（同 时段光 的 日光强，1 = 正对着照时整面亮一倍原色）；
 *  只补影子里 = 太阳照到的地方不补（按照到几成减），提帽檐下的脸、不把受光的浅色衣服、蛋糕照白冒光；
 *  色 = '受光减影子'：颜色取这一时段 日光 减 阴影（连 基准亮度、光强 算上），强 = 补回几成，1 = 正对着光的面影子里和受光一样亮、一样色
 *  （影子的蓝紫补不掉，脸补亮了还发紫，用户 11-03「补光的强度不够大 脸部还是有明显的区别」） */
export type FillLight = {
  lightDir?: readonly [number, number, number] | '镜头';
  位置?: readonly [number, number, number];
  radius?: number;
  色: string | '受光减影子';
  强: number;
  fillShadowOnly?: boolean;
};

/** 光影的样式（作品默认值里按段列的、试看时 --shading 给的）。时段、太阳一般不写，由场景经 光影场 给；写了盖掉场景的（试看用） */
export type ShadingOptions = {
  preset: ShadingPresetName | ShadingParams;
  timeOfDay?: TimeOfDay;
  sun?: readonly [number, number, number];
  sunRefDir?: readonly [number, number, number];
  /** 水面的样式：原版贴图 = 场景自己的水不动（不给也是）；平滑波纹 = 波纹法线连续（仿 Complementary Unbound 的碎金，用户 11-02 挑的 12 号）；
   *  像素波纹 = 同一套波纹，法线和高光按贴图像素（1/16 格）量化，和方块、人物的像素一样大。后两种都不用原版水贴图；
   *  Photon波纹、FFT海（Ultra-Water 的谱）、FFT像素：用户 11-05 要并排比的几版，三种共用 GGX 太阳和坡度方差的光（着色.ts） */
  水?: '原版贴图' | '平滑波纹' | '像素波纹' | 'Photon波纹' | 'FFT海' | 'FFT像素';
  /** FFT海、FFT像素 的风速（米/秒，不给 5）：越大浪越高、越碎 */
  waterWindSpeed?: number;
  /** FFT 海的涌浪（远处风暴传来的长浪，Ultra-Water 默认 0.7，按 7 m/s 风、900 km 风区）：0 = 只有本地风浪。
   *  镜头贴着水面时涌浪的浪头和视线一样高，远处连成一排背光的黑浪挡住地平线（用户 11-05 看到） */
  waterSwell?: number;
  /** Photon波纹、FFT 的浪强（坡度倍数，不给 1；Photon 下雨时相当于 4.75） */
  waveStrength?: number;
  /** FFT 的水体按散射算（照 Ultra-Water），给了就不用 水体：色 = 散射色（线性 RGB，不给 Ultra-Water 的清水 [0, 0.05, 0.08]），透光 = 浪尖透光倍数（不给 1） */
  waterScatter?: { 色?: readonly [number, number, number]; transmission?: number };
  /** 透水（要和 水散射 一起开）：看得到水下的东西，视线在水里每米按 衰减（线性 RGB，不给 = 清澈大洋 Jerlov I 在 680/550/440 nm 的吸收 + 散射）变暗 */
  seeThrough?: { attenuation?: readonly [number, number, number] };
  /** 远处的海（Photon 式、FFT）：远 = 画到多远（格，不给 = 场景视距；不能超过相机远裁剪面），雾 = 大气透视每多少格淡掉 63%，边平 = 画的边上浪压平 */
  waterFar?: { farDist?: number; fog?: number; edgeFlat?: boolean };
  /** Photon 式、FFT 的水面反射里带上云（开了 云 才有）：朝天另画一张云，水面按反射方向取 */
  waterReflectCloud?: boolean;
  /** 反射和水体按线性光强混（原来混 sRGB 数值，偏暗） */
  waterLinearMix?: boolean;
  /** 盖掉这一时段的水体色（sRGB，不反光那部分的颜色） */
  waterBodyColor?: string;
  /** 盖掉这一时段的水面天顶色（场景自己的天色） */
  waterZenith?: string;
  /** 天的样式：现有分档 = 场景自己的天不动（不给也是）；Photon平滑 = 画布透明的地方（后面原本透出场景的 2D 天）整片画成 Photon 大气的平滑天色，
   *  再按 2D 天那样叠原版方形太阳（用户 11-02：太阳先留方形的），画布变成不透明。要透视镜头、要给 太阳 */
  天?: '现有分档' | 'Photon平滑';
  /** 天 是 Photon平滑 时，天顶往 色（场景色板的天顶，sRGB）拉：仰角 高（度，不给 38，同 2D 天的渐变高）以上拉 拉（0～1）这么多，往下渐少、地平线不拉；水面反射的天跟着拉 */
  zenith?: { 色: string; stretch: number; 高?: number };
  /** 泛光的光晕：平滑（不给也是）；像素格 = 光晕按贴图像素（正交镜头里 1/16 格在屏幕上的大小，透视镜头按 6 个成片像素）一格取一个值 */
  glowMode?: '平滑' | '像素格';
  /** 粒子（烟花火花这类）当点光源照亮周围（时段光 的 粒子照）；不给 = 不照 */
  particleLit?: boolean;
  /** 太阳照进来几成（一般不写，场景经 光影场 给，见 光影场参数.光强） */
  lightIntensity?: number;
  /** 整体提亮（用户 11-02「开了要么发暗发灰 可以调高基准亮度 就像夜视一样」）：受光面、影子里、灯和粒子照的光都乘这么多，影子照样在，发光区不乘；不给 = 1 */
  baseBrightness?: number;
  /** 补光（用户 11-03「光影应该都开 只不过画面不理想的话 你再补个光源就好了」）：最多 4 盏，不打影子；不给 = 不补 */
  fillLights?: readonly FillLight[];
  /** 镜头剖掉的（剖面镜头近裁剪面前面那半边屋子）不挡光：从镜头这边打光时不被剖掉的墙、屋顶挡住（作品/把回忆拼好给你 2-合照 的正面光）；不给 = 照挡 */
  clipNoBlockLight?: boolean;
  /** 粒子挤成一大团的地方把光晕压下来（不给或 0 = 不压）：泛光各层糊过的粒子覆盖率超过 1 / 这个数的地方按覆盖率除，零散的火花不动。
   *  为的是最大那发烟花整团糊成一片白（2-截图下线 的照片） */
  denseGlow?: number;
  /** 光照（受光、影子、灯、补光）：false = 关掉，网格照平涂原样（天、云照开）。不给 = 开（用户 11-04「默认是启用的」） */
  lighting?: false;
  /** 天 是 Photon平滑 时天色图怎么出：GPU（不给也是）= 片元着色器现算，精确 = 同 engine/light/大气.ts 在 CPU 上逐像素算（用户看过的旧画面逐字节一样） */
  skyAlgo?: SkyColorAlgorithm;
  /** 光影层的云（engine/light/云/配置.ts，用户 11-04 定成可单独配置的组件）：要透视镜头、要 天 是 Photon平滑；不给或 false = 不画（场景自己的云照常）。
   *  海平面、层一般不写（场景经 光影场 给），写了盖掉 */
  cloud?: CloudConfig | false;
  /** 云这一帧的事（一般不写，场景经 光影场.云 给） */
  cloudScene?: CloudScene;
};

/** 光影层画不画云（场景据此藏起自己的 2D 天、原版云） */
export const shadingDrawsCloud = (options: ShadingOptions | null | undefined): boolean => !!options && options.天 === 'Photon平滑' && !!options.cloud && options.cloud.开 !== false;

const dayBase: DaypartLight = {
  sunElevation: 48,
  sunAzimuth: 35,
  sunColor: '#fff2dc',
  sunIntensity: 1.08,
  shadowColor: '#a9b6b8',
  shadowStrength: 0.72,
  facing: 0.15,
  faceShadeK: 0.6,
  glowStrength: 1.15,
  lampLight: { radius: 10, 色: '#ffb35c', 强: 0 },
  bloom: { threshold: 1.5, softKnee: 0.5, 强: 0.12 },
  particleGlow: 0,
  particleLight: { radius: 16, 强: 0 },
  水: { zenithColor: '#6f9ae0', reflectivity: 0.8, glintColor: '#fff4dc', glintStrength: 1.6, waterBodyColor: '#2d5a8c', nearReflect: 0.35 },
};

const duskBase: DaypartLight = {
  sunElevation: 10,
  sunAzimuth: -25,
  sunColor: '#ffd2a0',
  sunIntensity: 1.12,
  shadowColor: '#aaa2c2',
  shadowStrength: 0.8,
  facing: 0.25,
  faceShadeK: 0.55,
  glowStrength: 1.3,
  lampLight: { radius: 10, 色: '#ffad55', 强: 0.25 },
  bloom: { threshold: 1.6, softKnee: 0.6, 强: 0.35 },
  particleGlow: 0,
  particleLight: { radius: 16, 强: 0 },
  水: { zenithColor: '#8a7fa8', reflectivity: 0.9, glintColor: '#ffcf8a', glintStrength: 2.2, waterBodyColor: '#5a5a86', nearReflect: 0.45 },
};

const nightBase: DaypartLight = {
  sunElevation: 50,
  sunAzimuth: -40,
  sunColor: '#dfe8ff',
  sunIntensity: 1.05,
  shadowColor: '#b4bcd8',
  shadowStrength: 0.8,
  facing: 0.1,
  faceShadeK: 0.7,
  glowStrength: 1.6,
  lampLight: { radius: 11, 色: '#ffa850', 强: 0.9 },
  bloom: { threshold: 1.15, softKnee: 0.4, 强: 0.7, 宽: 0.7 },
  particleGlow: 1.2,
  particleLight: { radius: 14, 强: 0.7 },
  水: { zenithColor: '#1c2448', reflectivity: 0.7, glintColor: '#cfd8ff', glintStrength: 0.8, waterBodyColor: '#141c38', nearReflect: 0.3 },
};

/** 仿 Complementary Reimagined：暖阳、偏灰绿的软影子（不发蓝）、泛光弱，像胶片。实机 A-01 背光的树干压得很黑，这里收着（用户不要描边，黑边会读成描边） */
const warmSoft: ShadingParams = {
  名: '暖柔',
  shaderPack: 'Complementary Reimagined',
  白天: { ...dayBase },
  日落: { ...duskBase },
  夜: { ...nightBase },
  grade: { saturation: 1.04, 对比: 1.03, darkColor: '#2e3a3c', brightColor: '#fff1dc', colorSplit: 0.12 },
  pixelShadow: true,
};

/** 仿 BSL、Sildur's Vibrant：亮白的太阳、深而冷的蓝灰影子、饱和高、对比强，像游戏宣传图 */
const vivid: ShadingParams = {
  名: '鲜艳',
  shaderPack: "BSL / Sildur's Vibrant",
  白天: { ...dayBase, sunColor: '#fff8ec', sunIntensity: 1.16, shadowColor: '#8c9cc4', shadowStrength: 0.62, facing: 0.2, faceShadeK: 0.55, bloom: { threshold: 1.6, softKnee: 0.5, 强: 0.1 } },
  日落: { ...duskBase, sunColor: '#ffc488', sunIntensity: 1.2, shadowColor: '#9a96c4', shadowStrength: 0.72, bloom: { threshold: 1.7, softKnee: 0.6, 强: 0.45 } },
  夜: { ...nightBase, sunColor: '#cfe0ff', shadowColor: '#9fb0dc', shadowStrength: 0.78, lampLight: { radius: 9, 色: '#ffb048', 强: 1.1 }, bloom: { threshold: 1.15, softKnee: 0.35, 强: 0.55, 宽: 0.15 }, particleGlow: 0.7 },
  grade: { saturation: 1.2, 对比: 1.1, darkColor: '#1c2a44', brightColor: '#fff6e6', colorSplit: 0.1 },
  pixelShadow: true,
};

/** 仿 Super Duper Vanilla：粉彩、受光偏金、影子明显偏蓝紫、泛光强、对比低 */
const pastel: ShadingParams = {
  名: '粉彩',
  shaderPack: 'Super Duper Vanilla',
  白天: { ...dayBase, sunColor: '#ffe6c8', sunIntensity: 1.1, shadowColor: '#a99ad0', shadowStrength: 0.72, facing: 0.1, faceShadeK: 0.6, bloom: { threshold: 1.5, softKnee: 0.6, 强: 0.3 } },
  日落: { ...duskBase, sunColor: '#ffc8a8', sunIntensity: 1.14, shadowColor: '#ae9cd2', shadowStrength: 0.8, bloom: { threshold: 1.6, softKnee: 0.7, 强: 0.6 } },
  夜: { ...nightBase, sunColor: '#c8d4ff', shadowColor: '#a8b0ec', shadowStrength: 0.85, lampLight: { radius: 9, 色: '#ffb070', 强: 0.6 }, bloom: { threshold: 1.1, softKnee: 0.45, 强: 1.0, 宽: 0.85 }, particleGlow: 1.4 },
  grade: { saturation: 0.96, 对比: 0.93, darkColor: '#3a2c50', brightColor: '#ffe8f0', colorSplit: 0.16 },
  pixelShadow: true,
};

/** 样式加上场景给的事实：样式里写了的照样式（试看时盖场景用） */
export const mergeShading = (options: ShadingOptions, shadingScene: ShadingSceneParams = {}): ShadingOptions => {
  const timeOfDay = options.timeOfDay ?? shadingScene.timeOfDay;
  const sun = options.sun ?? shadingScene.sun;
  return {
    ...options,
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(sun ? { sun } : {}),
    ...(shadingScene.sunRefDir ? { sunRefDir: shadingScene.sunRefDir } : {}),
    ...(options.lightIntensity === undefined && shadingScene.lightIntensity !== undefined ? { lightIntensity: shadingScene.lightIntensity } : {}),
    ...(options.cloud
      ? {
          cloud: { ...options.cloud, 海平面: options.cloud.海平面 ?? shadingScene.海平面 ?? 0, ...(options.cloud.层 ?? shadingScene.cloudLayers ? { 层: options.cloud.层 ?? shadingScene.cloudLayers! } : {}) },
          cloudScene: { ...shadingScene.cloud, ...options.cloudScene },
        }
      : {}),
  };
};

export const shadingPresets = { 暖柔: warmSoft, 鲜艳: vivid, 粉彩: pastel } as const;
export type ShadingPresetName = keyof typeof shadingPresets;

export const getShadingParams = (p: ShadingOptions['preset']): ShadingParams => {
  if (typeof p !== 'string') return p;
  const r = shadingPresets[p];
  if (!r) throw new Error(`没有光影预设「${p}」，有：${Object.keys(shadingPresets).join('、')}`);
  return r;
};
