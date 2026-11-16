// 要改键名的盘上格式（键表在 盘键表/<格式>.tsv）。repo = 进 Git 的文件（相对仓库根），data = 数据根里还在读的（相对数据根），
// terrain = 地形包里的 JSON：地形包发布后不改，只能出新版本（地形新版.ts），平常的 run 不碰。
// 不在这里的：store/私有 的 JSON 资产（内容寻址，要出新资产、改资产锁、重打发布锁，下一阶段和读它们的代码一起做）、
// 取材暂存 run/extract（Python 取材脚本重导就是新的）、不再读的（基线、交付里 manifest 以外的、迁移记录、archive、草稿）、
// 外部格式（package.json、游戏目录、mod 的 lang、基岩版动画）、TSV 表头（代码按列号读，表头给人看）。
export type DiskFormat = {
  id: string;
  root: 'repo' | 'data' | 'terrain';
  /** data：从数据根的这几个目录往下找，或者只看这几个文件 */
  dirs?: string[];
  files?: string[];
  file: RegExp;
  lang: 'json' | 'jsonl' | 'toml';
};

export const FORMATS: DiskFormat[] = [
  { id: '台词', root: 'repo', file: /^作品\/[^/]+\/台词\.toml$/, lang: 'toml' },
  { id: '资产表', root: 'repo', file: /^(assets\/registry|作品\/[^/]+\/资产表)\/.*\.toml$/, lang: 'toml' },
  { id: '角色包', root: 'repo', file: /^(assets\/kits|作品\/[^/]+\/角色包)\/.*\.toml$/, lang: 'toml' },
  { id: '规矩', root: 'repo', file: /^(作品\/[^/]+\/规矩|rules\/[^/]+)\.toml$/, lang: 'toml' },
  { id: '认可', root: 'repo', file: /^作品\/[^/]+\/认可\/.*\.toml$/, lang: 'toml' },
  { id: '资产锁', root: 'repo', file: /^(assets|作品\/[^/]+)\/资产锁\/.*\.json$/, lang: 'json' },
  { id: '地形版本', root: 'repo', file: /^assets\/地形版本\.json$/, lang: 'json' },
  { id: '冻结粗高度', root: 'repo', file: /^assets\/冻结粗高度\/[^/]+\.json$/, lang: 'json' },
  { id: '发布锁', root: 'repo', file: /^作品\/[^/]+\/发布锁\.json$/, lang: 'json' },
  { id: '随仓库', root: 'repo', file: /^作品\/[^/]+\/随(仓库|发布)\.toml$/, lang: 'toml' },
  { id: '材质包表', root: 'repo', file: /^作品\/[^/]+\/材质包\.toml$/, lang: 'toml' },
  { id: '材质包锁', root: 'repo', file: /^作品\/[^/]+\/材质包\.锁\.json$/, lang: 'json' },
  { id: '取材配方', root: 'repo', file: /^sourcing\/extract(\.录制)?\.toml$/, lang: 'toml' },
  { id: 'jar表', root: 'repo', file: /^sourcing\/jars\.toml$/, lang: 'toml' },
  { id: '世界编辑', root: 'repo', file: /^sourcing\/worlds\/[^/]+\.编辑\.toml$/, lang: 'toml' },
  { id: '世界声明', root: 'repo', file: /^sourcing\/worlds\/[^/.]+\.toml$/, lang: 'toml' },
  { id: '世界区块', root: 'repo', file: /^sourcing\/worlds\/[^/]+\.区块\.json$/, lang: 'json' },
  { id: '资产来源', root: 'repo', file: /^assets\/src\/来源\.toml$/, lang: 'toml' },
  { id: '阈值', root: 'repo', file: /^verify\/阈值\.toml$/, lang: 'toml' },
  { id: '配乐分析', root: 'repo', file: /^作品\/[^/]+\/配乐\/[^/]+\.分析\.json$/, lang: 'json' },
  { id: '金样', root: 'repo', file: /\/金样\/[^/]+\.json$/, lang: 'json' },
  { id: '地形编辑用例', root: 'repo', file: /^sourcing\/(mod\/test\/terrain-edit-cases\/[^/]+|datapacks\/[^/]+\/data\/mcai\/[^/]+)\.json$/, lang: 'json' },
  { id: '段签', root: 'data', dirs: ['段签'], file: /^段签\/.*签\.json$/, lang: 'json' },
  { id: '段签历史', root: 'data', dirs: ['段签'], file: /^段签\/.*\/历史\.jsonl$/, lang: 'jsonl' },
  { id: '母版指纹', root: 'data', dirs: ['cache/母版'], file: /^cache\/母版\/.*\.指纹\.json$/, lang: 'json' },
  { id: '叠层指纹', root: 'data', dirs: ['cache/叠层'], file: /^cache\/叠层\/.*\.指纹\.json$/, lang: 'json' },
  { id: '交付清单', root: 'data', dirs: ['交付'], file: /^交付\/[^/]+\/[^/]+\/manifest\.json$/, lang: 'json' },
  { id: '渲染明细', root: 'data', dirs: ['run/logs/渲染明细'], file: /\.json$/, lang: 'json' },
  { id: '调度日志', root: 'data', dirs: ['run/logs/调度'], file: /\.jsonl$/, lang: 'jsonl' },
  { id: '调度状态', root: 'data', dirs: ['run/调度'], file: /\.json$/, lang: 'json' },
  { id: '运行记录', root: 'data', dirs: ['run/运行记录'], file: /\.json$/, lang: 'json' },
  { id: '锁信息', root: 'data', dirs: ['run/locks'], file: /\.信息\.json$/, lang: 'json' },
  { id: '地形用量', root: 'data', dirs: ['run/地形用量'], file: /\.json$/, lang: 'json' },
  { id: '预生成状态', root: 'data', dirs: ['run/预生成'], file: /\.状态\.json$/, lang: 'json' },
  { id: '平台数据', root: 'data', dirs: ['平台'], file: /\/数据\.json$/, lang: 'json' },
  // 缓存里按内容或输入寻址、不会因为代码改了自己失效的，一起改（不改就要删了重算）
  { id: '求解缓存', root: 'data', dirs: ['cache/求解'], file: /\.json$/, lang: 'json' },
  { id: '音频数', root: 'data', dirs: ['cache/音频数'], file: /\.json$/, lang: 'json' },
  { id: 'sha缓存', root: 'data', files: ['cache/sha缓存.json'], file: /^cache\/sha缓存\.json$/, lang: 'json' },
  { id: '去重账', root: 'data', files: ['cache/去重账.json'], file: /^cache\/去重账\.json$/, lang: 'json' },
  { id: '材质包锁缓存', root: 'data', dirs: ['cache/材质包'], file: /\.锁\.json$/, lang: 'json' },
  { id: '地形包', root: 'terrain', file: /^包\.json$/, lang: 'json' },
  { id: '远景', root: 'terrain', file: /^远景(\.[^/.]+)?\.json$/, lang: 'json' },
  { id: '交界', root: 'terrain', file: /^交界\.[^/]+\.json$/, lang: 'json' },
];
