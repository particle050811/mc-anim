import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { folderTime, isTextFile, executeCleanup, planDraftCleanup, planPreviewCleanup, parseReferences } from './清理.ts';

const dayMs = 24 * 3600 * 1000;
const writeFile = (p: string, bytesCount = 10) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.alloc(bytesCount));
};

describe('预览清理', () => {
  it('夹名的月日时分按 UTC 算，跨年取去年', () => {
    const now = Date.UTC(2026, 10, 2, 14, 0);
    expect(folderTime('1102-1408-换歌', now)).toBe(Date.UTC(2026, 10, 2, 14, 8));
    expect(folderTime('1230-0100-年末', Date.UTC(2027, 0, 2))).toBe(Date.UTC(2026, 11, 30, 1, 0));
    expect(folderTime('换歌', now)).toBeNull();
    expect(folderTime('1340-0000-坏', now)).toBeNull();
  });

  it('文字按后缀和大小认', () => {
    expect(isTextFile('00-说明.md', 3000)).toBe(true);
    expect(isTextFile('报告.html', 3 * 1024 * 1024)).toBe(false);
    expect(isTextFile('01-成片.mp4', 10)).toBe(false);
  });

  it('引用按完整路径取，中文标点、通配符处截断，只到夹的不算', () => {
    const r = parseReferences('预览/1023-1635-正片三版/01-课表-原样.png，\n预览/1102-1143-verify比法\n预览/监守者/剖面*.png\n预览/a/b.png。');
    expect([...r].sort()).toEqual(['1023-1635-正片三版/01-课表-原样.png', 'a/b.png', '监守者/剖面']);
  });

  it('过时的夹文字挪进归档、媒体删；新的不动；归档里的只删媒体；引用的照留', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-预览清理-'));
    const previewDir = path.join(root, '预览');
    const archiveDir = path.join(root, 'archive');
    const now = Date.UTC(2026, 10, 2, 14, 0);
    writeFile(path.join(previewDir, '1025-0249-成片/00-说明.md'));
    writeFile(path.join(previewDir, '1025-0249-成片/01-成片.mp4'), 1000);
    writeFile(path.join(previewDir, '1023-1635-课表/01-课表-原样.png'));
    writeFile(path.join(previewDir, '1102-1408-换歌/05-成片.mp4'));
    writeFile(path.join(archiveDir, '1022-0805-数据/00-说明.md'));
    writeFile(path.join(archiveDir, '1022-0805-数据/02-图.png'), 50);
    writeFile(path.join(archiveDir, '1024-0101-只有图/a.png'));
    writeFile(path.join(archiveDir, '1025-0249-成片/00-说明.md')); // 归档里已有同名的，不覆盖

    const refs = new Set(['1023-1635-课表/01-课表-原样.png']);
    const plan = planPreviewCleanup({ previewRoot: previewDir, archiveRoot: archiveDir, now, days: 3, 引用: refs });
    expect(plan.map((x) => x.名).sort()).toEqual(['1022-0805-数据', '1023-1635-课表', '1024-0101-只有图', '1025-0249-成片']);
    const r = executeCleanup(plan, []);

    expect(r).toMatchObject({ archivedFolders: 2, deletedFiles: 3, deletedBytes: 1060 });
    expect(fs.readdirSync(previewDir)).toEqual(['1102-1408-换歌']);
    expect(fs.readdirSync(path.join(archiveDir, '1025-0249-成片')).sort()).toEqual(['00-说明-2.md', '00-说明.md']);
    expect(fs.existsSync(path.join(archiveDir, '1023-1635-课表/01-课表-原样.png'))).toBe(true);
    expect(fs.readdirSync(path.join(archiveDir, '1022-0805-数据'))).toEqual(['00-说明.md']);
    expect(fs.existsSync(path.join(archiveDir, '1024-0101-只有图'))).toBe(false);
    // 再清一遍没事做
    expect(planPreviewCleanup({ previewRoot: previewDir, archiveRoot: archiveDir, now, days: 3, 引用: refs })).toEqual([]);
    fs.rmSync(root, { recursive: true });
  });

  it('草稿只删按日期起名、超过天数没动的', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-草稿清理-'));
    const oldTime = Date.now() - 20 * dayMs;
    for (const dirName of ['1001-0000-工作-旧', '配音', '1101-0000-工作-新']) writeFile(path.join(root, dirName, 'a.png'));
    for (const dirName of ['1001-0000-工作-旧', '配音']) {
      fs.utimesSync(path.join(root, dirName, 'a.png'), oldTime / 1000, oldTime / 1000);
      fs.utimesSync(path.join(root, dirName), oldTime / 1000, oldTime / 1000);
    }
    expect(planDraftCleanup(root, Date.now(), 14).map((d) => d.名)).toEqual(['1001-0000-工作-旧']);
    fs.rmSync(root, { recursive: true });
  });
});
