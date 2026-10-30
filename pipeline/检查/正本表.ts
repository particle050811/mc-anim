// 共用函数的正本表：每个正本在哪、怎么认出它的副本（anim check「副本」规则、副本识别.ts）。加正本就在这里加一项，配上探针或记号。
// 行为认法的探针结果由正本自己算（检查时执行正本模块），所以这里不另写一份实现；适配 是副本常见的另一种参数排法，换算成正本再比。
// 探针要挑能把同参数数的正本区分开的值；缓动一类只在 0～1 里比（夹不夹 t 的写法都算副本）。
import { 遍历, ts } from './语法.ts';
import { 是函数节点 } from './副本识别.ts';

type 函数 = (...a: never[]) => unknown;
export type 行为认法 = {
  /** 每组是一次调用的参数 */
  探针: readonly (readonly unknown[])[];
  /** 不给就是正本模块里同名导出本身；给了就是由正本拼出的另一种参数排法 */
  适配?: (正本: 函数) => 函数;
};
export type 正本项 = {
  id: string;
  /** 正本所在文件（相对仓库根）和导出名 */
  位置: string;
  导出: string;
  /** 在这些名字上声明、又没法按行为比（没有探针、有循环、用到 import 进来的东西、参数个数和探针对不上）的函数算副本；能比却不一样的是同名的别的函数，不算 */
  名字?: readonly string[];
  行为?: readonly 行为认法[];
  /** 认得出的写法：返回 true 的节点各算一处（同一个正本的记号套在另一处里面的只算外面那处） */
  记号?: (n: ts.Node, sf: ts.SourceFile) => boolean;
};

const 数学 = 'engine/core/数学.ts';
const 坐标 = 'engine/core/坐标.ts';
const 机位 = 'engine/core/机位.ts';

const 零到一 = [[0], [0.1], [0.25], [0.5], [0.62], [0.9], [1]] as const;
const 夹外 = [[-0.5], [0], [0.3], [0.5], [0.8], [1], [1.7]] as const;
const 三数 = [[0, 10, 0.25], [2, -4, 0.5], [1, 1, 0.3], [-3, 5, 1.5], [5, 7, -0.5], [0.2, 0.9, 0.7]] as const;
/** 固定序列的随机数发生器替身（randInt、pick 的探针） */
const 假随机 = (...序: number[]) => {
  let i = 0;
  return () => 序[i++ % 序.length]!;
};

/** 去掉括号 */
const 剥 = (n: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(n) ? 剥(n.expression) : n);
const 是数 = (n: ts.Node, v: number) => ts.isNumericLiteral(n) && Number(n.text) === v;
const 无空白 = (n: ts.Node, sf: ts.SourceFile) => n.getText(sf).replace(/\s+/g, '');
const 是调用 = (n: ts.Node, sf: ts.SourceFile, 名: string): n is ts.CallExpression => ts.isCallExpression(n) && n.expression.getText(sf) === 名;

/** 类型字面量里有这几个属性 */
const 有成员 = (n: ts.Node, 们: readonly string[]) => {
  if (!ts.isTypeLiteralNode(n) && !ts.isInterfaceDeclaration(n)) return false;
  const 名 = new Set(n.members.map((m) => (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? m.name.text : '')));
  return 们.every((x) => 名.has(x));
};

/** 三个参数 (a, b, k)、函数体里两头都取了这两个键（a.pos、b.pos、a.tgt、b.tgt）的函数：两个机位插值（lerpCam 一类） */
const 插两头 = (n: ts.Node, 键们: readonly string[]) => {
  if (!是函数节点(n) || n.parameters.length !== 3 || !n.body) return false;
  const [a, b] = n.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : ''));
  if (!a || !b) return false;
  const 用 = new Set<string>();
  遍历(n.body, (x) => ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression) && 用.add(`${x.expression.text}.${x.name.text}`));
  return 键们.every((k) => 用.has(`${a}.${k}`) && 用.has(`${b}.${k}`));
};

export const 正本表: readonly 正本项[] = [
  // ---------- engine/core/数学.ts ----------
  { id: 'lerp', 位置: 数学, 导出: 'lerp', 名字: ['lerp'], 行为: [{ 探针: 三数 }] },
  {
    id: 'lerpV',
    位置: 数学,
    导出: 'lerpV',
    名字: ['lerpV', 'lerp3', '插3'],
    行为: [{ 探针: [[[0, 1, 2], [10, -1, 4], 0.25], [[1, 2, 3], [3, 2, 1], 0.5], [[-2, 0.5, 9], [4, 4, -1], 1.25]] }],
  },
  { id: 'invLerp', 位置: 数学, 导出: 'invLerp', 名字: ['invLerp'], 行为: [{ 探针: [[0, 10, 2.5], [2, -4, 0.5], [-3, 5, 9], [5, 7, 4]] }] },
  { id: 'clamp', 位置: 数学, 导出: 'clamp', 名字: ['clamp'], 行为: [{ 探针: [[5, 0, 1], [-2, 0, 1], [0.3, 0, 1], [7, 2, 4], [3, 2, 4], [1, 2, 4]] }] },
  { id: 'clamp01', 位置: 数学, 导出: 'clamp01', 名字: ['clamp01', 'saturate'], 行为: [{ 探针: [[-1], [0], [0.25], [1], [2.5]] }] },
  { id: 'linearstep', 位置: 数学, 导出: 'linearstep', 名字: ['linearstep', 'linearStep'], 行为: [{ 探针: [[0, 1, -0.5], [0, 1, 0.3], [0, 1, 1.4], [2, 6, 3], [6, 2, 3]] }] },
  { id: 'smoothstep', 位置: 数学, 导出: 'smoothstep', 名字: ['smoothstep'], 行为: [{ 探针: [[0, 1, -0.5], [0, 1, 0.3], [0, 1, 0.5], [0, 1, 1.4], [2, 6, 3], [6, 2, 3]] }] },
  { id: 'smoothstep01', 位置: 数学, 导出: 'smoothstep01', 名字: ['ss', 'smooth01', 'smoothstep01'], 行为: [{ 探针: 零到一 }] },
  { id: 'smootherstep', 位置: 数学, 导出: 'smootherstep', 名字: ['smootherstep'], 行为: [{ 探针: [[0, 1, -0.5], [0, 1, 0.3], [0, 1, 0.5], [0, 1, 1.4], [2, 6, 3]] }] },
  { id: 'smootherstep01', 位置: 数学, 导出: 'smootherstep01', 名字: ['smootherstep01'], 行为: [{ 探针: 零到一 }] },
  { id: 'easeOutQuad', 位置: 数学, 导出: 'easeOutQuad', 名字: ['easeOutQuad'], 行为: [{ 探针: 零到一 }] },
  { id: 'easeInOutQuad', 位置: 数学, 导出: 'easeInOutQuad', 名字: ['easeInOutQuad'], 行为: [{ 探针: 零到一 }] },
  { id: 'easeOutCubic', 位置: 数学, 导出: 'easeOutCubic', 名字: ['easeOutCubic'], 行为: [{ 探针: 零到一 }] },
  { id: 'easeInOutCubic', 位置: 数学, 导出: 'easeInOutCubic', 名字: ['easeInOutCubic'], 行为: [{ 探针: 零到一 }] },
  { id: 'easeInSine', 位置: 数学, 导出: 'easeInSine', 名字: ['easeInSine'], 行为: [{ 探针: 零到一 }] },
  { id: 'easeOutSine', 位置: 数学, 导出: 'easeOutSine', 名字: ['easeOutSine'], 行为: [{ 探针: 零到一 }] },
  { id: 'easeInOutSine', 位置: 数学, 导出: 'easeInOutSine', 名字: ['easeInOutSine'], 行为: [{ 探针: 零到一 }] },
  // 只有平方、立方的 easeIn 不按行为认（`x * x` 太常见，多半不是缓动），只认名字
  { id: 'easeInQuad', 位置: 数学, 导出: 'easeInQuad', 名字: ['easeInQuad'] },
  { id: 'easeInCubic', 位置: 数学, 导出: 'easeInCubic', 名字: ['easeInCubic'] },
  {
    id: 'hermite',
    位置: 数学,
    导出: 'hermite',
    名字: ['hermite', '埃尔米特'],
    行为: [
      { 探针: [[0, 1, 2, 0, 0.3], [1, -2, 4, 3, 0.75], [5, 0, -1, 0, 0.5]] },
      // 把回忆：(p0, p1, m0, m1, 段长 h, s)，切线按每帧给
      { 探针: [[0, 2, 1, 0, 3, 0.3], [1, 4, -2, 3, 1.5, 0.75]], 适配: (h) => ((p0: number, p1: number, m0: number, m1: number, 长: number, s: number) => (h as (...a: number[]) => number)(p0, m0 * 长, p1, m1 * 长, s)) as 函数 },
      // 6-1-9b：向量版
      {
        探针: [[[0, 1, 2], [1, 0, -1], [2, 2, 2], [0, 1, 0], 0.4]],
        适配: (h) => ((p0: number[], m0: number[], p1: number[], m1: number[], u: number) => p0.map((_, i) => (h as (...a: number[]) => number)(p0[i]!, m0[i]!, p1[i]!, m1[i]!, u))) as 函数,
      },
    ],
  },
  { id: 'rad', 位置: 数学, 导出: 'rad', 名字: ['rad', 'deg2rad', 'toRad'], 行为: [{ 探针: [[0], [90], [-45], [180], [33.3]] }] },
  { id: 'deg', 位置: 数学, 导出: 'deg', 名字: ['deg', 'rad2deg', 'toDeg'], 行为: [{ 探针: [[0], [Math.PI], [-1], [0.25], [2.5]] }] },
  { id: 'mod', 位置: 数学, 导出: 'mod', 名字: ['mod'], 行为: [{ 探针: [[-1, 4], [5, 4], [-9, 4], [3.5, 2], [0, 3]] }] },
  {
    id: 'mulberry32',
    位置: 数学,
    导出: 'mulberry32',
    名字: ['mulberry32', 'mulberry'],
    记号: (n) => ts.isNumericLiteral(n) && Number(n.text) === 0x6d2b79f5,
  },
  {
    id: 'randInt',
    位置: 数学,
    导出: 'randInt',
    名字: ['randInt'],
    行为: [{ 探针: [[假随机(0.37), 2, 9], [假随机(0.999), -3, 3], [假随机(0), 0, 5], [假随机(0.5), 10, 10]] }],
  },
  { id: 'pick', 位置: 数学, 导出: 'pick', 名字: ['pick'], 行为: [{ 探针: [[假随机(0.37), ['a', 'b', 'c', 'd']], [假随机(0.99), [1, 2, 3]], [假随机(0), [9, 8]]] }] },

  // ---------- engine/core/坐标.ts ----------
  { id: '场景到three', 位置: 坐标, 导出: '场景到three', 名字: ['toThree', '场景到three'], 行为: [{ 探针: [[[1, 2, 3]], [[-4.5, 0.25, 7]]] }] },
  { id: 'three到场景', 位置: 坐标, 导出: 'three到场景', 名字: ['fromThree', 'three到场景'], 行为: [{ 探针: [[{ x: 1, y: 2, z: 3 }], [{ x: -4.5, y: 0.25, z: 7 }]] }] },
  // 不带原点的 游戏 → 场景 也就是 three 数组 → 场景
  { id: '游戏到场景', 位置: 坐标, 导出: '游戏到场景', 名字: ['fromGame', 'gameToScene', '游戏到场景'], 行为: [{ 探针: [[[1, 2, 3]], [[-4.5, 0.25, 7]]] }] },
  // 不带原点的 场景 → 游戏 也就是 场景 → three 的数组形式（库/界面/投影.ts 的 Z朝上转three）
  { id: '场景到游戏', 位置: 坐标, 导出: '场景到游戏', 名字: ['toGame', 'sceneToGame', '场景到游戏'], 行为: [{ 探针: [[[1, 2, 3]], [[-4.5, 0.25, 7]]] }] },

  // ---------- engine/core/机位.ts ----------
  { id: 'Cam', 位置: 机位, 导出: 'Cam', 记号: (n) => 有成员(n, ['pos', 'tgt', 'lens']) },
  {
    id: '焦距到视角',
    位置: 机位,
    导出: '焦距到视角',
    名字: ['fovOf', 'lensToFov', '焦距到视角'],
    // Math.atan(18 / 焦距 …)：36 mm 画幅换视角
    记号: (n, sf) => {
      if (!是调用(n, sf, 'Math.atan') || n.arguments.length !== 1) return false;
      let a = 剥(n.arguments[0]!);
      while (ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.SlashToken) a = 剥(a.left);
      return 是数(a, 18) && a !== 剥(n.arguments[0]!);
    },
  },
  {
    id: '插机位',
    位置: 机位,
    导出: '插机位',
    名字: ['lerpCam', 'camLerp', 'mixCam', '插机位'],
    记号: (n) => 插两头(n, ['pos', 'tgt']) || 插两头(n, ['眼', '看']),
  },

  // ---------- 库/角色/骨骼表.ts ----------
  { id: '插骨', 位置: '库/角色/骨骼表.ts', 导出: '插骨', 名字: ['插骨', 'mixBones', 'lerpBones', 'blendBones'] },
  {
    id: '合并骨骼表',
    位置: '库/角色/骨骼表.ts',
    导出: '合并骨骼表',
    名字: ['合并骨骼表'],
    // 结果[k] = { ...结果[k], ...v }：逐骨骼按字段盖
    记号: (n, sf) => {
      if (!ts.isBinaryExpression(n) || n.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isElementAccessExpression(n.left)) return false;
      const r = 剥(n.right);
      if (!ts.isObjectLiteralExpression(r) || r.properties.length !== 2 || !r.properties.every(ts.isSpreadAssignment)) return false;
      return 无空白(r.properties[0]!.expression, sf) === 无空白(n.left, sf);
    },
  },

  // ---------- 库/角色/史蒂夫挥手.ts ----------
  {
    id: '原版挥手',
    位置: '库/角色/史蒂夫挥手.ts',
    导出: '挥手量',
    名字: ['加挥手', '挥手部件', '叠挥手', '挥手量'],
    // sin(√t·2π)·0.2：HumanoidModel.setupAttackAnimation 的 body.yRot
    记号: (n, sf) => {
      if (!是调用(n, sf, 'Math.sin') || n.arguments.length !== 1) return false;
      const t = 无空白(剥(n.arguments[0]!), sf);
      return /^Math\.sqrt\([^]*\)\*Math\.PI\*2$|^Math\.sqrt\([^]*\)\*2\*Math\.PI$|^2\*Math\.PI\*Math\.sqrt\(/.test(t);
    },
  },

  // ---------- 库/原版物理.ts ----------
  {
    id: '原版下落',
    位置: '库/原版物理.ts',
    导出: '下落一刻',
    名字: ['原版下落', '下落一刻', '下落表', '落地刻', '下落高度'],
    // (v − 0.08) × 0.98：LivingEntity.travel 的竖直速度
    记号: (n) => {
      if (!ts.isBinaryExpression(n) || n.operatorToken.kind !== ts.SyntaxKind.AsteriskToken || !是数(n.right, 0.98)) return false;
      const l = 剥(n.left);
      return ts.isBinaryExpression(l) && l.operatorToken.kind === ts.SyntaxKind.MinusToken && 是数(l.right, 0.08);
    },
  },
];

/** 正本所在的文件（这些文件里的定义就是正本本身，不算副本） */
export const 正本文件 = new Set(正本表.map((z) => z.位置));

/** 测试用：一个节点下所有被某个记号认出的节点 */
export const 记号处 = (sf: ts.SourceFile, z: 正本项): ts.Node[] => {
  const 处: ts.Node[] = [];
  if (z.记号) 遍历(sf, (n) => z.记号!(n, sf) && 处.push(n));
  return 处;
};
