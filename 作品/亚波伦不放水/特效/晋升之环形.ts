// 晋升之环的形（纯数据，不引资产、不引 three）：原版贴片的摆法和转速，本片自制的三个候选（甲、乙、丙）的名字、大小、各层转速，戴在头后的摆法。
// 候选的几何在 晋升之环几何.ts，材质在 精工材质.ts，画在 晋升之环.tsx。
// 用户 11-10：「晋升之环是不是没有建模，给他做一个；另外亚波伦头上原来做的那个感觉不是很好看，还是换成晋升之环吧」。候选等用户挑，没挑定。
// 风格照 rules/通用.toml「自制模型贴图风格」（用户 11-10：往真实、细腻做，不做像素方盒，照拔刀剑的路子）。
// 游戏里的画法 11-10 接手时对着 jar 重核过一遍（PlayerHaloModel 的常数、PlayerHaloLayer 的调用顺序和三张贴图名）。
//
// 游戏里的画法（启示录 2.3.6，GoetyRevelation-2.3.6.jar 和里层 META-INF/jarjar/[Forge]RevelationFix-1.20.1-4.9.jar，javap 反汇编；
// 方法名对照 1.20.1 SRG 客户端 jar）：
// - 物品 goety_revelation:ascension_halo（zh_cn「晋升之环」），物品模型 item/generated + textures/item/curio/halo.png。没有穿戴用的立体模型。
// - z1gned.goetyrevelation.client.model.PlayerHaloModel.createBodyLayer：head 下挂部件 halo，PartPose (0, −12, 5)、xRot 0.7854（45 度）；
//   halo 下挂 halo1，一个方盒 addBox(−8, −8, 0, 16, 16, 0)、texOffs(0, 0)，贴图 16×16。就是一张 16×16 像素的零厚度片：
//   中心在头顶上方 4 像素、往后 5 像素，上沿朝前倾 45 度。
// - z1gned.goetyrevelation.client.layer.PlayerHaloLayer.render：戴着晋升之环（ATAHelper.hasHalo）时 halo.translateAndRotate →
//   绕 Z 转 90 × getSpin() 度 → 画 halo1，RenderType.energySwirl(贴图, 1, 1)。贴图平时是 textures/entity/player/halo.png，
//   getMeteoring() > 0 时换 halo_second.png；戴的是破碎之环（hasBrokenHalo）画 broken_halo.png，不转。halo3.png 两个 jar 里都没有类引用。
// - energySwirl（RenderType.m_110436_）：着色器 rendertype_energy_swirl（不采样光照图，等于全亮；透明度 < 0.1 的像素丢掉）、
//   加色混合（additive_transparency）、不剔背面；贴图偏移 (1, 1) 是整张贴图的整数倍，画面上没有变化。
// - getSpin（z1gned.goetyrevelation.mixin.PlayerMixin.spinTick）：客户端每刻 +0.01，到 3.14 跳回 −3.14；90 × 0.01 × 20 = 每秒 18 度。
// - RevelationFix 的 com.mega.revelationfix.mixin.gr.HaloRendererMixin 改了两处：两次 translateAndRotate 之前先套玩家模型 head 的
//   translateAndRotate（原来不跟头转，改后跟着头转、低头抬头）；转角换成 Blaze3D.getTime() × 18（按真实秒算，每秒 18 度，不再一刻一跳）。
//   AscensionHaloMixin 只改物品属性（防火）和提示文字的键，不碰画面。
// - 转向：模型空间里绕 +Z（朝后）转正角，从正面看是顺时针。
// - 没查实：PlayerHaloModel.setupAnim 里还把 halo1.zRot 设成 getSpin()，但 PlayerHaloLayer.render 没调 setupAnim，别处有没有调没查，这里按没调算。
//
// 环坐标（本文件和 晋升之环.tsx、晋升之环几何.ts 通用）：环面在 XY 平面，+Z 朝正面的观众，+Y 朝上，+X 是观众的右手边；单位是戴的人的模型像素。
// 颜色母题取自原贴图 halo.png（红 e94d4d、橙 e9914d、品红 d53862、深品红 bb2688、黄 f6cc69、黄绿 ddf987）和物品图标（米白 f9ffda、金、暗红）：
// 候选里提炼成金的器物加这几色的宝石和光，数值在 晋升之环几何.ts。

/** 原版：每秒转几度（从正面看顺时针）、相对头的位置（头部件坐标换成环坐标：原点 = 头的转轴，脖子根）、上沿朝前倾几度、片的边长 */
export const 原版环 = { 每秒度: 18, 位: [0, 12, -5] as const, 前倾度: 45, 边长: 16 } as const;
/** 原版贴片这一刻绕环坐标 Z 轴的转角（度，正 = 从正面看逆时针，所以是负的） */
export const 原版转角 = (秒: number): number => -原版环.每秒度 * 秒;

/**
 * 候选：外径 = 最外沿离环心多远（像素，摆大小用，含转动；不含后面垫的光晕）；层速 = 各层绕环心每秒转几度（正 = 从正面看逆时针）。
 * 外层都照原版的每秒 18 度顺时针，里层反着慢转。
 */
export const 候选们 = {
  甲: {
    名: '甲 金属圣环',
    说明: '精工金环：带槽的棱环，槽里一道波纹金丝加珠粒，外沿一圈绞丝；四个对角镶回字方座和阶梯切方宝石（原贴图四角的方块），正上下左右镶黄绿圆宝石；里面一圈联珠双丝环反着转，中心是镂空的十字加圆（原贴图中心）',
    外径: 10.4,
    层速: { 外环: -18, 内环: 12, 十字: -6 },
  },
  乙: {
    名: '乙 光之环',
    说明: '以光为主：三道细亮的光环，外放 32 道长短相间的细针光芒（白金到橙、红、品红收尖），环上四个对角各一个菱形小光框；环里贯通的十字细光加中心小圆，像圣像的头光',
    外径: 14.5,
    层速: { 光环: -12, 十字: 6 },
  },
  丙: {
    名: '丙 星环',
    说明: '一道细光丝串起 16 件小件绕头慢转：正上下左右四颗双尖切面晶体（红、橙、品红、黄绿，腰上箍金丝），四个对角四块回字金牌（中心嵌宝石），其间八个包镶小圆宝石的金链节',
    外径: 10.8,
    层速: { 整圈: -18, 晶体自转: 40, 金牌摆: 1.6, 链节摆: 2.3 },
  },
} as const;
export type 候选名 = keyof typeof 候选们;
export type 环款 = '原版' | 候选名;

/**
 * 戴在头后怎么摆（头坐标：原点 = 头的转轴，+Y 朝上，+Z 朝脸的前方，单位是那个人的模型像素）：环心的位置、上沿朝前倾几度、放大几倍。
 * 史蒂夫的头是 8 像素的方块（转轴在脖子根，头顶在 +8），环跟着头转（照游戏）。
 * 娘化亚波伦的头 7 像素（Head 转轴上方 0.1～7.1，宽檐帽檐在 7.4～11.4、半径约 8）；她的环不跟头转，挂在 aaabody 上（包里的眼形大光环也挂在这）：
 * fly 里头和上身往一边倒近 90 度，跟头的话环躺到身子后面、被身后的缺口环挡住（核对段第一轮试过）。位置按站姿时 Head 的转轴写，画的时候换算到 aaabody。
 * 原版照游戏的数；亚波伦戴原版贴片按头的大小比（7/8）缩，只当对照。候选的数是对着核对段的静帧取的，没经用户看过。
 */
export const 戴法: Record<'史蒂夫' | '亚波伦', Record<环款, { 位: readonly [number, number, number]; 前倾度: number; 倍: number }>> = {
  史蒂夫: {
    原版: { 位: 原版环.位, 前倾度: 原版环.前倾度, 倍: 1 },
    甲: { 位: [0, 6.5, -5.2], 前倾度: 10, 倍: 0.85 },
    乙: { 位: [0, 6.5, -5.2], 前倾度: 10, 倍: 0.8 },
    丙: { 位: [0, 6.5, -5.2], 前倾度: 10, 倍: 0.95 },
  },
  亚波伦: {
    原版: { 位: [0, 10.6, -4.9], 前倾度: 原版环.前倾度, 倍: 7 / 8 },
    甲: { 位: [0, 12, -10], 前倾度: 8, 倍: 1.3 },
    乙: { 位: [0, 12, -10], 前倾度: 8, 倍: 1.2 },
    丙: { 位: [0, 12, -10], 前倾度: 8, 倍: 1.4 },
  },
};
/** 娘化亚波伦模型里 Head 转轴相对 aaabody 转轴的位置（模型像素，models/main.json：Head pivot y 33.05，aaabody pivot y 49.65） */
export const 亚波伦头轴 = [0, 33.05 - 49.65, 0] as const;
