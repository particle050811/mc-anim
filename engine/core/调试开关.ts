// 调试、试看开关的登记表：试看参数的每个名字、「关」能关的每一项、页面认的每个调试环境变量各登记一行，`anim trial list` 打印这张表。
// 代码里 trialParams、trialOff、trialKey 只认这里登记过的名字（类型和运行时都拦）；anim check 的 debug 规则查两头：用到的都登记了、登记了的有人用、落点文件在。
// 都不进指纹：试看只走页面环境变量，正式出片（切片、段签）的路不转它们（pipeline/渲/地形注入.ts 的 trialEnv）。
// 占位行（pending 写着分支或标签）是还没合进 main 的：合并后代码用到它就把 pending 删掉，check 会提醒。
// 纯模块：pipeline 直接 import（不引别的文件）。

/** trial：REMOTION_ANIM_TRIAL 这张 JSON 表里的一个键；off：试看「关」里能写的一项；channel：页面读的一个调试环境变量 */
export type SwitchKind = 'trial' | 'off' | 'channel';
/** 谁会把它转给页面：still、film 的试看模式、bench */
export type SwitchReader = 'still' | 'film' | 'bench';

export type DebugSwitch = {
  readonly name: string;
  readonly kind: SwitchKind;
  /** 管什么 */
  readonly purpose: string;
  readonly changesPicture: boolean;
  /** 会挑到正式画面不用的区段（更细的级、更远、别的视点）：开了它的页面读完整地形包，不读裁过的（pipeline/渲/地形注入.ts，docs/世界.md「裁级」） */
  readonly fullTerrain?: true;
  /** 试看、调试通道一律不进指纹，留这一列是让表上看得见 */
  readonly inFingerprint: false;
  readonly readers: readonly SwitchReader[];
  /** 值的格式（给人看的） */
  readonly format: string;
  /** 值是对象时认的子键：写了别的键报错（照着旧注释写错键，参数悄悄不生效，见 暮色远景） */
  readonly keys?: readonly string[];
  /** 落点：读它、实现它的文件 */
  readonly files: readonly string[];
  /** 还没合进 main：在哪条分支或标签上；没人做过的写「还没做」 */
  readonly pending?: string;
  readonly note?: string;
};

const all: readonly SwitchReader[] = ['still', 'film', 'bench'];
type Named<K extends SwitchKind, N extends string> = Omit<DebugSwitch, 'name' | 'kind'> & { readonly name: N; readonly kind: K };
// 两个帮手都留住名字的字面量类型：TrialName、OffName 要从表里推出来
const off = <N extends string>(name: N, purpose: string, files: string[], extra: Pick<DebugSwitch, 'pending' | 'note' | 'fullTerrain'> = {}): Named<'off', N> => ({
  name,
  kind: 'off',
  purpose,
  changesPicture: true,
  inFingerprint: false,
  readers: all,
  format: `写进 {"关": [..., "${name}"]}`,
  files,
  ...extra,
});
const voxelPending = '还没做';
// 地形调试的几项（engine/voxel/调试.tsx）
const terrainDebug = <N extends string>(name: N, purpose: string, format: string, keys?: string[], fullTerrain?: true): Named<'trial', N> => ({
  name,
  kind: 'trial',
  purpose,
  changesPicture: true,
  inFingerprint: false,
  readers: all,
  format,
  ...(keys ? { keys } : {}),
  ...(fullTerrain ? { fullTerrain } : {}),
  files: ['engine/voxel/调试.tsx'],
  note: '地形调试，docs/地形调试.md',
});
// 开着远雾的镜头（公里级飞行，如 6-穿塔斩首领）远雾是替换不是叠加（高度雾.ts 的 fogPart），单关这几项画面逐字节不变
const replacedByFarFog = '开着远雾的镜头被远雾整个替换，单关它画面不变，要连 远雾 一起关';
const voxelNote = '等 航线定级、下界光体 合并后做：两条分支正在改 engine/voxel/，现在动会冲突。地形的阴影、AO、台阶并色现在用试看 分级色调 关';

export const debugSwitches = [
  // ---- 试看参数（REMOTION_ANIM_TRIAL 的键）----
  {
    name: '雾曲线',
    kind: 'trial',
    purpose: '远雾从 D 的几成开始升（全片 0.9）、换这个镜头的 D（地形最远距离跟着换）',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    fullTerrain: true,
    format: '{"起"?: 0～1, "远"?: 米}',
    keys: ['起', '远'],
    files: ['engine/light/高度雾.ts'],
    note: '「远」经 trialFarM 落到各镜头：作品/应力转动/地点/边城/6-2-5/飞越主世界.tsx、地点/基地小岛.tsx、地点/暮色新世界/超远景.ts、作品/亚波伦不放水/地点/真下界.tsx 等',
  },
  {
    name: '暮色模拟起级',
    kind: 'trial', purpose: '比较暮色存档内从哪一级改用模拟',
    changesPicture: true, inFingerprint: false, readers: all, fullTerrain: true,
    format: '2、3、4、5 或 "copy"（仅存档外照抄）', files: ['pipeline/渲/地形注入.ts'],
  },
  {
    name: '暮色远景',
    kind: 'trial',
    purpose: '暮色超远景：盖掉正式值，或给没开的暮色镜头打开（要多读的包写在「地形」）',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    fullTerrain: true,
    format: '{"雾远": 米, "高度雾": 倍数}（两项都要给）',
    keys: ['雾远', '高度雾'],
    files: ['作品/应力转动/地点/暮色新世界/超远景.ts'],
  },
  {
    name: '地形',
    kind: 'trial',
    purpose: '这一页多读的地形包：按 assets/地形版本.json 现登记的版本并进地形版本表',
    changesPicture: false,
    inFingerprint: false,
    readers: all,
    format: '["<包名>", …]',
    files: ['pipeline/渲/地形注入.ts'],
    note: '自己不改画面，配 暮色远景 这类要读更多包的试看用；键是中文「地形」，写成 terrain 直接报错',
  },
  {
    name: '关',
    kind: 'trial',
    purpose: '标准消融：关掉一项看画面里哪一块是它（能写的项见下面 kind=off 的行）',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: '["<项>", …]，如 ["高度雾", "云"]',
    // 地形注入.ts 看「关」里有没有标了 fullTerrain 的项，决定读完整地形包（docs/世界.md「裁级」）
    files: ['engine/core/试看.ts', 'pipeline/渲/地形注入.ts'],
  },
  {
    name: '细分门槛',
    kind: 'trial',
    purpose: '视频级的区段细分门槛（输出像素），盖掉 2.25',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    fullTerrain: true,
    format: '数，如 1.5',
    files: ['engine/core/渲染级别.ts'],
  },
  {
    name: '台阶并色',
    kind: 'trial',
    purpose: '台阶并色：只关贴图提前往 1×1 靠，或两样都关',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: '{"lodPush"?: false, "off"?: true}',
    keys: ['lodPush', 'off'],
    files: ['engine/voxel/材质.ts'],
    pending: '标签 实验/台阶并色分级',
  },
  {
    name: '分级色调',
    kind: 'trial',
    purpose: '查体素地形各级色调差：一小块地定成某一级（定级，只在定级框里）、真几何、关阴影、AO、台阶并色',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    fullTerrain: true,
    format: '{"定级"?: 级, "定级框"?: [[[x,z],[x,z]], …], "场景"?: true, "真几何"?: true, "阴影"?: false, "AO"?: "关"|"满", "并色"?: false}',
    keys: ['定级', '定级框', '场景', '真几何', '阴影', 'AO', '并色'],
    files: ['engine/voxel/分级色调.ts'],
    note: '地形调试，docs/地形调试.md。树叶按占比、树叶洞 两个键是修法，没进主线，在标签 实验/切级跳变 上',
  },
  {
    name: '航线定级',
    kind: 'trial',
    purpose: '体素地形按航线定级的参数：逐项盖掉飞行镜头登记的（往后看几秒、门槛、留细、下限、格点密度）；没登记航线的镜头只认门槛',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    fullTerrain: true,
    format: '{"秒"?: 往后看几秒 | "整段", "门槛"?: 输出像素（画质门槛 2.25）, "留细"?: true|false, "下限"?: 提前细分出来的一格至少几个输出像素, "格"?: 每秒几个格点（2 的幂，默认 16）}',
    keys: ['秒', '门槛', '留细', '下限', '格'],
    files: ['engine/voxel/选区段.ts'],
    note: '应力转动的飞行镜头默认：秒 5、留细、门槛 4.5、下限 1.125（作品/应力转动/默认.ts 的 FLIGHT_ROUTE_LOD）；整个关掉用 {"关": ["航线定级"]}。门槛比 6 再粗要把「格」加到 64。做法见 engine/voxel/航线定级.ts',
  },
  {
    name: '航线定级统计',
    kind: 'trial',
    purpose: '量切级跳变：每帧一行（区段数、面数、和上一帧比画面里换了级的区段）进浏览器日志，或只算不画往后扫 n 帧汇总成一行打到终端，或这一帧照别的时刻定的级画（给 anim diff 比）',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    fullTerrain: true,
    format: 'true 或 {"扫帧": n} 或 {"选级偏帧": ±n}',
    keys: ['扫帧', '选级偏帧'],
    files: ['engine/voxel/选区段.ts', 'engine/voxel/世界.tsx'],
    note: 'true 的那一行用 bench --verbose 的 .log 看；扫帧配 still 出一帧。选级偏帧：同一帧出偏 0 和偏 −30 两张，anim diff 的差就是半秒里切级改掉的像素（只有它改画面）。只有登记了航线的飞行镜头有',
  },
  {
    name: '下界底光',
    kind: 'trial',
    purpose: '亚波伦不放水 真下界的底光（方块光 0 级的亮度）整体乘一个倍数，看削弱底光后发光方块照亮周围显不显',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    fullTerrain: true,
    format: '{"倍": 数}：1 = 现状（正片 0.6，原版 0.393 约是 0.65 倍）',
    keys: ['倍'],
    files: ['作品/亚波伦不放水/地点/真下界.tsx'],
    note: '只乘底光，熔岩、火的自发光和光体不变',
  },
  {
    name: '光体',
    kind: 'trial',
    purpose: '给还没开光体的地点临时接上光体（发光方块照亮周围），或改已开地点的强、软封顶，出各档对比给用户定开不开、开多强',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    fullTerrain: true,
    format: '{"强"?: 数, "软封顶"?: 数（不封顶写 1e6）, "方案"?: "现状"|"原版"|"圆洪水"|"圆影", "曲线"?: "原版"|"BSL"|"Complementary"|"Photon", "米每级"?: 数, "p"?: 数}，没给的照地点自己那套；古城没有自己那套，照下界正片（强 1.5、软封顶 1.5）；换了方案时强默认 1、米每级 1、p 4',
    keys: ['强', '软封顶', '方案', '曲线', '米每级', 'p'],
    files: ['engine/light/光体试看.ts', '作品/应力转动/地点/古城4x/光体试看.tsx', '作品/亚波伦不放水/地点/真下界.tsx', '作品/把回忆拼好给你/地点/隐世之境一楼.tsx'],
    note: '接了三处：应力转动的古城4x（AncientCity4xCanvas 的各段，光源照包 古城放大幽匿-20260930 算，要同时写 "地形": ["古城放大幽匿-20260930"]）；亚波伦不放水的真下界（原版那套没开光体的也会开）；把回忆拼好给你的隐世之境一楼（按「叠」开，点光照旧）',
  },
  terrainDebug('标记','画面上按世界坐标标点、名字和距离', '[{"名", "位": [x,y,z]|[x,z], "色"?, "光柱"?, "场景"?}]'),
  terrainDebug('区域', '世界里的多边形：地形上描边、淡淡染色；分级色调 的 定级 没给 定级框 时拿它的外接框', '[{"名", "点": [[x,z], …], "色"?}]'),
  terrainDebug('区域遮罩', '出遮罩图：区域里写区域色、区域外纯黑', 'true'),
  terrainDebug('级别遮罩', '出级别遮罩图：每个地形像素写成它那一级的颜色', 'true'),
  terrainDebug('材质遮罩', '出材质遮罩图：树叶绿、实心棕、花草黄、水蓝', 'true'),
  terrainDebug('按级着色', '每个区段按级别叠一种颜色', 'true 或 0～1 的不透明度'),
  terrainDebug('世界网格', '地形上按游戏坐标每隔这么多米画线', '间距（米）'),
  terrainDebug('调试镜头', '只挪画面用的镜头，挑区段、定级别照原镜头', '{"位": [x,y,z], "看": [x,y,z]}', ['位', '看']),
  terrainDebug('加载视点', '挑区段、定级别改按这一点算，镜头不动', '{"位": [x,y,z], "远"?: 米}', ['位', '远'], true),
  { ...terrainDebug('切级日志', '每帧一行进终端：镜头离地、各级交界离镜头多远和俯角、和上一帧比换了级的区段（按游戏坐标）', 'true'), changesPicture: false },
  { name: '阴影日志', kind: 'trial', purpose: '级联阴影的切分、各级半径、一像素几米、中心有变就打一行进终端：查影子一帧一跳是不是哪一级跳了档', changesPicture: false, inFingerprint: false, readers: all, format: 'true', files: ['engine/light/级联阴影.ts'], note: '地形调试，docs/地形调试.md' },
  {
    name: '过渡带',
    kind: 'trial',
    purpose: '地形切级不整块跳：每一级交界前留一条带（离镜头 界 × 比例 到 界），带里粗一级叠在细一级上按距离渐变着混',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: 'true（比例 0.75）或 0～1 的比例',
    files: ['engine/voxel/过渡带.ts'],
    pending: '标签 实验/切级跳变',
    note: '修法，没进主线（用户 11-17 定飞行镜头用航线定级）；结论和什么时候值得捡回来见 docs/地形调试.md「切级跳变调查」',
  },
  {
    name: '阴影切分平滑',
    kind: 'trial',
    purpose: '级联阴影的切分换成前后一段时间的加权平均，中、远两级的交界跟没取整的切分走：离地高在档口来回跨时影子不整圈跳',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: 'true（前后各 0.5 秒）或 秒数',
    files: ['engine/light/级联阴影.ts', '作品/应力转动/地点/边城/6-2-5/飞越主世界.tsx'],
    pending: '标签 实验/切级跳变',
    note: '修法，没进主线（用户 11-17 定飞行镜头用航线定级）；结论和什么时候值得捡回来见 docs/地形调试.md「切级跳变调查」。标签上只有 6-2-5 飞越主世界 接了；和地形定级无关，可以单独捡',
  },

  // ---- 「关」能关的项（engine/voxel/ 以外的先做）----
  off('高度雾', '暮色的解析高度雾（材质和屏幕 AO 共用的 uniform 浓度置 0）', ['engine/light/高度雾.ts'], { note: replacedByFarFog }),
  off('远雾', '公里级镜头 D 附近拉满成天色的远雾；地形最远距离不变，露出地形的边', ['engine/light/高度雾.ts']),
  off('方向雾', '暮色雾色往余晖色混的那一份', ['engine/light/高度雾.ts'], { note: replacedByFarFog }),
  off('天色雾', '暮色雾色往视线方向天色靠的那一份（远雾要的色带照旧登记）', ['engine/light/高度雾.ts'], { note: replacedByFarFog }),
  off('天空', '穹顶（暮色色带、Photon 天空）连星星、太阳；露出场景背景色（主世界是黑的），云照旧', ['engine/light/天空.tsx']),
  off('云', 'Photon 云那一遍和原版方块云', ['engine/light/大气/云.ts', 'engine/light/天空.tsx'], { note: '云投在地形上的影子还在（体素材质里，等 engine/voxel 那批）' }),
  off('航线定级', '登记了航线的飞行镜头不按航线定级，回到每帧按画质门槛现选（用户 11-17 定航线定级之前的做法）', ['engine/voxel/选区段.ts'], { fullTerrain: true }),
  off('粒子', 'ParticleQuads 画的实例化粒子面片（方块碎屑、粉尘、气流这类）', ['库/特效/粒子面片.tsx'], { note: '振动、尖啸声波这类自己建面片的特效不管' }),
  off('阴影', '地形投影', ['engine/voxel/'], { pending: voxelPending, note: voxelNote }),
  off('AO', '屏幕 AO', ['engine/voxel/屏幕AO.tsx'], { pending: voxelPending, note: voxelNote }),
  off('台阶并色', '台阶并色', ['engine/voxel/材质.ts'], { pending: voxelPending, note: voxelNote }),
  off('花草', '地表花草', ['engine/voxel/'], { pending: voxelPending, note: voxelNote }),
  off('远景', '远景网格（导入范围外的高度、群系网格）', ['engine/voxel/远景.ts'], { pending: voxelPending, note: voxelNote }),

  // ---- 页面认的调试环境变量 ----
  {
    name: 'REMOTION_ANIM_TRIAL',
    kind: 'channel',
    purpose: '试看参数表本身（上面 kind=trial 的键）',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: 'JSON 对象；still 还能用 --trial 一次给几组',
    files: ['engine/core/试看.ts', 'pipeline/渲/地形注入.ts'],
  },
  {
    name: 'REMOTION_ANIM_LIGHTING',
    kind: 'channel',
    purpose: 'still、bench 的 --shading：三渲二画布换成带光影层的试看画布',
    changesPicture: true,
    inFingerprint: false,
    readers: ['still', 'bench'],
    format: '--shading 的一份配置（预设名或 JSON）',
    files: ['pipeline/渲/光影试看.ts', 'engine/三渲二/光影/试看画布.tsx', '作品/把回忆拼好给你/场/2-海上/海底.tsx'],
    note: '不并进试看表：要打包时把画布模块换掉，平时的包里没有试看画布。并进去了 film 的试看模式（用平时的包）会收下它、却什么也不画',
  },
  {
    name: 'REMOTION_ANIM_TELE',
    kind: 'channel',
    purpose: 'still 的 --tele：照原镜头把原帧里的一块矩形原生渲满整张图',
    changesPicture: true,
    inFingerprint: false,
    readers: ['still'],
    format: '--tele 的一块矩形（pipeline/渲/望远.ts 算好的 JSON）',
    files: ['pipeline/渲/望远.ts', 'engine/段/望远.ts'],
    note: '不并进试看表：要打包时多加一个入口（engine/段/望远.ts），平时的包里没有它；矩形按出图像素算，只有 still 知道',
  },
] as const satisfies readonly DebugSwitch[];

type Row = (typeof debugSwitches)[number];
export type TrialName = Extract<Row, { kind: 'trial' }>['name'];
export type OffName = Extract<Row, { kind: 'off' }>['name'];
export type ChannelName = Extract<Row, { kind: 'channel' }>['name'];

/** REMOTION_ANIM_ 开头、却不是调试开关的页面环境变量（正式渲染要用），check 不要求登记 */
export const nonDebugEnvNames = ['REMOTION_ANIM_TERRAIN_PACKS'] as const;

export const findSwitch = (kind: SwitchKind, name: string): DebugSwitch | undefined => (debugSwitches as readonly DebugSwitch[]).find((s) => s.kind === kind && s.name === name);

/** pipeline 按名字读试看表里的一个键：类型上只收登记过的名字，check 也按它数「有人用」 */
export const trialKey = <N extends TrialName>(name: N): N => name;
