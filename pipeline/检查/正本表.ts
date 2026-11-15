// 共用函数的正本表：每个正本在哪、怎么认出它的副本（anim check「副本」规则、副本识别.ts）。加正本就在这里加一项，配上探针或记号。
// 行为认法的探针结果由正本自己算（检查时执行正本模块），所以这里不另写一份实现；适配 是副本常见的另一种参数排法，换算成正本再比。
// 探针要挑能把同参数数的正本区分开的值；缓动一类只在 0～1 里比（夹不夹 t 的写法都算副本）。
import { walk, ts } from './语法.ts';
import { isFnNode } from './副本识别.ts';

type AnyFunction = (...a: never[]) => unknown;
export type BehaviorCheck = {
  /** 每组是一次调用的参数 */
  probes: readonly (readonly unknown[])[];
  /** 不给就是正本模块里同名导出本身；给了就是由正本拼出的另一种参数排法 */
  adapt?: (canonical: AnyFunction) => AnyFunction;
};
export type CanonicalItem = {
  id: string;
  /** 正本所在文件（相对仓库根）和导出名 */
  位置: string;
  exportName: string;
  /** 在这些名字上声明、又没法按行为比（没有探针、有循环、用到 import 进来的东西、参数个数和探针对不上）的函数算副本；能比却不一样的是同名的别的函数，不算 */
  names?: readonly string[];
  behaviors?: readonly BehaviorCheck[];
  /** 认得出的写法：返回 true 的节点各算一处（同一个正本的记号套在另一处里面的只算外面那处） */
  token?: (n: ts.Node, sf: ts.SourceFile) => boolean;
};

const mathFile = 'engine/core/数学.ts';
const coordModule = 'engine/core/坐标.ts';
const threeConvertPath = 'engine/core/three换算.ts';
const cameraRigFile = 'engine/core/机位.ts';

const zeroToOne = [[0], [0.1], [0.25], [0.5], [0.62], [0.9], [1]] as const;
const triples = [[0, 10, 0.25], [2, -4, 0.5], [1, 1, 0.3], [-3, 5, 1.5], [5, 7, -0.5], [0.2, 0.9, 0.7]] as const;
/** 固定序列的随机数发生器替身（randInt、pick 的探针） */
const fakeRandom = (...seeds: number[]) => {
  let i = 0;
  return () => seeds[i++ % seeds.length]!;
};

/** 去掉括号 */
const unwrapParens = (n: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(n) ? unwrapParens(n.expression) : n);
const isNumberLiteral = (n: ts.Node, v: number) => ts.isNumericLiteral(n) && Number(n.text) === v;
const stripWhitespace = (n: ts.Node, sf: ts.SourceFile) => n.getText(sf).replace(/\s+/g, '');
const isCallTo = (n: ts.Node, sf: ts.SourceFile, calleeName: string): n is ts.CallExpression => ts.isCallExpression(n) && n.expression.getText(sf) === calleeName;

/** 类型字面量里有这几个属性 */
const hasMembers = (n: ts.Node, members: readonly string[]) => {
  if (!ts.isTypeLiteralNode(n) && !ts.isInterfaceDeclaration(n)) return false;
  const memberNames = new Set(n.members.map((m) => (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? m.name.text : '')));
  return members.every((x) => memberNames.has(x));
};

/** 三个参数 (a, b, k)、函数体里两头都取了这两个键（a.pos、b.pos、a.tgt、b.tgt）的函数：两个机位插值（lerpCam 一类） */
const hasBothKeys = (n: ts.Node, keys: readonly string[]) => {
  if (!isFnNode(n) || n.parameters.length !== 3 || !n.body) return false;
  const [a, b] = n.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : ''));
  if (!a || !b) return false;
  const usedNames = new Set<string>();
  walk(n.body, (x) => ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression) && usedNames.add(`${x.expression.text}.${x.name.text}`));
  return keys.every((k) => usedNames.has(`${a}.${k}`) && usedNames.has(`${b}.${k}`));
};

export const canonicalTable: readonly CanonicalItem[] = [
  // ---------- engine/core/数学.ts ----------
  { id: 'lerp', 位置: mathFile, exportName: 'lerp', names: ['lerp'], behaviors: [{ probes: triples }] },
  {
    id: 'lerpV',
    位置: mathFile,
    exportName: 'lerpV',
    names: ['lerpV', 'lerp3', 'lerpVec3'],
    behaviors: [{ probes: [[[0, 1, 2], [10, -1, 4], 0.25], [[1, 2, 3], [3, 2, 1], 0.5], [[-2, 0.5, 9], [4, 4, -1], 1.25]] }],
  },
  { id: 'invLerp', 位置: mathFile, exportName: 'invLerp', names: ['invLerp'], behaviors: [{ probes: [[0, 10, 2.5], [2, -4, 0.5], [-3, 5, 9], [5, 7, 4]] }] },
  { id: 'clamp', 位置: mathFile, exportName: 'clamp', names: ['clamp'], behaviors: [{ probes: [[5, 0, 1], [-2, 0, 1], [0.3, 0, 1], [7, 2, 4], [3, 2, 4], [1, 2, 4]] }] },
  { id: 'clamp01', 位置: mathFile, exportName: 'clamp01', names: ['clamp01', 'saturate'], behaviors: [{ probes: [[-1], [0], [0.25], [1], [2.5]] }] },
  { id: 'linearstep', 位置: mathFile, exportName: 'linearstep', names: ['linearstep', 'linearStep'], behaviors: [{ probes: [[0, 1, -0.5], [0, 1, 0.3], [0, 1, 1.4], [2, 6, 3], [6, 2, 3]] }] },
  { id: 'smoothstep', 位置: mathFile, exportName: 'smoothstep', names: ['smoothstep'], behaviors: [{ probes: [[0, 1, -0.5], [0, 1, 0.3], [0, 1, 0.5], [0, 1, 1.4], [2, 6, 3], [6, 2, 3]] }] },
  { id: 'smoothstep01', 位置: mathFile, exportName: 'smoothstep01', names: ['ss', 'smooth01', 'smoothstep01'], behaviors: [{ probes: zeroToOne }] },
  { id: 'smootherstep', 位置: mathFile, exportName: 'smootherstep', names: ['smootherstep'], behaviors: [{ probes: [[0, 1, -0.5], [0, 1, 0.3], [0, 1, 0.5], [0, 1, 1.4], [2, 6, 3]] }] },
  { id: 'smootherstep01', 位置: mathFile, exportName: 'smootherstep01', names: ['smootherstep01'], behaviors: [{ probes: zeroToOne }] },
  { id: 'easeOutQuad', 位置: mathFile, exportName: 'easeOutQuad', names: ['easeOutQuad'], behaviors: [{ probes: zeroToOne }] },
  { id: 'easeInOutQuad', 位置: mathFile, exportName: 'easeInOutQuad', names: ['easeInOutQuad'], behaviors: [{ probes: zeroToOne }] },
  { id: 'easeOutCubic', 位置: mathFile, exportName: 'easeOutCubic', names: ['easeOutCubic'], behaviors: [{ probes: zeroToOne }] },
  { id: 'easeInOutCubic', 位置: mathFile, exportName: 'easeInOutCubic', names: ['easeInOutCubic'], behaviors: [{ probes: zeroToOne }] },
  { id: 'easeInSine', 位置: mathFile, exportName: 'easeInSine', names: ['easeInSine'], behaviors: [{ probes: zeroToOne }] },
  { id: 'easeOutSine', 位置: mathFile, exportName: 'easeOutSine', names: ['easeOutSine'], behaviors: [{ probes: zeroToOne }] },
  { id: 'easeInOutSine', 位置: mathFile, exportName: 'easeInOutSine', names: ['easeInOutSine'], behaviors: [{ probes: zeroToOne }] },
  // 只有平方、立方的 easeIn 不按行为认（`x * x` 太常见，多半不是缓动），只认名字
  { id: 'easeInQuad', 位置: mathFile, exportName: 'easeInQuad', names: ['easeInQuad'] },
  { id: 'easeInCubic', 位置: mathFile, exportName: 'easeInCubic', names: ['easeInCubic'] },
  {
    id: 'hermite',
    位置: mathFile,
    exportName: 'hermite',
    names: ['hermite'],
    behaviors: [
      { probes: [[0, 1, 2, 0, 0.3], [1, -2, 4, 3, 0.75], [5, 0, -1, 0, 0.5]] },
      // 把回忆：(p0, p1, m0, m1, 段长 h, s)，切线按每帧给
      { probes: [[0, 2, 1, 0, 3, 0.3], [1, 4, -2, 3, 1.5, 0.75]], adapt: (h) => ((p0: number, p1: number, m0: number, m1: number, length: number, s: number) => (h as (...a: number[]) => number)(p0, m0 * length, p1, m1 * length, s)) as AnyFunction },
      // 6-1-9b：向量版
      {
        probes: [[[0, 1, 2], [1, 0, -1], [2, 2, 2], [0, 1, 0], 0.4]],
        adapt: (h) => ((p0: number[], m0: number[], p1: number[], m1: number[], u: number) => p0.map((_, i) => (h as (...a: number[]) => number)(p0[i]!, m0[i]!, p1[i]!, m1[i]!, u))) as AnyFunction,
      },
    ],
  },
  { id: 'rad', 位置: mathFile, exportName: 'rad', names: ['rad', 'deg2rad', 'toRad'], behaviors: [{ probes: [[0], [90], [-45], [180], [33.3]] }] },
  { id: 'deg', 位置: mathFile, exportName: 'deg', names: ['deg', 'rad2deg', 'toDeg'], behaviors: [{ probes: [[0], [Math.PI], [-1], [0.25], [2.5]] }] },
  { id: 'mod', 位置: mathFile, exportName: 'mod', names: ['mod'], behaviors: [{ probes: [[-1, 4], [5, 4], [-9, 4], [3.5, 2], [0, 3]] }] },
  {
    id: 'mulberry32',
    位置: mathFile,
    exportName: 'mulberry32',
    names: ['mulberry32', 'mulberry'],
    token: (n) => ts.isNumericLiteral(n) && Number(n.text) === 0x6d2b79f5,
  },
  {
    id: 'randInt',
    位置: mathFile,
    exportName: 'randInt',
    names: ['randInt'],
    behaviors: [{ probes: [[fakeRandom(0.37), 2, 9], [fakeRandom(0.999), -3, 3], [fakeRandom(0), 0, 5], [fakeRandom(0.5), 10, 10]] }],
  },
  { id: 'pick', 位置: mathFile, exportName: 'pick', names: ['pick'], behaviors: [{ probes: [[fakeRandom(0.37), ['a', 'b', 'c', 'd']], [fakeRandom(0.99), [1, 2, 3]], [fakeRandom(0), [9, 8]]] }] },

  // ---------- engine/core/坐标.ts、three换算.ts ----------
  { id: '场景到three', 位置: threeConvertPath, exportName: 'sceneToThree', names: ['toThree', 'sceneToThree'], behaviors: [{ probes: [[[1, 2, 3]], [[-4.5, 0.25, 7]]] }] },
  { id: 'three到场景', 位置: coordModule, exportName: 'threeToScene', names: ['fromThree', 'threeToScene'], behaviors: [{ probes: [[{ x: 1, y: 2, z: 3 }], [{ x: -4.5, y: 0.25, z: 7 }]] }] },
  // 不带原点的 游戏 → 场景 也就是 three 数组 → 场景
  { id: '游戏到场景', 位置: coordModule, exportName: 'gameToScene', names: ['fromGame', 'gameToScene'], behaviors: [{ probes: [[[1, 2, 3]], [[-4.5, 0.25, 7]]] }] },
  // 不带原点的 场景 → 游戏 也就是 场景 → three 的数组形式（库/界面/投影.ts 的 Z朝上转three）
  { id: '场景到游戏', 位置: coordModule, exportName: 'sceneToGame', names: ['toGame', 'sceneToGame'], behaviors: [{ probes: [[[1, 2, 3]], [[-4.5, 0.25, 7]]] }] },

  // ---------- engine/core/机位.ts ----------
  { id: 'Cam', 位置: cameraRigFile, exportName: 'Cam', token: (n) => hasMembers(n, ['pos', 'tgt', 'lens']) },
  {
    id: '焦距到视角',
    位置: cameraRigFile,
    exportName: 'lensToFov',
    names: ['fovOf', 'lensToFov'],
    // Math.atan(18 / 焦距 …)：36 mm 画幅换视角
    token: (n, sf) => {
      if (!isCallTo(n, sf, 'Math.atan') || n.arguments.length !== 1) return false;
      let a = unwrapParens(n.arguments[0]!);
      while (ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.SlashToken) a = unwrapParens(a.left);
      return isNumberLiteral(a, 18) && a !== unwrapParens(n.arguments[0]!);
    },
  },
  {
    id: '插机位',
    位置: cameraRigFile,
    exportName: 'lerpRig',
    names: ['lerpCam', 'camLerp', 'mixCam', 'lerpRig'],
    token: (n) => hasBothKeys(n, ['pos', 'tgt']) || hasBothKeys(n, ['眼', '看']),
  },

  // ---------- 库/角色/骨骼表.ts ----------
  { id: '插骨', 位置: '库/角色/骨骼表.ts', exportName: 'lerpBonePose', names: ['lerpBonePose', 'mixBones', 'lerpBones', 'blendBones'] },
  {
    id: '合并骨骼表',
    位置: '库/角色/骨骼表.ts',
    exportName: 'mergeSkeleton',
    names: ['mergeSkeleton'],
    // 结果[k] = { ...结果[k], ...v }：逐骨骼按字段盖
    token: (n, sf) => {
      if (!ts.isBinaryExpression(n) || n.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isElementAccessExpression(n.left)) return false;
      const r = unwrapParens(n.right);
      if (!ts.isObjectLiteralExpression(r) || r.properties.length !== 2 || !r.properties.every(ts.isSpreadAssignment)) return false;
      return stripWhitespace(r.properties[0]!.expression, sf) === stripWhitespace(n.left, sf);
    },
  },

  // ---------- 库/角色/史蒂夫挥手.ts ----------
  {
    id: '原版挥手',
    位置: '库/角色/史蒂夫挥手.ts',
    exportName: 'waveAmount',
    names: ['addWave', 'waveParts', 'waveAmount'],
    // sin(√t·2π)·0.2：HumanoidModel.setupAttackAnimation 的 body.yRot
    token: (n, sf) => {
      if (!isCallTo(n, sf, 'Math.sin') || n.arguments.length !== 1) return false;
      const t = stripWhitespace(unwrapParens(n.arguments[0]!), sf);
      return /^Math\.sqrt\([^]*\)\*Math\.PI\*2$|^Math\.sqrt\([^]*\)\*2\*Math\.PI$|^2\*Math\.PI\*Math\.sqrt\(/.test(t);
    },
  },

  // ---------- 库/原版物理.ts ----------
  {
    id: '原版下落',
    位置: '库/原版物理.ts',
    exportName: 'fallOneTick',
    names: ['vanillaFall', 'fallOneTick', 'fallTable', 'landTick', 'fallHeightAtTick'],
    // (v − 0.08) × 0.98：LivingEntity.travel 的竖直速度
    token: (n) => {
      if (!ts.isBinaryExpression(n) || n.operatorToken.kind !== ts.SyntaxKind.AsteriskToken || !isNumberLiteral(n.right, 0.98)) return false;
      const l = unwrapParens(n.left);
      return ts.isBinaryExpression(l) && l.operatorToken.kind === ts.SyntaxKind.MinusToken && isNumberLiteral(l.right, 0.08);
    },
  },
];

/** 正本所在的文件（这些文件里的定义就是正本本身，不算副本） */
export const canonicalFiles = new Set(canonicalTable.map((z) => z.位置));
