// 第六章两次高空飞行的配乐怎么用：Wasted 拆成两半，每一段落在音乐的什么位置、卡点在哪。
// 和脚本 正篇/06-古城寻卷/脚本规划.md 第 2 场末尾「飞行配乐拆成两半」那张表一一对应，改一边要同步另一边。
// 位置都写成 [小节, 拍]（Wasted 的网格，第 1 小节第 1 拍在 0.29 秒），秒数由 曲目.ts 的 秒() 算。
import { Wasted } from './Wasted.ts';
import { posToSec, type MusicPos, type Song } from '@engine/audio/曲目.ts';

export type HalfName = '前一半' | '后一半';

export type MusicHalf = {
  名: HalfName;
  起: MusicPos; // 卡点画面从这里开始（也是音乐的起点）
  止: MusicPos; // 卡点画面到这里结束；音乐在淡出结束时就没了，之后是按台词定长的部分
  淡入?: readonly [MusicPos, MusicPos];
  fadeOut?: readonly [MusicPos, MusicPos];
  说明: string;
};

export type Cues = { pos: MusicPos; text: string; major?: boolean }; // 重：画面上要对准的主卡点
export type MusicSegment = { segmentId: string; name: string; half: HalfName; start: MusicPos; end: MusicPos; visual: string; Cues: readonly Cues[] };

export type MusicTable = {
  name: string;
  song: Song;
  cutPoint: MusicPos; // 前一半在这里开始渐弱，后一半从这里放起
  halves: Record<HalfName, MusicHalf>;
  segments: readonly MusicSegment[];
};

const shieldCue = (i: number): Cues => ({ pos: [14, 1 + i * 0.5], text: `盾${i + 1}` });

export const ch6FlightMusic: MusicTable = {
  name: '第六章飞行配乐',
  song: Wasted,
  cutPoint: [29, 1],
  halves: {
    前一半: {
      名: '前一半',
      起: 0,
      止: [33, 1],
      fadeOut: [
        [29, 1],
        [31, 1],
      ],
      说明: '6-1-3 起飞 → 6-1-9 停在城堡前；切点进 breakdown，两小节渐弱',
    },
    后一半: {
      名: '后一半',
      起: [29, 1],
      止: [49, 1],
      淡入: [
        [29, 1],
        [29, 2],
      ],
      fadeOut: [
        [46, 1],
        [49, 1],
      ],
      说明: '6-2-4 出发 → 6-3-1 悬停在边城上空；从切点淡入一拍，尾段三小节渐弱',
    },
  },
  segments: [
    {
      segmentId: '6-1-3',
      name: '起飞',
      half: '前一半',
      start: 0,
      end: [6, 1],
      visual: '九胡沿迷宫跑到中心，二人跨上扫帚；drop 一响扫帚从庭院中心拔地而起、猛加速升到树冠上空两百米',
      // 6-1-3 段到下蹲蓄力那一刀为止（drop 前 15 帧），下沉、drop 起飞在 6-1-4至9 里
      Cues: [
        { pos: [1, 1], text: '前奏：上扫帚' },
        { pos: [4, 4], text: '低频上扬，扫帚往下一沉' },
        { pos: [5, 1], text: 'drop：起飞', major: true },
      ],
    },
    // 6-1-4～6-1-9 是一镜到底（src/镜头/一镜到底/），一段 6-1-4至9（用户 10-18 定，从 6-1-3 的下蹲蓄力起，见 镜头/6-1/段界.ts）；
    // 下面几条的 segmentId 只是这一段里按 boss 分的节名。起止和卡点仍是旧的，音乐对齐等画面定稿后再做
    {
      segmentId: '6-1-4',
      name: '飞越暮色',
      half: '前一半',
      start: [6, 1],
      end: [12, 1],
      visual: '接 6-1-3 末帧，1.5 秒内加到 1000 米/秒，降到离树冠一两百米往北巡航，从巫妖怪塔东边掠过',
      Cues: [
        { pos: [6, 1], text: '接起飞，猛加速到 1 公里/秒', major: true },
        { pos: [9, 1], text: '贴着树冠上空巡航' },
        { pos: [11, 1], text: '巫妖怪塔出现在左前方' },
      ],
    },
    {
      segmentId: '6-1-5',
      name: '穿塔杀巫妖',
      half: '前一半',
      start: [12, 1],
      end: [17, 1],
      visual: '塔北边降着高度左转掉头 → 由北往南撞进巫妖的房间，子弹时间：药水破六层盾、贯穿、化烟 → 穿出副楼，右转往西北',
      Cues: [
        { pos: [12, 1], text: '减速掉头' },
        { pos: [12, 4], text: '对准北墙直飞' },
        { pos: [13, 1], text: '撞塔，时钟放慢', major: true },
        { pos: [13, 3], text: '药水脱手，鼓风机吹成一排' },
        shieldCue(0),
        shieldCue(1),
        shieldCue(2),
        shieldCue(3),
        shieldCue(4),
        shieldCue(5),
        { pos: [14, 4], text: '贯穿' },
        { pos: [15, 1], text: '时钟恢复，破墙而出', major: true },
      ],
    },
    {
      segmentId: '6-1-6',
      name: '穿刺九头蛇',
      half: '前一半',
      start: [17, 1],
      end: [22, 1],
      visual: '掠过暮光沼泽进火焰沼泽，降下来斜着扎进巢穴，原速贯穿九头蛇，镜头停在巢穴边看它炸开，再追上去',
      Cues: [
        { pos: [17, 1], text: '暮光沼泽上空巡航' },
        { pos: [19, 4], text: '降下来，往下扎', major: true },
        { pos: [21, 1], text: '贯穿九头蛇', major: true },
        { pos: [21, 3], text: '贴地拉起' },
      ],
    },
    {
      segmentId: '6-1-7a',
      name: '连穿·暮初恶魂',
      half: '前一半',
      start: [22, 1],
      end: [24, 1],
      visual: '飞越黑暗森林，降到幽冥高塔塔顶的高度，横穿塔顶，原速贯穿暮初恶魂',
      Cues: [
        { pos: [22, 1], text: '黑暗森林、腹地' },
        { pos: [23, 1], text: '贯穿暮初恶魂', major: true },
      ],
    },
    {
      segmentId: '6-1-7b',
      name: '连穿·雪怪首领',
      half: '前一半',
      start: [24, 1],
      end: [26, 1],
      visual: '飞越积雪森林，斜着撞穿雪怪洞窟的洞顶，原速贯穿雪怪首领，从北边洞顶穿出，出洞马上放平、贴着树冠往北',
      Cues: [
        { pos: [24, 1], text: '积雪森林' },
        { pos: [25, 1], text: '贯穿雪怪首领（副歌二进）', major: true },
      ],
    },
    {
      segmentId: '6-1-8',
      name: '穿刺冰雪女王',
      half: '前一半',
      start: [26, 1],
      end: [27, 3],
      visual: '极光冰川上空降到宫殿顶层的高度，撞穿南墙，子弹时间：贯穿冰雪女王、冰盾撞散、化烟，撞穿北墙放平往北',
      Cues: [
        { pos: [26, 1], text: '极光冰川' },
        { pos: [27, 1], text: '贯穿冰雪女王', major: true },
      ],
    },
    {
      segmentId: '6-1-8b',
      name: '穿刺巨人',
      half: '前一半',
      start: [27, 3],
      end: [28, 1],
      visual: '荆棘高地上空，撞穿云中小屋，子弹时间里镜头绕到侧面（东墙剖开）看一矛串起两个巨人、化烟，再回到后面，撞穿北墙往终焉城堡去',
      Cues: [{ pos: [27, 3], text: '贯穿两个巨人', major: true }],
    },
    {
      segmentId: '6-1-9',
      name: '空城堡',
      half: '前一半',
      start: [28, 1],
      end: [33, 1],
      visual: '越过荆棘之地，降着高度急减速，降落在终焉城堡主楼顶的屋顶平台上；城堡是空的。渐弱完以后的长度按台词定',
      Cues: [
        { pos: [28, 1], text: '越过荆棘之地' },
        { pos: [29, 1], text: '切点：落在城堡屋顶上，breakdown，开始渐弱', major: true },
        { pos: [31, 1], text: '渐弱到无声' },
      ],
    },
    {
      segmentId: '6-2-4',
      name: '出发',
      half: '后一半',
      start: [29, 1],
      end: [33, 1],
      visual: '李樱把指南针递给九胡，跨上扫帚，扫帚离地；最后一拍扫帚上窜，尾部草束盖满画面',
      Cues: [
        { pos: [29, 1], text: '从切点放起（淡入一拍）：「九胡，我们出发了！」', major: true },
        { pos: [30, 1], text: '跨上扫帚：「哔↗哔↘…」' },
        { pos: [31, 1], text: '扫帚离地' },
        { pos: [32, 4], text: '扫帚上窜，草束盖满画面', major: true },
      ],
    },
    {
      // 2026-10-05 搬到主世界-116 真实地形后，6-2-5、6-2-6 的长度按航线和每秒一公里的速度定（见 6-2-5/编排.ts 的 段表），不再落在下面这些小节上；
      // 用户「音乐卡点别管了 最后再管」，这里的起止、卡点先留旧值，配乐由 6-2-5/飞越主世界.tsx 的 飞行配乐 从 33.1 接着放
      segmentId: '6-2-5',
      name: '飞越主世界',
      half: '后一半',
      start: [33, 1],
      end: [39, 1],
      visual: '首帧是草束；低频砸回来那一拍草束抽走，已在基地小岛上空的高空；俯冲穿云，离地 80 米出海、上岸，飞过雪原、平原、沙漠，到暖水海湾上转弯',
      Cues: [
        { pos: [33, 1], text: '低频砸回来：草束抽走，露出室外', major: true },
        { pos: [34, 1], text: '俯冲穿云' },
        { pos: [36, 1], text: '拉平到离地 80 米，出海' },
        { pos: [37, 3], text: '群岛迎面而来' },
        { pos: [38, 1], text: '拉升越山' },
      ],
    },
    {
      segmentId: '6-2-6',
      name: '边城在望',
      half: '后一半',
      start: [39, 1],
      end: [46, 1],
      visual: '转过弯往西南偏西疾飞，边城出现在前方的平原上；翻过城东那座山顶积雪的石山，爬到云层上方；急刹拉起，悬停在边城正上方的高空',
      Cues: [
        { pos: [39, 1], text: '快嘴段：翻过山脊' },
        { pos: [41, 1], text: '下到离地 500，回到大陆' },
        { pos: [43, 1], text: '边城在前方，往上爬' },
        { pos: [44, 1], text: '开始减速' },
        { pos: [44, 4], text: '抽底：急刹拉起', major: true },
      ],
    },
    {
      segmentId: '6-3-1',
      name: '又回到边城',
      half: '后一半',
      start: [46, 1],
      end: [49, 1],
      visual: '悬停在边城上空，李樱掏出指南针看一眼，指针直指正下方；配乐渐弱，台词压在上面',
      Cues: [
        { pos: [46, 1], text: '低频回来：悬停，开始渐弱', major: true },
        { pos: [49, 1], text: '渐弱到无声' },
      ],
    },
  ],
};

// 某一半在歌曲时间 t 的音量（0~1）。淡入用正弦曲线，淡出按振幅 (1-x)² 下降（一半处约 -12 dB）
export const halfGain = (table: MusicTable, halfName: HalfName, t: number): number => {
  const half = table.halves[halfName];
  let gain = 1;
  if (half.淡入) {
    const [fadeStart, fadeEnd] = [posToSec(table.song, half.淡入[0]), posToSec(table.song, half.淡入[1])];
    if (t < fadeStart) return 0;
    if (t < fadeEnd) gain *= Math.sin(((t - fadeStart) / (fadeEnd - fadeStart)) * (Math.PI / 2));
  }
  if (half.fadeOut) {
    const [fadeStart, fadeEnd] = [posToSec(table.song, half.fadeOut[0]), posToSec(table.song, half.fadeOut[1])];
    if (t >= fadeEnd) return 0;
    if (t > fadeStart) gain *= (1 - (t - fadeStart) / (fadeEnd - fadeStart)) ** 2;
  }
  return gain;
};

export const allMusicTables: readonly MusicTable[] = [ch6FlightMusic];

export const findSegment = (segmentId: string) => {
  for (const table of allMusicTables) {
    const segment = table.segments.find((x) => x.segmentId === segmentId);
    if (segment) return { table: table, segment: segment };
  }
  throw new Error(`配乐表里没有段 ${segmentId}`);
};
