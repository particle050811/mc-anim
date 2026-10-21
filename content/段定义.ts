// 段.ts 的形状：纯数据（pipeline 直接 import，闭包里不许有 react、three、remotion），画面.tsx 负责画。
// 宽高是 Composition 的页面尺寸，成片 2K 靠渲染时 scale 2（旧项目 渲染级别.ts：改宽高会让体素世界换细一级，所以不改宽高）。

/** 声音 cue：段内第几帧起放什么。台词写台词 id（story/台词.toml），音效、配乐写资产 id。完整的 cue 形状（增益、档、淡出）M5 定 */
export type 声音cue = { 帧: number; 台词?: string; 资产?: string };

/** 透明叠层：本段目录下 <入口>（叠层*.tsx）默认导出的透明底组件，登记成 Composition `<段键>-<名>`，帧数、尺寸同本段，
 *  第 f 帧叠在本段第 f 帧上。只进成片（sr film 叠），不进单段母版：游戏 UI 的字和数字只给完整成片（旧项目 透明层.py） */
export type 叠层定义 = { 名: string; 入口: string };

export type 段定义 = {
  /** 所属场键（核对段写 核对；跨场的段写开头那场） */
  场: string;
  帧数: number;
  fps: number;
  宽: number;
  高: number;
  /** 用到的地形区段包名（assets/地形版本.json 里登记的），版本进指纹 */
  地形: readonly string[];
  /** 时钟是场窗口时：本段在场时间线上的 [起帧, 止帧)，止帧 − 起帧 = 帧数 */
  场窗口?: { 起帧: number; 止帧: number };
  /** 和清单里同一场的上一段是同一个不切的镜头拆开的：本段起帧正好接上一段末帧的下一帧（sr check 查） */
  连续?: boolean;
  声音?: readonly 声音cue[];
  叠层?: readonly 叠层定义[];
};

export const 定义段 = (d: 段定义): 段定义 => {
  if (!Number.isInteger(d.帧数) || d.帧数 <= 0) throw new Error(`段的帧数要是正整数：${d.帧数}`);
  if (d.场窗口 && d.场窗口.止帧 - d.场窗口.起帧 !== d.帧数) {
    throw new Error(`场窗口 [${d.场窗口.起帧}, ${d.场窗口.止帧}) 有 ${d.场窗口.止帧 - d.场窗口.起帧} 帧，段的帧数是 ${d.帧数}`);
  }
  if (d.连续 && !d.场窗口) throw new Error('标了 连续 的段要写 场窗口，才查得了和上一段接没接上');
  for (const c of d.声音 ?? []) {
    if (!Number.isInteger(c.帧) || c.帧 < 0 || c.帧 >= d.帧数) throw new Error(`声音 cue 的帧 ${c.帧} 不在段内 [0, ${d.帧数})`);
    if ((c.台词 === undefined) === (c.资产 === undefined)) throw new Error(`声音 cue（第 ${c.帧} 帧）要写 台词 或 资产，二选一`);
  }
  const 层名 = new Set<string>();
  for (const l of d.叠层 ?? []) {
    if (!/^叠层[^/]*\.tsx$/.test(l.入口)) throw new Error(`叠层 ${l.名} 的入口 ${l.入口} 要是本段目录下的 叠层*.tsx（content/注册.tsx 只收这个名字）`);
    // Remotion 的 Composition id 只认字母、数字、汉字和 -
    if (!/^[A-Za-z0-9\u4e00-\u9fff-]+$/.test(l.名) || 层名.has(l.名)) throw new Error(`叠层名「${l.名}」重复，或不能当 Composition id（只能字母、数字、汉字和 -）`);
    层名.add(l.名);
  }
  return d;
};
