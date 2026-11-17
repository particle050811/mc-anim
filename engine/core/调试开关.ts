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
  /** 试看、调试通道一律不进指纹，留这一列是让表上看得见 */
  readonly inFingerprint: false;
  readonly readers: readonly SwitchReader[];
  /** 值的格式（给人看的） */
  readonly format: string;
  /** 值是对象时认的子键：写了别的键报错（照着旧注释写错键，参数悄悄不生效，见 暮色远景） */
  readonly keys?: readonly string[];
  /** 落点：读它、实现它的文件 */
  readonly files: readonly string[];
  /** 还没合进 main：在哪条分支或标签上 */
  readonly pending?: string;
  readonly note?: string;
};

const all: readonly SwitchReader[] = ['still', 'film', 'bench'];
type Named<K extends SwitchKind, N extends string> = Omit<DebugSwitch, 'name' | 'kind'> & { readonly name: N; readonly kind: K };
// 两个帮手都留住名字的字面量类型：TrialName、OffName 要从表里推出来
const off = <N extends string>(name: N, purpose: string, files: string[], extra: Pick<DebugSwitch, 'pending' | 'note'> = {}): Named<'off', N> => ({
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
const voxelPending = '分级色调';
// 地形调试的几项（分支 分级色调 的 engine/voxel/调试.tsx）
const terrainDebug = <N extends string>(name: N, purpose: string, format: string, keys?: string[]): Named<'trial', N> => ({
  name,
  kind: 'trial',
  purpose,
  changesPicture: true,
  inFingerprint: false,
  readers: all,
  format,
  ...(keys ? { keys } : {}),
  files: ['engine/voxel/调试.tsx'],
  pending: '分级色调',
  note: '地形调试，docs/地形调试.md（在那条分支上）',
});
const voxelNote = '等 分级色调 合并后接：分级色调、下界光体 两条分支正在改 engine/voxel/，现在动会冲突';

export const debugSwitches = [
  // ---- 试看参数（REMOTION_ANIM_TRIAL 的键）----
  {
    name: '雾曲线',
    kind: 'trial',
    purpose: '远雾从 D 的几成开始升（全片 0.9）、换这个镜头的 D（地形最远距离跟着换）',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: '{"起"?: 0～1, "远"?: 米}',
    keys: ['起', '远'],
    files: ['engine/light/高度雾.ts'],
    note: '「远」经 trialFarM 落到各镜头：作品/应力转动/地点/边城/6-2-5/飞越主世界.tsx、地点/基地小岛.tsx、地点/暮色新世界/超远景.ts、作品/亚波伦不放水/地点/真下界.tsx 等',
  },
  {
    name: '暮色远景',
    kind: 'trial',
    purpose: '暮色超远景：盖掉正式值，或给没开的暮色镜头打开（要多读的包写在「地形」）',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: '{"雾远": 米, "高度雾": 倍数}（两项都要给）',
    keys: ['雾远', '高度雾'],
    files: ['作品/应力转动/地点/暮色新世界/超远景.ts'],
  },
  {
    name: '下界光',
    kind: 'trial',
    purpose: '下界发光方块照亮周围的原型（光体或点光）',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: '{"mode"?: "volume"|"points", "radius"?: 米, "decay"?: 0～1, "strength"?: 数, "count"?: 盏}',
    keys: ['mode', 'radius', 'decay', 'strength', 'count'],
    files: ['作品/亚波伦不放水/地点/下界光照.tsx'],
    note: '分支 下界光体 删掉了这个原型（改成正式的光体），合并后删这一行',
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
    files: ['engine/core/试看.ts'],
  },
  {
    name: '细分门槛',
    kind: 'trial',
    purpose: '视频级的区段细分门槛（输出像素），盖掉 2.25',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: '数，如 1.5',
    files: ['engine/core/渲染级别.ts'],
    pending: '细分门槛',
  },
  {
    name: '地形统计',
    kind: 'trial',
    purpose: '每帧一行地形统计进浏览器日志（bench --verbose 的 .log），量细分门槛的代价',
    changesPicture: false,
    inFingerprint: false,
    readers: all,
    format: 'true',
    files: ['engine/voxel/世界.tsx'],
    pending: '细分门槛',
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
    purpose: '查体素地形各级色调差：定级、真几何、关阴影、AO、台阶并色',
    changesPicture: true,
    inFingerprint: false,
    readers: all,
    format: '{"定级"?: 级, "真几何"?: true, "阴影"?: false, "AO"?: "关"|"满", "并色"?: false}',
    keys: ['定级', '真几何', '阴影', 'AO', '并色'],
    files: ['engine/voxel/分级色调.ts'],
    pending: '分级色调',
  },
  terrainDebug('标记', '画面上按世界坐标标点、名字和距离', '[{"名", "位": [x,y,z]|[x,z], "色"?, "光柱"?, "场景"?}]'),
  terrainDebug('区域', '世界里的多边形：地形上描边、淡淡染色', '[{"名", "点": [[x,z], …], "色"?}]'),
  terrainDebug('区域遮罩', '出遮罩图：区域里写区域色、区域外纯黑', 'true'),
  terrainDebug('按级着色', '每个区段按级别叠一种颜色', 'true 或 0～1 的不透明度'),
  terrainDebug('世界网格', '地形上按游戏坐标每隔这么多米画线', '间距（米）'),
  terrainDebug('调试镜头', '只挪画面用的镜头，挑区段、定级别照原镜头', '{"位": [x,y,z], "看": [x,y,z]}', ['位', '看']),
  terrainDebug('加载视点', '挑区段、定级别改按这一点算，镜头不动', '{"位": [x,y,z], "远"?: 米}', ['位', '远']),

  // ---- 「关」能关的项（engine/voxel/ 以外的先做）----
  off('高度雾', '暮色的解析高度雾（材质和屏幕 AO 共用的 uniform 浓度置 0）', ['engine/light/高度雾.ts']),
  off('远雾', '公里级镜头 D 附近拉满成天色的远雾；地形最远距离不变，露出地形的边', ['engine/light/高度雾.ts']),
  off('方向雾', '暮色雾色往余晖色混的那一份', ['engine/light/高度雾.ts']),
  off('天色雾', '暮色雾色往视线方向天色靠的那一份（远雾要的色带照旧登记）', ['engine/light/高度雾.ts']),
  off('天空', '穹顶（暮色色带、Photon 天空）连星星、太阳；背景色照旧', ['engine/light/天空.tsx']),
  off('云', 'Photon 云那一遍和原版方块云', ['engine/light/大气/云.ts', 'engine/light/天空.tsx'], { note: '云投在地形上的影子还在（体素材质里，等 engine/voxel 那批）' }),
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
