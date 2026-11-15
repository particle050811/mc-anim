// 台词句轨交给 做台词轨 的表和 cue，和旧 台词轨.tsx 从旧台词表拿到的一样（放法本身都在 做台词轨 里，同一份代码）：
// 把 做台词轨 换成记录参数的假货，逐句比开口、时长、有声长、角色和 cue；数据根里没有旧表的字节就跳过。
import fs from 'node:fs';
import path from 'node:path';
import { createElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { readOldVoiceTable } from './旧表.ts';
import { bytesPath, readAssetLock, assetLockPath } from '../资产/资产锁.ts';
import { listSentenceModules, sentencePath, readSentenceModule } from './句模块.ts';

type TableItem = { 角色: string; 文件: string; 时长: number; 开口: number; 有声长: number };
const mockState = vi.hoisted(() => ({ 表: {} as Record<string, unknown>, 声音: {} as Record<string, string>, lines: [] as unknown[] }));
vi.mock('../../engine/audio/台词轨.tsx', () => ({
  makeLineTrack: (lineTable: Record<string, unknown>, sounds: Record<string, string>) => {
    mockState.表 = lineTable;
    mockState.声音 = sounds;
    return { LineTrack: (p: { lines: unknown[] }) => ((mockState.lines = p.lines), null) };
  },
}));
const { LineCueTrack: lineCueTrack } = await import('../../engine/audio/台词句轨.tsx');
// 项目没装 @types/react-dom：按变量名引，类型自己写
const reactDomServer = 'react-dom/server';
const { renderToStaticMarkup } = (await import(reactDomServer)) as { renderToStaticMarkup: (el: ReactElement) => string };

const workRoot = path.join(codeRoot(), '作品', '应力转动');
const assetLock = readAssetLock(assetLockPath());
const hasOldTable = ['数据/配音/台词表', '数据/配音/口型'].every((id) => assetLock[id] && fs.existsSync(bytesPath(assetLock[id]!)));

describe('台词句轨', () => {
  it('没给某句的声音就报错', () => {
    const sentence = { id: '7-李樱-溜了', 角色: '李樱', 念: '溜了', 配音: '配音/7-李樱-溜了', 成品sha: 'a'.repeat(12), 开口: 0, 有声长: 1, 时长: 1, 文件秒数: 1, 字: [], 嘴: [] };
    expect(() => renderToStaticMarkup(createElement(lineCueTrack, { lineCues: [{ 句: sentence, 帧: 0 }], 声音: {} }))).toThrow(/没给 7-李樱-溜了 的声音/);
  });

  it.skipIf(!hasOldTable || !listSentenceModules(workRoot).length)('应力转动 32 句：交给 做台词轨 的开口、时长、有声长、角色、cue 和旧表一样', () => {
    const oldTable = readOldVoiceTable(workRoot, assetLock);
    for (const id of listSentenceModules(workRoot)) {
      const sentence = readSentenceModule(sentencePath(workRoot, id))!;
      const legacyLine = oldTable.get(id)!.台词;
      renderToStaticMarkup(createElement(lineCueTrack, { lineCues: [{ 句: sentence, 帧: 12.5 }, { 句: sentence, 帧: 40, 音量: 0.5 }], 声音: { [id]: `blob:${id}` } }));
      const item = mockState.表[id] as TableItem;
      expect([item.角色, item.开口, item.时长, item.有声长]).toEqual([legacyLine.角色, legacyLine.开口, legacyLine.时长, legacyLine.有声长]);
      expect(mockState.声音[item.文件]).toBe(`blob:${id}`);
      expect(mockState.lines).toEqual([{ id, 帧: 12.5 }, { id, 帧: 40, 音量: 0.5 }]);
    }
  });
});
