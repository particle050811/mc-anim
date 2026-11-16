// 新旧两条路动出来的嘴一样：应力转动的句模块走 库/角色/句口型.ts，旧表走 作品/应力转动/配音/口型.ts 的 做口型；数据根里没有旧表的字节就跳过。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLipData } from '../../库/角色/口型.ts';
import { sentenceLip, sentenceNod } from '../../库/角色/句口型.ts';
import { codeRoot } from '../环境/路径.ts';
import { readOldVoiceTable } from './旧表.ts';
import { bytesPath, readAssetLock, assetLockPath } from '../资产/资产锁.ts';
import { listSentenceModules, sentencePath, readSentenceModule } from './句模块.ts';

const workRoot = path.join(codeRoot(), '作品', '应力转动');
const assetLock = readAssetLock(assetLockPath());
const hasOldTable = ['数据/配音/台词表', '数据/配音/口型'].every((id) => assetLock[id] && fs.existsSync(bytesPath(assetLock[id]!)));

describe.skipIf(!hasOldTable || !listSentenceModules(workRoot).length)('句口型和旧 做口型 逐帧一样', () => {
  it('应力转动 32 句：嘴的开合宽窄、点头', () => {
    const oldTable = readOldVoiceTable(workRoot, assetLock);
    const lipTable: Record<string, unknown> = {};
    const lineTable: Record<string, unknown> = {};
    for (const v of oldTable.values()) {
      lipTable[v.oldId] = v.口型;
      lineTable[v.oldId] = v.台词;
    }
    const legacyLip = buildLipData(lipTable, lineTable);
    let compared = 0;
    for (const id of listSentenceModules(workRoot)) {
      const sentence = readSentenceModule(sentencePath(workRoot, id))!;
      const oldId = oldTable.get(id)!.oldId;
      const startFrame = 12.5;
      for (let f = 0; f < startFrame + Math.ceil(sentence.文件秒数 * 24) + 12; f++) {
        expect(sentenceLip([{ 句: sentence, 帧: startFrame }], sentence.角色, f, 24)).toEqual(legacyLip.mouthAt([{ id: oldId, 帧: startFrame }], sentence.角色, f, 24));
        const pose = { headPitch: 0.1, headYaw: -0.2 };
        expect(sentenceNod(pose, [{ 句: sentence, 帧: startFrame }], sentence.角色, f, 24)).toEqual(legacyLip.withTalkNod(pose, [{ id: oldId, 帧: startFrame }], sentence.角色, f, 24));
        compared++;
      }
      expect(sentenceLip([{ 句: sentence, 帧: startFrame }], '别人', startFrame + 5, 24)).toBeUndefined();
    }
    expect(compared).toBeGreaterThan(1000);
  });
});
