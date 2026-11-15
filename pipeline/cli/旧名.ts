// anim 的旧中文命令、参数 → 新英文名（用户 11-15 定：中文旧名删掉、不留别名，敲了报「改名了」不执行）。
// 这张表是旧名的唯一记录：入口（main.ts）对整条命令行查一次，各子命令里不再散着写旧名。
// 参数的值不在表里（段键、场键、作品名、主题、--level 视频|预览 这类照旧写中文）。

/** 旧命令路径 → 新命令路径（空格分开，子命令接在父命令后面） */
export const renamedCommands: Record<string, string> = {
  '批': 'batch',
  '调度': 'sched',
  '耗时': 'timing',
  '认指纹': 'reuse',
  '平台': 'platform',
  'bili': 'platform',
  '调度 看': 'sched show',
  '调度 先': 'sched first',
  '调度 后': 'sched last',
  '调度 恢复': 'sched resume',
  '调度 放行': 'sched release',
  '调度 让路': 'sched yield',
  '调度 取消': 'sched cancel',
  '调度 清孤儿': 'sched clean-orphans',
  '调度 记': 'sched note',
  '调度 预计': 'sched estimate',
  '调度 盯': 'sched watch',
  '调度 等': 'sched wait',
  '调度 路': 'sched route',
  '调度 令': 'sched order',
  '调度 日志': 'sched log',
  '调度 复盘': 'sched review',
  '调度 等锁表': 'sched lock-waits',
  '调度 路 开': 'sched route open',
  '调度 路 完': 'sched route done',
  '调度 路 败': 'sched route fail',
  '调度 路 看': 'sched route show',
  '平台 导入': 'platform import',
  '平台 分析': 'platform analyze',
  'assets 材质包': 'assets packs',
  'preview 清理': 'preview clean',
  'verify 逐帧': 'verify frames',
  'verify 补参考': 'verify backfill',
  'world 转码': 'world transcode',
  'world 远景': 'world far',
  'world 解码器': 'world decoder',
  'world 远景 任务': 'world far tasks',
  'world 远景 地标': 'world far landmarks',
  'world 远景 打包': 'world far pack',
  'gamedata 导出': 'gamedata export',
  'gamedata 核对': 'gamedata verify',
  'check 类型': 'check types',
  'check 结构': 'check structure',
  'check 清单': 'check manifest',
  'check 加载': 'check load',
  'check 台词': 'check lines',
  'check 资产': 'check assets',
  'check 规矩': 'check rules',
  'check 平台': 'check platform',
  'check 副本': 'check dupes',
  'check 时间': 'check time',
};

/** 旧参数 → 新参数 */
export const renamedFlags: Record<string, string> = {
  '--作品': '--work',
  '--调试': '--debug',
  '--低优先': '--low-priority',
  '--为什么': '--why',
  '--一行': '--oneline',
  '--从': '--from',
  '--到': '--to',
  '--强': '--force',
  '--杀持锁': '--kill-holder',
  '--原序': '--orig-order',
  '--闸空': '--gate-empty',
  '--撤': '--undo',
  '--让路': '--yield',
  '--最长': '--max-sec',
  '--任务': '--task',
  '--事': '--event',
  '--票': '--ticket',
  '--段': '--seg',
  '--路': '--route',
  '--日': '--day',
  '--分钟': '--minutes',
  '--看到': '--saw',
  '--决定': '--decision',
  '--说明': '--note',
  '--结果': '--result',
  '--文件': '--file',
  '--内存': '--memory',
  '--到预览': '--to-preview',
  '--级别': '--level',
  '--逐帧': '--per-frame',
  '--望远': '--tele',
  '--细一级': '--finer',
  '--真值': '--truth',
  '--光影': '--shading',
  '--帧': '--frames',
  '--次': '--runs',
  '--详细': '--verbose',
  '--详': '--verbose',
  '--输出': '--out',
  '--留输出': '--keep-out',
  '--关共享内存': '--no-shm',
  '--浏览器': '--browser',
  '--不收日志': '--no-logs',
  '--最近': '--last',
  '--理由': '--reason',
  '--抽': '--sample',
  '--只看': '--dry-run',
  '--存基点': '--save-base',
  '--对基点': '--vs-base',
  '--严格': '--strict',
  '--名': '--name',
  '--重渲': '--rerender',
  '--分享版': '--share',
  '--执行': '--apply',
  '--天': '--days',
  '--快': '--fast',
  '--深': '--deep',
  '--渲': '--render',
  '--存': '--save',
  '--比': '--compare',
  '--留图': '--keep-images',
  '--保留浏览器': '--keep-browser',
  '--连贯': '--coherent',
  '--替换': '--replace',
  '--检查': '--check',
  '--上传': '--upload',
  '--全部': '--all',
  '--只打印': '--print-only',
  '--校验': '--verify',
  '--列出': '--list',
  '--登记': '--register',
  '--新': '--new',
  '--许可': '--licenses',
  '--写': '--write',
  '--补网格配方': '--backfill-mesh',
  '--下载': '--download',
  '--粒子帧': '--particle-frames',
  '--只': '--only',
  '--方块': '--blocks',
  '--开头窗': '--head',
  '--结尾窗': '--tail',
  '--后端': '--backend',
  '--种子': '--seeds',
  '--语气参考': '--tone-ref',
  '--强度': '--strength',
  '--允许云端': '--allow-cloud',
  '--允许付费': '--allow-paid',
  '--不复核': '--no-review',
  '--项': '--items',
  '--不裁': '--no-trim',
  '--不管旧表': '--ignore-old',
  '--来源': '--source',
  '--重对齐': '--realign',
  '--近期天数': '--recent-days',
  '--草稿天数': '--draft-days',
  '--webpack天数': '--webpack-days',
  '--列段天数': '--list-days',
  '--场': '--scene',
  '--起': '--start',
  '--止': '--end',
  '--包': '--pack',
  '--存档': '--save-dir',
  '--不套编辑': '--no-edits',
  '--不登记': '--no-register',
  '--线程': '--threads',
  '--分': '--parts',
  '--镜头框': '--camera-box',
  '--视距': '--view-dist',
  '--块': '--box',
  '--两角': '--corners',
  '--沙盒': '--sandbox',
  '--服务端': '--server-dir',
  '--堆': '--heap',
  '--生成线程': '--gen-threads',
  '--卡住分钟': '--stuck-minutes',
  '--老年代上限': '--old-gen-limit',
  '--最多无进度重启': '--max-stalled-restarts',
  '--不补洞': '--no-fill-holes',
  '--重来': '--from-scratch',
  '--同意EULA': '--accept-eula',
  '--不装加载器': '--no-loader',
  '--版本': '--version',
  '--像素': '--pixels',
  '--表': '--table',
  '--原样': '--raw',
  '--列': '--column',
};

/** 参数原样转给别的程序的命令（和命令表里 passThrough 的一致，旧名.test.ts 核对）：它后面的不查 */
export const passThroughCommands: readonly string[] = ['mcai', 'studio'];

const globalValueFlags = new Set(['--work']);
const globalToggles = new Set(['--debug', '--low-priority']);

/** (新父路径, 旧词) → 新词 */
const subRenames = new Map<string, string>();
/** 新名里有的 (父路径, 子命令)：认得的新子命令才往下走 */
const newSubs = new Set<string>();
for (const [oldPath, newPath] of Object.entries(renamedCommands)) {
  const o = oldPath.split(' '), n = newPath.split(' ');
  subRenames.set(`${n.slice(0, -1).join(' ')}\0${o.at(-1)}`, n.at(-1)!);
  newSubs.add(`${n.slice(0, -1).join(' ')}\0${n.at(-1)}`);
}

/** 查一条命令行里的旧名；有就返回报错文本（逐条列出 旧 → 新），没有返回 null */
export const oldNameError = (argv: readonly string[]): string | null => {
  const sepIndex = argv.indexOf('--');
  const head = sepIndex < 0 ? argv : argv.slice(0, sepIndex);
  const found: string[] = [];
  // 命令路径：去掉全局参数后打头的几个位置参数，按新名逐层往下认
  let i = 0;
  for (; i < head.length; i++) {
    const a = head[i]!;
    const flag = a.split('=')[0]!;
    const newFlag = renamedFlags[flag] ?? flag;
    if (globalValueFlags.has(newFlag)) {
      if (!a.includes('=')) i++;
    } else if (!globalToggles.has(newFlag)) break;
  }
  const oldWords: string[] = [], newWords: string[] = [];
  let parent = '', renamed = false;
  for (let j = i; j < head.length && !head[j]!.startsWith('-'); j++) {
    const w = head[j]!;
    // check 的规则名可以连写几个，都挂在 check 下；没有旧名的新规则（idents）也照样往后认
    const at = parent.startsWith('check ') ? 'check' : parent;
    const sub = subRenames.get(`${at}\0${w}`);
    if (sub !== undefined) renamed = true;
    else if (j > i && at !== 'check' && !newSubs.has(`${at}\0${w}`)) break;
    oldWords.push(w);
    newWords.push(sub ?? w);
    parent = `${at} ${sub ?? w}`.trim();
  }
  if (renamed) found.push(`anim ${oldWords.join(' ')} → anim ${newWords.join(' ')}`);
  // 参数：-- 之后的、转给别的程序的命令后面的不查
  const end = passThroughCommands.includes(newWords[0] ?? '') ? i + 1 : head.length;
  for (const a of head.slice(0, end)) {
    const flag = a.split('=')[0]!;
    const newFlag = renamedFlags[flag];
    if (newFlag && !found.includes(`${flag} → ${newFlag}`)) found.push(`${flag} → ${newFlag}`);
  }
  return found.length ? `改名了，用新名（旧的中文命令、参数不再认）：\n${found.map((x) => `  ${x}`).join('\n')}` : null;
};
