// 下界魔杖重做：本片自己做的下界魔杖（用户 11-10：「感觉地狱法杖的那个建模做的没有什么辨识度，你要不重做一下？」），三个候选等用户挑。
// 原模型（物品/下界魔杖.tsx，Goety 的 goety:nether_staff）杆 1 像素粗、杖头 5 像素宽，拿在 0.7 倍的角色手上又细又黑，压在黑红衣服和暗红背景上认不出。
// 候选都留着原版的母题（黑杆、杖头的笼或框、发亮的黄橙芯、尖刺），杆加粗到 2 像素，杖头放大，芯不受光、不过色调映射，外面加一团加色的光晕。
// 做法：方盒拼的像素模型，一个模型像素一个贴图像素（和 MC 物品同一种语言）；贴图 贴图/物品/下界魔杖重做 是自己画的 8 块料（assets/tools/画下界魔杖重做贴图.py）。
//
// 杖空间：单位格（1 格 = 16 模型像素），杖身的轴是 Y 轴，杖尾在原点、杖头朝 +Y，正面朝 +Z。
// 接口：<重做魔杖 款="甲" />       杖空间，核对图用
//       <手持重做魔杖 款="甲" />   挂在手部定位骨上，握点落在原版握点的位置（同 物品/下界魔杖.tsx 的 手持下界魔杖）
//       重做杖款('甲')            交给 角色/娘化亚波伦.tsx 的 杖 属性：她拿这根，持杖位姿 也按这根算
import { useMemo, type FC, type ReactNode } from 'react';
import * as THREE from 'three';
import { png, type Png } from '@engine/model/贴图.ts';
import 图集 from 'asset:贴图/物品/下界魔杖重做';

type 三 = readonly [number, number, number];

// 料：贴图上第几块（x = 号 % 4 × 16，y = 号 ÷ 4 取整 × 16）。亮 = 不受光、不过色调映射；居中 = 每个面取料的正中那一块（芯的亮心在面正中）
const 料表 = {
  黑: { 号: 0 },
  黑亮: { 号: 1 },
  金: { 号: 2 },
  芯: { 号: 3, 亮: true, 居中: true },
  岩浆: { 号: 4, 亮: true },
  熔核: { 号: 5, 亮: true },
  绯红: { 号: 6 },
  烈焰: { 号: 7, 亮: true },
} satisfies Record<string, { 号: number; 亮?: true; 居中?: true }>;
type 料名 = keyof typeof 料表;

/** 绕过 心 的 轴 转几度（右手） */
type 转 = { 心: 三; 轴: 三; 度: number };
/** 一个方盒（模型像素）：a、b 是对角；转 里的几次依次做 */
type 盒 = { a: 三; b: 三; 料: 料名; 转?: readonly 转[] };

const 盒 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, 料: 料名, ...转: 转[]): 盒 => ({ a: [x0, y0, z0], b: [x1, y1, z1], 料, 转 });
/** 以杖轴为中心的方柱：边长 w，y0～y1 */
const 柱 = (w: number, y0: number, y1: number, 料: 料名): 盒 => 盒(-w / 2, y0, -w / 2, w / 2, y1, w / 2, 料);
/** 方框：外沿半宽 r、粗 t 的四根横梁围一圈，y0～y1 */
const 框 = (r: number, y0: number, y1: number, 料: 料名, t = 1): 盒[] => [
  盒(-r, y0, -r, r, y1, -r + t, 料),
  盒(-r, y0, r - t, r, y1, r, 料),
  盒(-r, y0, -r + t, -r + t, y1, r - t, 料),
  盒(r - t, y0, -r + t, r, y1, r - t, 料),
];
/** 四角各一个（sx、sz = ±1） */
const 四角 = (做: (sx: number, sz: number) => 盒[]): 盒[] => [[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([sx, sz]) => 做(sx!, sz!));
/** 四边正中各一个：(dx, dz) 是朝外的方向 */
const 四边 = (做: (dx: number, dz: number) => 盒[]): 盒[] => [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dx, dz]) => 做(dx!, dz!));
/** 把朝 +Y 的东西往水平方向 (dx, dz) 倒 度：转轴 = Y × 方向 */
const 外倒 = (心: 三, dx: number, dz: number, 度: number): 转 => ({ 心, 轴: [dz, 0, -dx], 度 });
/** 把沿 X 的东西绕竖轴转到水平方向 (dx, dz) 上 */
const 朝 = (心: 三, dx: number, dz: number): 转 => ({ 心, 轴: [0, 1, 0], 度: (Math.atan2(-dz, dx) * 180) / Math.PI });
/**
 * 字符画成一块板：每行一串字符，一个字符一个像素，最后一行的底在 y0，整块左右居中，厚 z0～z1；字 → 料，没列的字符是空。
 * 每行里连着的同一种料并成一个盒
 */
const 板 = (行们: readonly string[], y0: number, z0: number, z1: number, 字: Record<string, 料名>): 盒[] => {
  const 出: 盒[] = [];
  行们.forEach((行, r) => {
    const y = y0 + 行们.length - 1 - r;
    for (let i = 0; i < 行.length; ) {
      let j = i;
      while (j < 行.length && 行[j] === 行[i]) j++;
      const 料 = 字[行[i]!];
      if (料) 出.push(盒(i - 行.length / 2, y, z0, j - 行.length / 2, y + 1, z1, 料));
      i = j;
    }
  });
  return 出;
};

export type 魔杖款 = {
  名: string;
  盒们: readonly 盒[];
  /** 以下都是模型像素、沿杖轴的高度：全长、握在哪、芯的中心、杖头最顶上那一点 */
  全长: number;
  握: number;
  芯: number;
  /** 光晕的直径（模型像素） */
  光晕: number;
};

// ── 甲「放大忠实版」：原模型的结构放大加密。原版杖头是 托 → 两层一层比一层宽的镂空笼 → 中间的芯 → 四角各一片沿对角线立着的尖；
//    这里杆 2 粗带节，笼 8 宽、10 宽两层（每面开窗看得见芯），芯 6×6×6、顶上敞着，四角的尖片 3 宽、下宽上窄、往外倒 12 度 ──
const 甲: 魔杖款 = {
  名: '甲 放大忠实版',
  全长: 41,
  握: 15,
  芯: 31,
  光晕: 20,
  盒们: [
    柱(3, 0, 2, '黑亮'),
    柱(2, 2, 26, '黑'),
    柱(3, 8, 10, '黑亮'),
    柱(3, 17, 19, '黑亮'),
    // 托
    柱(4, 25, 26, '黑亮'),
    柱(6, 26, 27, '黑'),
    // 下层笼：8 宽，底板、四角各一块、顶上一圈
    柱(8, 27, 28, '黑亮'),
    ...四角((sx, sz) => [盒(sx * 2, 28, sz * 2, sx * 4, 30, sz * 4, '黑')]),
    ...框(4, 30, 31, '黑'),
    // 上层笼：10 宽
    ...框(5, 31, 32, '黑亮'),
    ...四角((sx, sz) => [盒(sx * 3, 32, sz * 3, sx * 5, 34, sz * 5, '黑')]),
    ...框(5, 34, 35, '黑亮'),
    柱(6, 28, 34, '芯'),
    // 四角的尖片：沿对角线立着（从哪边看都有两片是正对的），三级收窄
    ...四角((sx, sz) => {
      const 心: 三 = [sx * 4.5, 34, sz * 4.5];
      const 转 = [朝(心, sx, sz), 外倒(心, sx, sz, 12)];
      return [
        盒(心[0] - 1.5, 33, 心[2] - 0.5, 心[0] + 1.5, 37, 心[2] + 0.5, '黑', ...转),
        盒(心[0] - 0.5, 37, 心[2] - 0.5, 心[0] + 1.5, 39, 心[2] + 0.5, '黑', ...转),
        盒(心[0] + 0.5, 39, 心[2] - 0.5, 心[0] + 1.5, 41, 心[2] + 0.5, '黑亮', ...转),
      ];
    }),
  ],
};

// ── 乙「下界主题版」：一盏下界笼灯。绯红菌柄的杆、黑石镶金的箍，脖子上四根烈焰棒绕着杆悬着（烈焰人的样子）；
//    杖头 10 宽的灯笼：四根角柱里悬一颗 6×6×6 的熔核，上面是一级级收上去的塔顶和金顶针，四角的檐往外上方翘、金尖，灯底四角各垂一根短刺 ──
const 乙: 魔杖款 = {
  名: '乙 下界主题版',
  全长: 43,
  握: 14,
  芯: 31,
  光晕: 20,
  盒们: [
    柱(3, 0, 1, '金'),
    柱(3, 1, 3, '黑'),
    柱(2, 3, 25, '绯红'),
    柱(3, 7, 9, '黑'),
    柱(3, 9, 10, '金'),
    // 四根烈焰棒：离杆 2 像素悬着
    ...四边((dx, dz) => [盒(dx * 3.5 - 0.5, 16, dz * 3.5 - 0.5, dx * 3.5 + 0.5, 22, dz * 3.5 + 0.5, '烈焰')]),
    // 灯座
    柱(4, 24, 25, '黑'),
    柱(6, 25, 26, '金'),
    柱(10, 26, 27, '黑亮'),
    ...四角((sx, sz) => [
      // 灯底的短刺
      盒(sx * 4, 24, sz * 4, sx * 5, 26, sz * 5, '黑'),
      // 角柱
      盒(sx * 4, 27, sz * 4, sx * 5, 35, sz * 5, '黑'),
    ]),
    柱(6, 28, 34, '熔核'),
    // 塔顶
    柱(10, 35, 36, '黑亮'),
    柱(8, 36, 37, '黑'),
    柱(6, 37, 38, '金'),
    柱(4, 38, 39, '黑'),
    柱(2, 39, 41, '黑亮'),
    柱(1, 41, 43, '金'),
    // 翘檐
    ...四角((sx, sz) => [盒(sx * 5, 35, sz * 5, sx * 6, 36, sz * 6, '黑亮'), 盒(sx * 6, 36, sz * 6, sx * 7, 38, sz * 7, '金')]),
  ],
};

// ── 丙「权杖版」：黑杆金箍，杖头是两弯十字交叉、朝上开口的黑石新月（四只角往里收、金尖，外沿带小刺），月怀里悬一颗斜放的芯 ──
const 月 = [
  '....g.........g....',
  '...##.........##...',
  '..o#...........#o..',
  'o.o#...........#o.o',
  '.oo#...........#oo.',
  '.o#.............#o.',
  '.o#.............#o.',
  'oo#.............#oo',
  '.o#.............#o.',
  '.o##...........##o.',
  '..o#...........#o..',
  '.oo##.........##oo.',
  '...o##.......##o...',
  '....o###...###o....',
  '.....oo#####oo.....',
  '.......ooooo.......',
];
const 丙: 魔杖款 = {
  名: '丙 权杖版',
  全长: 44,
  握: 15,
  芯: 35.5,
  光晕: 19,
  盒们: [
    柱(1, 0, 2, '金'),
    柱(3, 2, 4, '黑亮'),
    柱(2, 4, 26, '黑'),
    柱(3, 10, 11, '金'),
    柱(3, 19, 20, '金'),
    // 领：金、黑亮、金三级
    柱(4, 25, 26, '金'),
    柱(6, 26, 27, '黑亮'),
    柱(4, 27, 28, '金'),
    // 新月：2 像素厚的板，底在 y = 28；两块十字交叉（第二块绕杖轴转 90 度），从哪边看都是一弯月，不会只剩一条边
    ...板(月, 28, -1, 1, { '#': '黑', o: '黑亮', g: '金' }),
    ...板(月, 28, -1, 1, { '#': '黑', o: '黑亮', g: '金' }).map((b): 盒 => ({ ...b, 转: [{ 心: [0, 0, 0], 轴: [0, 1, 0], 度: 90 }] })),
    // 芯：5×5×5，绕 Z 转 45 度成菱形，悬在月怀正中
    盒(-2.5, 33, -2.5, 2.5, 38, 2.5, '芯', { 心: [0, 35.5, 0], 轴: [0, 0, 1], 度: 45 }),
  ],
};

export const 魔杖款们 = { 甲, 乙, 丙 } as const;
export type 魔杖款名 = keyof typeof 魔杖款们;

const 像素 = 1 / 16;
/** 杖头的芯、杖头最顶上那一点、杖尾、握点（杖空间，单位格） */
export const 杖点 = (款: 魔杖款名) => {
  const k = 魔杖款们[款];
  return { 芯: [0, k.芯 * 像素, 0], 尖: [0, k.全长 * 像素, 0], 尾: [0, 0, 0], 握: [0, k.握 * 像素, 0] } as const satisfies Record<string, 三>;
};

// ── 网格 ──
const 料贴图 = (图: Png, 号: number) => {
  const px = new Uint8Array(16 * 16 * 4);
  const [x0, y0] = [(号 % 4) * 16, Math.floor(号 / 4) * 16];
  for (let r = 0; r < 16; r++) px.set(图.px.subarray(((y0 + r) * 图.w + x0) * 4, ((y0 + r) * 图.w + x0 + 16) * 4), r * 64);
  const t = new THREE.DataTexture(px, 16, 16, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
};

const 建 = (款: 魔杖款, 图: Png): THREE.Mesh[] => {
  const 按料 = new Map<料名, { pos: number[]; nor: number[]; uv: number[]; idx: number[] }>();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (const 盒 of 款.盒们) {
    let buf = 按料.get(盒.料);
    if (!buf) 按料.set(盒.料, (buf = { pos: [], nor: [], uv: [], idx: [] }));
    const 低 = 盒.a.map((c, i) => Math.min(c, 盒.b[i]!));
    const 高 = 盒.a.map((c, i) => Math.max(c, 盒.b[i]!));
    m.identity();
    for (const { 心, 轴, 度 } of 盒.转 ?? [])
      m.premultiply(
        new THREE.Matrix4()
          .makeTranslation(心[0], 心[1], 心[2])
          .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(...轴).normalize(), (度 * Math.PI) / 180))
          .multiply(new THREE.Matrix4().makeTranslation(-心[0], -心[1], -心[2])),
      );
    const 居中 = (料表[盒.料] as { 居中?: true }).居中;
    for (let k = 0; k < 3; k++) {
      // (i, j, k) 是右手的轮换：从 +k 看，i 朝右、j 朝上
      const [i, j] = [(k + 1) % 3, (k + 2) % 3];
      for (const s of [1, -1]) {
        const 底 = buf.pos.length / 3;
        const 角 = [[低[i]!, 低[j]!], [高[i]!, 低[j]!], [高[i]!, 高[j]!], [低[i]!, 高[j]!]];
        for (const [ci, cj] of s > 0 ? 角 : [...角].reverse()) {
          const p = [0, 0, 0];
          p[i] = ci!;
          p[j] = cj!;
          p[k] = s > 0 ? 高[k]! : 低[k]!;
          v.set(p[0]!, p[1]!, p[2]!).applyMatrix4(m).multiplyScalar(像素);
          buf.pos.push(v.x, v.y, v.z);
          const n = [0, 0, 0];
          n[k] = s;
          v.set(n[0]!, n[1]!, n[2]!).transformDirection(m);
          buf.nor.push(v.x, v.y, v.z);
          // 一个模型像素一个贴图像素。居中：面的正中对着料的正中（边长是奇数时挪半个像素，对齐到像素格）
          if (居中) {
            const 偏 = (低: number, 高: number) => (低 + 高) / 2 - 8 - (Math.round(高 - 低) % 2 ? 0.5 : 0);
            buf.uv.push((ci! - 偏(低[i]!, 高[i]!)) / 16, (cj! - 偏(低[j]!, 高[j]!)) / 16);
          } else buf.uv.push(ci! / 16, cj! / 16);
        }
        buf.idx.push(底, 底 + 1, 底 + 2, 底, 底 + 2, 底 + 3);
      }
    }
  }
  return [...按料.entries()].map(([料, buf]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    g.setIndex(buf.idx);
    const map = 料贴图(图, 料表[料].号);
    // 受光的料和 engine 的方块模型一个材质（自发光打底 0.4，背光面不黑成一团）；亮的料不受光、不过色调映射，暗背景上也是贴图的原色
    const 材 = (料表[料] as { 亮?: true }).亮
      ? new THREE.MeshBasicMaterial({ map, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map, roughness: 0.95, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.4 });
    return new THREE.Mesh(g, 材);
  });
};

let 光晕图: THREE.Texture | undefined;
const 取光晕图 = () => {
  if (光晕图) return 光晕图;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return (光晕图 = new THREE.CanvasTexture(c));
};

/** 杖空间里的一根（杖尾在原点、杖头朝 +Y）。光晕：芯外面一团朝着镜头的加色光（默认有），强 = 它的不透明度 */
export const 重做魔杖: FC<{ 款: 魔杖款名; 光晕?: boolean; 光晕强?: number }> = ({ 款, 光晕 = true, 光晕强 = 0.55 }) => {
  const k = 魔杖款们[款];
  const 网格们 = useMemo(() => 建(k, png(图集)), [k]);
  return (
    <group>
      {网格们.map((网格, i) => (
        <primitive key={i} object={网格} />
      ))}
      {光晕 && (
        <sprite position={[0, k.芯 * 像素, 0]} scale={[k.光晕 * 像素, k.光晕 * 像素, 1]}>
          <spriteMaterial map={取光晕图()} color="#ff9a3a" opacity={光晕强} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </sprite>
      )}
    </group>
  );
};
export const 魔杖甲: FC = () => <重做魔杖 款="甲" />;
export const 魔杖乙: FC = () => <重做魔杖 款="乙" />;
export const 魔杖丙: FC = () => <重做魔杖 款="丙" />;

// ── 拿在手上 ──
// 原版拿在 YSM 模型手上（物品/下界魔杖.tsx 的 手持下界魔杖）：定位骨 → 放大 16 → 平移 (0, −1/16, −0.1) → 绕 X 转 −90 度 → 第三人称显示变换（平移 [0, −7, 1] 像素）。
// 套完显示变换，原版的杖轴在 x = −0.5/16、z = 1.5/16，握点在 y = 0。重做的杖把自己的握点放到同一处、杖轴和原版重合，手的姿势（斜举）不用跟着改
const 原握点 = [-0.5 / 16, 0, 1.5 / 16] as const;
/** 杖空间 → 手部定位骨的骨骼坐标 */
export const 手持重做杖矩阵 = (款: 魔杖款名): THREE.Matrix4 =>
  new THREE.Matrix4()
    .makeScale(16, 16, 16)
    .multiply(new THREE.Matrix4().makeTranslation(0, -1 / 16, -0.1))
    .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
    .multiply(new THREE.Matrix4().makeTranslation(原握点[0], 原握点[1] - 魔杖款们[款].握 * 像素, 原握点[2]));

/** 挂到 RightHandLocator 上。children 跟着杖走，杖空间（芯在 杖点(款).芯） */
export const 手持重做魔杖: FC<{ 款: 魔杖款名; 光晕?: boolean; 光晕强?: number; children?: ReactNode }> = ({ children, ...其余 }) => {
  const 矩阵 = useMemo(() => 手持重做杖矩阵(其余.款), [其余.款]);
  return (
    <group matrix={矩阵} matrixAutoUpdate={false}>
      <重做魔杖 {...其余} />
      {children}
    </group>
  );
};

/** 交给 <娘化亚波伦 杖={…}>、持杖位姿({ 杖: … })：她右手拿这一款 */
export const 重做杖款 = (款: 魔杖款名) => {
  const 点 = 杖点(款);
  return { 挂: <手持重做魔杖 款={款} />, 矩阵: 手持重做杖矩阵(款), 尖: 点.尖, 芯: 点.芯, 尾: 点.尾 };
};
