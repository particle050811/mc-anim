// 第 3 句「直到遇见你我以为就光明起来」：樱花林边的车万女仆祭坛。接第 2 句最后「头顶挖开、阳光照进洞里」切过来：镜头贴着地面看着祭坛，
// 慢慢升高、往下俯（远景）；你拿御币点祭坛，柱顶材料化成光汇到圈心，一道光柱罩下来，她站在光里出现。「光」那一拍切进柱子圈里（近景）：
// 她看着你，你递蛋糕驯服她，她转过来看着镜头，镜头推进她的右眼，接第 4 句。纯数据。
// 时刻都从 分镜 的正片事件来，这里只写相对的秒和空间分寸；没注出处的都是 Agent 暂定（用户 10-24 把制作交给主会话），理由写在各条上。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。祭坛中心（六根柱子围成的圈的中心）在原点，鸟居在北（+y），入口朝南，你从南边进来。
// 祭坛几何照 TLM 1.5.3 models/bedrock/block/altar.json（作品资产 模型/场景/女仆祭坛）：柱子 3 格高、截面 17 像素，前两根在 (±1.5, −3.5)，两侧四根在 (±3.5, ±1.5)，鸟居在 y 3.5、顶高 5.9 格。
import { legacyFrameSec } from '../../分镜/时间.ts';

type Vec3 = [number, number, number];

/** 柱顶的六样材料：原版 TLM 召唤女仆的祭坛配方（altar/spawn_box）钻石、金锭、红石、铁锭、青金石、煤炭各一。
 *  谁放哪根柱子是玩家自己摆的，这里按颜色排开：近处两根放最认得出的钻石、金锭，红的蓝的分两边 */
export const pillarTopMaterials: readonly { name: string; pillarPos: readonly [number, number]; phaseFrac: number }[] = [
  { name: '钻石', pillarPos: [1.5, -3.5], phaseFrac: 0.13 },
  { name: '金锭', pillarPos: [-1.5, -3.5], phaseFrac: 0.71 },
  { name: '红石', pillarPos: [3.5, -1.5], phaseFrac: 0.42 },
  { name: '青金石', pillarPos: [-3.5, -1.5], phaseFrac: 0.95 },
  { name: '铁锭', pillarPos: [3.5, 1.5], phaseFrac: 0.27 },
  { name: '煤炭', pillarPos: [-3.5, 1.5], phaseFrac: 0.58 },
];
/** 柱顶那格方块的底面高（格）：柱子 3 格高，放东西的是第三格 */
export const pillarTopHeight = 2;
/** TileEntityAltarRenderer：物品在柱顶格上方 1.25 格、上下浮 0.1 格（3.6 秒一个来回）、绕竖轴每 3.6 秒转一圈，再按物品的 GROUND 显示变换画。
 *  原版的钟是 System.currentTimeMillis() + 方块坐标，各柱各一个相位（上面的 相位，0～1 一圈） */
export const floatItem = { height: 1.25, floatAmp: 0.1, periodSec: 3.6 } as const;

/** 点祭坛以后材料先整个变白 亮秒（24 fps 时 2 帧），再化成光点往圈心上方的 汇点 飞，正好在「她现身」那一帧汇齐（飞多久按两个事件现算）。
 *  演绎（三稿「材料化成光」）：原版合成时材料当刻没了，每根柱子和圈心各冒 5 个 CLOUD、5 个 SMOKE（BlockAltar.spawnParticleInCentre），没有光。
 *  原来飞 1/6 秒，光点在画面上一闪就过（用户 10-24「画面转太快就删」），现在飞满一拍（0.4 秒上下），汇点就是她出现的那道光里、她头顶的高度 */
export const lightMelt = { brightSec: legacyFrameSec(2), convergePoint: [0, 0, 1.6] as Vec3 } as const;

/** 她：站在圈心，身子朝南对着你。「现身」那一帧在光柱最亮时一下出现（原版实体生成就是一刻里出来，不淡入），一出来就抬着头看你（远景里看不出低头抬头，
 *  近景一开头再单独抬一次头，现身、抬头、换蛋糕、递蛋糕一拍一件，核查 10-24 说跟不上，删了）。
 *  原版是祭坛合成出蛋糕盒、你右键拆三下她才下来；用户 10-24 说「这里拆盒过程就多余了」，盒子整段删掉，祭坛一亮她直接站在光里 */
export const liYing = { feet: [0, 0, 0] as Vec3, facing: 180 } as const;
/** 递蛋糕以后几秒她从平脸换成笑（驯服的爱心冒出来那一下；24 fps 时 2 帧） */
export const smileStartSec = legacyFrameSec(2);
/** 推眼睛那一拍以后再等 转头迟秒，她的头从看着你转到正对镜头（看 [0, 0]，第 4 句眼睛特写就是这个姿势），转 转头秒（24 fps 时等 3 帧、转 9 帧）：
 *  递蛋糕、爱心冒出来这一下留够半秒多不被打断（核查 10-24），转完还剩 0.1 秒上下停稳接第 4 句 */
export const turnHeadDelaySec = legacyFrameSec(3);
export const turnHeadSec = legacyFrameSec(9);

/** 你（史蒂夫）：站在她右前方（从镜头看在左边），朝着她。离她 1.6 格，原版生存模式够得着（实体交互 3 格）。
 *  不站在她和镜头之间：原来站在两根前柱子中间，镜头推她的脸要从你背后擦过去，你的后脑勺糊满半个画面（Agent 暂定） */
export const you = { feet: [-1.15, -1.1, 0] as Vec3 } as const;
/** 递蛋糕那一下，右键驯服当刻就扣掉蛋糕；第三人称手里还留 留蛋糕秒（演绎：蛋糕、爱心、她笑同框停半秒多，核查 10-24 说原来 3 刻一闪就没）。
 *  原来写 11 刻、按 24 fps 往上取整成 14 帧，这里照看过的 14 帧写死 */
export const holdCakeSec = legacyFrameSec(14);
/** 原版挥手（swingTime 6 刻），点祭坛、递蛋糕都挥一次 */
export const waveTicks = 6;

/** 驯服爱心：她的碰撞箱 0.6 × 1.5（EntityMaid）。7 颗的位置全看种子（原版每次随机），爱心活 0.85 秒：
 *  种子按投影在 1～20000 里筛（祭坛召唤.test.ts 核这几条）：照片那一帧 7 颗都在画里，递蛋糕到照片后两帧都在歌词（顶上 14%）下面，
 *  不从她眼睛那一条前面压过去，至少 4 颗在肩膀以上（出生高 ≥ 1.2 格）；满足的里头挑推眼睛时画里最大的那颗最小的（390 宽的手机上半边 37 像素）。
 *  镜头改了路线就要重筛 */
export const hearts = { width: 0.6, height: 1.5, seed: 3044 } as const;

/** 远景的一条关键帧轨：[离段首几秒（'切' = 切近景前 1/24 秒，24 fps 时就是切前一帧）, 值] */
export type FarTrack = readonly (readonly [number | '切', number])[];

/** 镜头：两个透视镜头，「光」那一拍顺着同一个方向硬切（往前跳进柱子圈里），光柱跨过这一刀接着亮。
 *  远景：每个量一条关键帧轨（时刻 = 离段首几秒；值），各自保单调三次插值，段首速度 0（第 2 句最后一帧是不动的），切走时还在慢慢往前飘。
 *    段首贴着地面（比人眼略高）平看着祭坛 → 慢慢升到比人眼高一倍、往下俯 10° 上下看着圈里（祭坛南边 11 格）：
 *    圈心、你、光柱都在两根前柱子中间露出来，背后的鸟居、右边山坡上的樱花林、左边起伏到雾里的平原，柱顶的材料、往圈心飞的光都在歌词下面。
 *    眼 x 不动，比圈心偏东 1.5 格：你站在圈心西南，从正南看你在左前柱后面，偏过来才从两根前柱中间露出来（核查 10-24）；
 *    仰：度，正 = 往上看；偏：度，0 朝北、正 = 往东。时刻：离段首几秒（24 fps 时第 21、22 帧），'切' = 切近景前 1/24 秒。
 *    不从洞底仰看洞口：要在点祭坛前升出洞口、摇到祭坛，仰看只来得及 1/8 秒，一闪看不清（核查 10-24）；第 2 句末已经在剖面里看过阳光照进洞里，
 *    所以切过来第一帧就是祭坛，整段远景都在立地方（Agent 暂定）。
 *  近景：关键机位（编排.ts 的 关键机位），中间按离她右眼的距离取对数、方向、看点、视角各自插（距离、视角用保单调的三次插值），速度处处连续，末帧落在 末态.ts 的 末机、末速 也接上。
 *    镜头在两根前柱子北边（柱子北面 y −2.97），比她的眼睛高一点；两根前柱子在镜头后面，两侧的柱子 (±3.5, −1.5) 开头在画面左右两边框着，推着推着滑出画。
 *    光：她站在光里、在画面正中偏右，你在左边；递蛋糕（照片就在这附近）：你伸手递，爱心在她头边、都在歌词下面；递到推眼睛镜头只往前挪一点，蛋糕、爱心一直在画里；
 *    推眼睛：镜头推得快起来，推到末帧。
 *  用户 10-24「画面转太快就删」：原来整句一镜，段首一下冲出去四格、再从两根前柱子中间穿过去，柱子从画面两边扫过去；
 *  从柱子圈外推到她脸上，柱子总要从画边出去（试过一直停在圈外、视角收到 6°，递蛋糕时左前那根柱子和你的后背占掉半个画面），所以拆成两镜（Agent 暂定） */
export const shot = {
  far: {
    x: 1.5,
    y: [[0, -11.5], [legacyFrameSec(21), -11.0], ['切', -10.2]],
    z: [[0, 2.1], [legacyFrameSec(21), 3.25], ['切', 3.45]],
    pitch: [[0, 0], [legacyFrameSec(22), -9], ['切', -11]],
    yawOffsetTrack: [[0, -2], [legacyFrameSec(22), -4], ['切', -5]],
    fov: [[0, 48], [legacyFrameSec(22), 46], ['切', 40]],
  },
  near: {
    光: { 眼: [-0.02, -2.85, 1.5] as Vec3, 看: [-0.33, -0.05, 1.2] as Vec3, fov: 53 },
    handOff: { 眼: [-0.04, -2.7, 1.45] as Vec3, 看: [-0.3, -0.1, 1.45] as Vec3, fov: 49 },
    pushIn: { 眼: [-0.05, -2.45, 1.38] as Vec3, 看: [-0.18, -0.05, 1.36] as Vec3, fov: 45 },
  },
} as const;

/** 光（演绎，三稿「祭坛亮起」「她站在光里」）：照原版信标光柱那样硬边、半透明、不渐变，两三档叠起来。
 *  祭坛亮：点祭坛那一刻起圈里的地面亮起来，亮着等她现身，再分 三档 往下退；
 *  光柱：她现身前 起前秒 从她头顶往下罩一道光，宽 三档（格），留 留秒，退秒 里一档一档淡掉（24 fps 时起前 3 帧、留 12 帧、退 10 帧，祭坛亮退 9 帧）；颜色是暖白。
 *  强 = 每一层的不透明度，普通半透明叠（光.tsx：加法叠在草地上会发黄绿） */
export const lightParams = {
  色: '#fff2c4',
  altarLight: { radiusList: [3.2, 2.4, 1.6] as const, strength: [0.18, 0.18, 0.22] as const, fadeSec: legacyFrameSec(9) },
  lightPillar: { width: [0.9, 1.3, 1.8] as const, height: 7, strength: [0.34, 0.2, 0.12] as const, startBeforeSec: legacyFrameSec(3), holdSec: 0.5, fadeSec: legacyFrameSec(10) },
  /** 光柱里往上飘的光点（原版末地烛粒子的 glitter 贴图）：个数、半边长（格）、种子 */
  lightDot: { 数: 18, halfSize: 0.07, seed: 17 },
} as const;

/** 原声在母版里的固定增益（同 场/1-隐世之境一楼/参数.ts、场/2-门口/第8句参数.ts 的 原声增益，−6 dB 留余量）；段在一串歌里中间，不淡入 */
export const originalGain = 0.5;
/** 音效（同第 8 句纸声的做法：峰值都配到 峰值 dBFS，压在歌底下，只听得到一下）。峰值是实测（按 48 kHz 每 2000 个样本（1/24 秒）一格量峰值，格从文件头数起）。
 *  祭坛合成（touhou_little_maid block.altar_craft 第 2 个文件，1.72 秒）：一开头就响（第 0 格 −5.5），第 8 格最响 −1.5 dBFS，文件头对着点祭坛那一帧 */
export const soundFx = {
  祭坛: { asset: '音效/把回忆拼好给你/touhou_little_maid.block.altar_craft.2', peakDb: -1.5, sec: 1.719 },
  peakDb: -20,
} as const;

// ---------- 地：和第 1 句同一片地（用户 10-24「而且怎么超平坦背景 合理吗？」） ----------

/** 祭坛摆在哪（Agent 暂定）：樱花林那座山的西南坡脚下（第 1 句世界格 (18, 128)，出生点往北 128 格），鸟居朝北。
 *  往北看：右边（东北）是山坡上的樱花林，正前方、左边是平原一路起伏到雾里，鸟居衬在天上；林子最近的树在祭坛北边 15 格上下，看得出是林子边上。
 *  地面 = 祭坛脚下那格地面顶在世界里的高（原来的地在这里是 2）。
 *  平台：脚下压平的一块（局部格，祭坛、你站的地方、镜头底下那一条都在里面），往外 缓 格里接回原来的起伏；
 *  让树：树干离平台不到这么多格的不种（樱花树枝伸出去 4 格，会伸进祭坛、挡镜头）；
 *  圈让、镜头道：平台上不长花草的地方（祭坛圈里；镜头前面几格的草会大得糊住画面下沿）。
 *  范围：只铺镜头前方一扇（同第 1 句的做法），半径 200 > 雾止 192，地平线上是雾里的地，不露地形的边；植物半径以外的平原不长草（再远一株草不到几个像素） */
export const altarPos = {
  world: [18, 128] as const,
  ground: 2,
  platform: { west: -7, east: 7, south: -17, north: 6, fadeDist: 7 },
  treeClearance: 3,
  ringClear: 4.6,
  shotBounds: { west: -2.5, east: 3.5, south: -18, north: -3.6 },
  bounds: { south: -22, north: 230, west: -220, east: 220, fanCenter: [0.5, -22] as const, fanWidth: 16, fanSpread: 1.05, rangeCenter: [0.5, -8] as const, radius: 200, plantRadius: 70 },
} as const;

// ---------- 天色、雾：同第 1 句（原版 1.20.1 平原白天、渲染距离 12 区块），照抄 场/2-新世界/参数.ts ----------

/** 原版平原的天色（sky_color 7907327）、雾色（fog_color 12638463） */
export const skyColor = '#78a7ff';
const baseFogColor = [0xc0, 0xd8, 0xff];
const skyRgb = [0x78, 0xa7, 0xff];
/** 渲染距离 12 区块 = 192 格（原版默认） */
export const renderDistance = 192;
/** 原版 FogRenderer.setupColor：雾色往天色拉 1 − (0.25 + 0.75 × 区块数 / 32)^0.25 */
const skyPull = 1 - (0.25 + (0.75 * renderDistance) / 16 / 32) ** 0.25;
export const fogColor = '#' + baseFogColor.map((c, i) => Math.round(c + (skyRgb[i]! - c) * skyPull).toString(16).padStart(2, '0')).join('');
/** 地形的雾（FOG_TERRAIN，柱形）：起 = 距离 − clamp(距离 / 10, 4, 64)，止 = 距离 */
export const terrainFog = { start: renderDistance - Math.min(64, Math.max(4, renderDistance / 10)), end: renderDistance };
/** 天的雾（FOG_SKY，球形，起 0、止 = 渲染距离）：天幕在眼睛上方 16 格 */
export const skyDomeHeight = 16;
