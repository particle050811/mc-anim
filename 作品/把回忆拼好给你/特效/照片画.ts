// 第 8 句她收进箱子的四张照片（三稿：你截下的图，白边和第 11 句的拍立得一样）：照片里的画面先用 16×9 的像素画顶上，Agent 暂定。
// 以后那几句（第 3、4、5、7 句）做出来，换成那几句的真帧（照片.tsx 的 画 换成截下来的帧缩成 16×9），这里的像素画就删。
// 一个像素 = 一个方块贴图像素（05-画风 原则 3：照片是放进 3D 的平面物件，像素密度和方块一样）。手机竖屏宽（390 像素）上一张照片约 27 像素宽，
// 认得出的只有大块的颜色和形状，所以每张都按「那一幕的主色 + 一两个记号」画：樱粉和爱心蛋糕、橙红落日和船、黑紫末地和龙蛋、灰云里的金光柱。
// 纯数据。行们从上往下写，每行 宽 个字符，一个字符一个像素，字符查 色（'.' 也要在 色 里）。

export type 像素画 = { 名: string; 宽: number; 高: number; 行们: readonly string[]; 色: Readonly<Record<string, string>> };

/** 她（粉发、黑魔女帽、粉红衣服）和你（棕发、青衣、蓝裤）在照片里的颜色，四张共用 */
const 人色 = { K: '#f2a3c6', k: '#2b2233', f: '#fbe2d4', r: '#e05a86', h: '#3b2614', t: '#c48a68', c: '#19a3a3', b: '#3a3794' } as const;

/** 第 3 句：祭坛召唤出她，你递上蛋糕，爱心冒出来（樱花林边） */
const 递蛋糕: 像素画 = {
  名: '递蛋糕',
  宽: 16,
  高: 9,
  行们: [
    'pq.....R.R....qp',
    'p.......R...k..p',
    '..hhh......kkk..',
    'w.ttt.....kkkkkw',
    'w.ccctWRW.KfffKw',
    'w.ccc.WWWfKrrrKw',
    'w.bbb......rrr.w',
    'w.b.b......f.f.w',
    'gggggggggggggggg',
  ],
  色: { ...人色, '.': '#a9d4ff', p: '#f7b9d2', q: '#e48fb4', w: '#ebe6dc', W: '#fff7ee', R: '#d93a3a', g: '#74b043' },
};

/** 第 4 句：日落，你划着船、她坐在船上 */
const 日落划船: 像素画 = {
  名: '日落划船',
  宽: 16,
  高: 9,
  行们: [
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbkbbbbbbbb',
    'ooooookkkoooSSoo',
    'yyyhyyKKKyySSSSy',
    'ssscssKrKsslllls',
    'sBBBBBBBBBssslss',
    'ssBBBBBBBsssslss',
    'swssssswsssssssw',
    'ssssssssssssssss',
  ],
  色: { ...人色, a: '#7a3d7e', b: '#c4587a', o: '#f0884a', y: '#ffc35c', S: '#fff1a8', s: '#2c3c70', w: '#41588f', l: '#f5a35a', B: '#6b4024' },
};

/** 第 5 句：末地，她扑在龙蛋上（蛋带着紫色粒子） */
const 扑龙蛋: 像素画 = {
  名: '扑龙蛋',
  宽: 16,
  高: 9,
  行们: [
    '.*.......*....*.',
    '...........k....',
    '..v.......kkk...',
    '.........kkkkk..',
    '....D....KfffK.v',
    '...DPDffrrrrK...',
    '...DDD...rr.KK..',
    '.v.PDP........v.',
    'eeEeeeeEeeeeEeee',
  ],
  色: { ...人色, '.': '#160f24', '*': '#cbbcff', v: '#c27bff', D: '#120c18', P: '#6b3aa0', e: '#e3e3a6', E: '#c6c487' },
};

/** 第 7 句：她脚下的魔法阵，光柱打穿雨云 */
const 光柱破云: 像素画 = {
  名: '光柱破云',
  宽: 16,
  高: 9,
  行们: [
    'CCCCCCLLLLCCCCCC',
    'CccccLbBBbLccccC',
    'ccccccbBBbcccccc',
    '......bBBb......',
    '......bBBb......',
    '......bkBb......',
    '......kkkk......',
    '......KffK......',
    'gggmmmmrrmmmmggg',
  ],
  色: { ...人色, C: '#41465a', c: '#5c6274', L: '#ffd98a', b: '#ffe7a0', B: '#fffbe0', '.': '#7f889c', g: '#4e7a40', m: '#ffd36a' },
};

/** 收进箱子的顺序（三稿：按前面出场的顺序） */
export const 第8句照片们: readonly 像素画[] = [递蛋糕, 日落划船, 扑龙蛋, 光柱破云];

/** 相纸：白边的颜色和宽（照片像素）。照 场/1-隐世之境一楼/参数.ts 的 拍立得样式（第 11 句的拍立得照它）：三边 0.03、下边 0.12 个画面宽，
 *  16 像素宽的画面上取整成三边 1、下边 2；相纸色同它 */
export const 相纸 = { 色: '#fbfaf6', 边: 1, 下边: 2 } as const;

/** 一张照片（连白边）多少照片像素 */
export const 照片尺寸 = (画: 像素画) => ({ 宽: 画.宽 + 2 * 相纸.边, 高: 画.高 + 相纸.边 + 相纸.下边 });

/** 照片连白边的 RGBA 像素（从上往下一行行排），给 照片.tsx 做贴图 */
export const 照片像素 = (画: 像素画): Uint8Array => {
  const { 宽, 高 } = 照片尺寸(画);
  if (画.行们.length !== 画.高) throw new Error(`照片「${画.名}」有 ${画.行们.length} 行，要 ${画.高} 行`);
  const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const 纸 = rgb(相纸.色);
  const out = new Uint8Array(宽 * 高 * 4);
  for (let y = 0; y < 高; y++)
    for (let x = 0; x < 宽; x++) {
      const 行 = 画.行们[y - 相纸.边];
      const 字 = 行?.[x - 相纸.边];
      let c = 纸;
      if (行 !== undefined && x >= 相纸.边 && x < 相纸.边 + 画.宽) {
        if (行.length !== 画.宽) throw new Error(`照片「${画.名}」第 ${y - 相纸.边} 行有 ${行.length} 个字符，要 ${画.宽} 个`);
        const hex = 画.色[字!];
        if (!hex) throw new Error(`照片「${画.名}」的字符「${字}」没有颜色`);
        c = rgb(hex);
      }
      out.set([c[0]!, c[1]!, c[2]!, 255], (y * 宽 + x) * 4);
    }
  return out;
};
