// 清单：作品的 段/、核对/ 下的目录和清单一一对应；段键合规（<章>-<段名>，段名只用汉字、字母、数字，全片唯一）、
// 不撞旧名表；场键合规、不撞旧名；同一场里标了「连续」的段，起帧正好接上一段末帧的下一帧。旧名表本身的格式也在这查。
import { readContent, listExistingDirs } from '../../源码/内容.ts';
import { findOldNameClashes, findOldSegNameClashes, readOldNames } from '../旧名.ts';
import type { CheckReport, CheckContext } from '../../源码/上下文.ts';
import { registeredDirs, missingDirHint } from '../../段框架/注册目录.ts';
import { segFps } from '../../../engine/段/段定义.ts';

/** Remotion 的 Composition id 只认 a-z A-Z 0-9 - 和 CJK（validate-composition-id.js） */
const nameChar = '[A-Za-z0-9\\u4e00-\\u9fff]';
export const isSegKeyValid = (segKey: string, chapter: number | '核对') =>
  chapter === '核对' ? new RegExp(`^核对-${nameChar}+(-${nameChar}+)*$`).test(segKey) : new RegExp(`^${chapter}-${nameChar}+$`).test(segKey);
export const isSceneKeyValid = (sceneKey: string) => new RegExp(`^\\d+-${nameChar}+$`).test(sceneKey);

export const checkManifest = async (c: CheckContext, report: CheckReport) => {
  const oldName = readOldNames(c, report);
  const parsedContent = await readContent(c);
  const manifestPath = c.workPath('清单.ts');
  if ('errors' in parsedContent) return report.错(parsedContent.errors, manifestPath);
  const { segments } = parsedContent;

  const segKeys = new Set<string>();
  const segNames = new Map<string, string>();
  for (const s of segments) {
    if (segKeys.has(s.key)) report.错(`段键 ${s.key} 在清单里出现了两次`, manifestPath);
    segKeys.add(s.key);
    if (!isSegKeyValid(s.key, s.章)) {
      report.错(
        s.章 === '核对' ? `核对段的键要是 核对-<名>（汉字、字母、数字）：${s.key}` : `段键要是 ${s.章}-<段名>，段名只用汉字、字母、数字：${s.key}`,
        manifestPath,
      );
      continue;
    }
    if (s.章 !== '核对') {
      const segName = s.key.slice(String(s.章).length + 1);
      if (segNames.has(segName)) report.错(`段名「${segName}」重复：${segNames.get(segName)} 和 ${s.key}（段名全片唯一）`, manifestPath);
      segNames.set(segName, s.key);
      for (const x of [...findOldNameClashes(oldName, s.key), ...findOldSegNameClashes(oldName, segName, s.key)]) {
        report.错(`段键 ${s.key} 撞了旧名表第 ${x.行} 行的旧名「${x.oldName}」（${x.category}${x.newKey ? ` → ${x.newKey}` : '，已删'}）：旧名永不复用`, manifestPath);
      }
    }
    if (s.errors) continue; // 加载 规则报
    const scene = s.definition!.scene;
    if (s.章 === '核对' ? scene !== '核对' : !isSceneKeyValid(scene)) report.错(`${s.key} 的 场 写的是「${scene}」：${s.章 === '核对' ? '核对段写 核对' : '场键要是 <章>-<场名>'}`, s.segmentFile);
  }

  // 目录和清单一一对应
  for (const layerKind of ['段', '核对'] as const) {
    const dirPrefix = c.workPath(`${layerKind}/`);
    const listedDirs = new Set(segments.filter((s) => s.目录.startsWith(dirPrefix)).map((s) => s.目录.slice(dirPrefix.length)));
    for (const d of listExistingDirs(c, layerKind)) if (!listedDirs.has(d)) report.错(`${dirPrefix}${d}/ 不在清单里（加进 ${manifestPath}，或删掉这个目录）`, `${dirPrefix}${d}`);
    for (const d of listedDirs) if (!c.exists(`${dirPrefix}${d}`)) report.错(`清单里有 ${layerKind === '核对' ? `核对-${d}` : d}，但没有 ${dirPrefix}${d}/`, manifestPath);
  }

  // 注册.tsx 用 webpackContext 收的目录要有文件（git 不记空目录，没有文件别处 clone 下来就打不了包）
  const registerFile = c.workPath('注册.tsx');
  if (c.exists(registerFile)) {
    const workFiles = c.workFiles();
    for (const d of registeredDirs(c.读(registerFile))) {
      if (!workFiles.some((p) => p.startsWith(c.workPath(`${d}/`)))) report.错(missingDirHint(c.workDir, d), registerFile);
    }
  }

  // 场键：清单里用到的和 场/ 下的目录
  const sceneKeys = new Set([...segments.flatMap((s) => (s.definition && s.definition.scene !== '核对' ? [s.definition.scene] : [])), ...listExistingDirs(c, '场')]);
  for (const k of sceneKeys) {
    if (!isSceneKeyValid(k)) {
      if (c.exists(c.workPath(`场/${k}`))) report.错(`场目录名要是 <章>-<场名>：${k}`, c.workPath(`场/${k}`));
      continue;
    }
    for (const x of findOldNameClashes(oldName, k)) report.错(`场键 ${k} 撞了旧名表第 ${x.行} 行的旧名「${x.oldName}」：旧名永不复用`);
  }

  // 连续的相邻段
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    if (!s.definition?.continuous) continue;
    const prev = [...segments.slice(0, i)].reverse().find((x) => x.definition?.scene === s.definition!.scene);
    if (!prev || segments[i - 1] !== prev) {
      report.错(`${s.key} 标了 连续，但清单里紧挨着的上一段${prev ? `（${segments[i - 1]!.key}）不是同一场的` : '不存在或不在同一场'}`, s.segmentFile);
      continue;
    }
    const a = prev.definition!.sceneWindow;
    const b = s.definition.sceneWindow;
    if (!a || !b) {
      report.错(`${s.key} 标了 连续，它和上一段 ${prev.key} 都要写 场窗口`, s.segmentFile);
      continue;
    }
    // 场窗口两端都对齐到 1/段格 秒（窗口段.ts），差不到半格就是接上了
    if (Math.abs(b.startSec - a.endSec) >= 0.5 / segFps) {
      report.错(`${s.key} 标了 连续：上一段 ${prev.key} 止于场时间线第 ${a.endSec} 秒，本段起于第 ${b.startSec} 秒，要正好接上`, s.segmentFile);
    }
  }
};
