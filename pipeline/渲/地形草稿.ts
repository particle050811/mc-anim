// 临时开关：让 still、bench 读试做的地形包（地形64 试做，docs/决策/0011-地形压缩.md「64×64」）。正式转码登记后删掉这个文件和三处调用。
// ANIM_TERRAIN_DRAFT=<目录>：目录下 <包>/<版本>/ 是 anim world transcode --to 转出来的包，这些包换成草稿版，别的包照登记的。
// public 目录多一个链接 地形草稿 → 这个目录，版本写成 ../../地形草稿/<包>/<版本>，页面照常拼 terrain/<包>/<版本>，浏览器把路径折成 地形草稿/<包>/<版本>。
// film 走指纹的地形项，不认这个开关，切片不会混进草稿包。
import fs from 'node:fs';
import path from 'node:path';

export const draftEnvName = 'ANIM_TERRAIN_DRAFT';
export const draftLinkName = '地形草稿';

export const draftDir = () => {
  const raw = process.env[draftEnvName];
  if (!raw) return null;
  const dir = path.resolve(raw);
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${draftEnvName}=${raw} 不是目录`);
  return dir;
};

/** 段的地形版本表换上草稿包；没开开关原样返回 */
export const applyDraft = (table: Record<string, string>): Record<string, string> => {
  const dir = draftDir();
  if (!dir) return table;
  const out = { ...table };
  for (const pack of Object.keys(table)) {
    const packDir = path.join(dir, pack);
    if (!fs.existsSync(packDir)) continue;
    const versions = fs.readdirSync(packDir).filter((v) => fs.statSync(path.join(packDir, v)).isDirectory());
    if (versions.length !== 1) throw new Error(`${packDir} 下要正好一个版本目录，现在 ${versions.length} 个`);
    out[pack] = `../../${draftLinkName}/${pack}/${versions[0]}`;
  }
  console.log(`地形草稿（${draftEnvName}）：${Object.keys(out).filter((k) => out[k] !== table[k]).map((k) => `${k} → ${out[k]}`).join('、') || '这段没有草稿包'}`);
  return out;
};
