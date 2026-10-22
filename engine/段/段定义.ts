// 段.ts 的形状：纯数据（pipeline 直接 import，闭包里不许有 react、three、remotion），画面.tsx 负责画。
// 宽高是 Composition 的页面尺寸，成片 2K 靠渲染时 scale 2（旧项目 渲染级别.ts：改宽高会让体素世界换细一级，所以不改宽高）。

/** 台词 cue：开口落在段内第 帧 帧（可带小数；文件头 = 帧 − 作品的 台词.toml 里的 开口秒 × fps，在段开头之前的从文件里跳过）。
 *  接上段：这句前面已经开口（本段前面那条，或清单里上一段），从本段第 帧 帧（整帧）接着放，前一截放到这一帧为止；不算一次「用到」。
 *  帧数：放几帧（截断）；不写按配音放完再多 1 帧（旧 台词轨.tsx），都截到段尾 */
export type 台词cue = { 帧: number; 台词: string; 接上段?: true; 帧数?: number; 资产?: undefined };
/** 音效、配乐 cue（资产 id 以 配乐/ 开头的算配乐）：照母版里实际的放法（旧项目 exportSfx 收的 SfxClipLog，engine/audio/音效清单.ts）。
 *  帧：段内第几帧起放（整帧）；帧数：放几帧（截断，含段尾）；入点秒：从文件第几秒放起（起始偏移）；速率：变速变调；循环：放完绕回文件头；
 *  增益：每帧乘到文件上的音量（含音效总线、距离衰减），一个数是整声都一样，数组是逐帧（长度 = 帧数）；淡出：最后几帧线性淡到 0，只和一个数的 增益 配；
 *  名、档：剪映片段名和名前标的档（engine/audio/混音.ts 的分档：重 −10、中 −20、脚步 −30，直接给响度的写数，细节）。增益是 6 位小数 */
export type 资产cue = {
  帧: number;
  资产: string;
  名: string;
  帧数: number;
  档?: string;
  入点秒?: number;
  速率?: number;
  循环?: true;
  增益?: number | readonly number[];
  淡出?: number;
  台词?: undefined;
};
export type 声音cue = 台词cue | 资产cue;

/** 资产 cue 第 f 帧的增益（f 从 cue 的 帧 数起） */
export const cue增益 = (c: 资产cue, f: number) => {
  if (Array.isArray(c.增益)) return (c.增益 as readonly number[])[f]!;
  const g = (c.增益 as number | undefined) ?? 1;
  return c.淡出 ? Math.round(g * Math.min(1, (c.帧数 - f) / c.淡出) * 1e6) / 1e6 : g;
};

/** 透明叠层：本段目录下 <入口>（叠层*.tsx）默认导出的透明底组件，登记成 Composition `<段键>-<名>`，帧数、尺寸同本段，
 *  第 f 帧叠在本段第 f 帧上。只进成片（anim film 叠），不进单段母版：游戏 UI 的字和数字只给完整成片（旧项目 透明层.py） */
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
  /** 和清单里同一场的上一段是同一个不切的镜头拆开的：本段起帧正好接上一段末帧的下一帧（anim check 查） */
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
    if ((c.台词 === undefined) === (c.资产 === undefined)) throw new Error(`声音 cue（第 ${c.帧} 帧）要写 台词 或 资产，二选一`);
    const 名 = `声音 cue（第 ${c.帧} 帧 ${c.台词 ?? c.资产}）`;
    // 开口可以带小数；从哪一帧起放的（资产、接上段）是整帧
    const 整帧 = c.台词 === undefined || c.接上段;
    if (!Number.isFinite(c.帧) || c.帧 < 0 || c.帧 >= d.帧数 || (整帧 && !Number.isInteger(c.帧))) throw new Error(`${名}：帧要在段内 [0, ${d.帧数})${整帧 ? '、是整数' : ''}`);
    if (c.帧数 !== undefined && (!Number.isInteger(c.帧数) || c.帧数 <= 0 || (整帧 && c.帧 + c.帧数 > d.帧数))) throw new Error(`${名}：帧数 ${c.帧数} 要是正整数、不超过段尾`);
    if (c.台词 !== undefined) continue;
    if (c.帧数 === undefined || !c.名) throw new Error(`${名}：资产 cue 要写 名、帧数`);
    if (c.速率 !== undefined && !(c.速率 > 0)) throw new Error(`${名}：速率要大于 0`);
    if (c.入点秒 !== undefined && !(c.入点秒 >= 0)) throw new Error(`${名}：入点秒不能是负的`);
    if (c.档 !== undefined && !/^((重|中|脚步) -\d+(\.\d+)?|细节|-?\d+(\.\d+)?)$/.test(c.档)) throw new Error(`${名}：档「${c.档}」要是「重 -10」「中 -20」「脚步 -30」「细节」或响度数`);
    if (Array.isArray(c.增益)) {
      if (c.增益.length !== c.帧数) throw new Error(`${名}：逐帧增益 ${c.增益.length} 个，帧数是 ${c.帧数}`);
      if (c.淡出 !== undefined) throw new Error(`${名}：逐帧增益已经含淡出，不另写 淡出`);
    }
    if (c.淡出 !== undefined && (!Number.isInteger(c.淡出) || c.淡出 <= 0 || c.淡出 > c.帧数)) throw new Error(`${名}：淡出 ${c.淡出} 帧要是正整数、不超过帧数`);
  }
  const 层名 = new Set<string>();
  for (const l of d.叠层 ?? []) {
    if (!/^叠层[^/]*\.tsx$/.test(l.入口)) throw new Error(`叠层 ${l.名} 的入口 ${l.入口} 要是本段目录下的 叠层*.tsx（作品的 注册.tsx 只收这个名字）`);
    // Remotion 的 Composition id 只认字母、数字、汉字和 -
    if (!/^[A-Za-z0-9\u4e00-\u9fff-]+$/.test(l.名) || 层名.has(l.名)) throw new Error(`叠层名「${l.名}」重复，或不能当 Composition id（只能字母、数字、汉字和 -）`);
    层名.add(l.名);
  }
  return d;
};
