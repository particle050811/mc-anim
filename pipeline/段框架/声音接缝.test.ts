import { describe, expect, it } from 'vitest';
import type { AssetCue } from '../../engine/段/段定义.ts';
import { checkSoundSeams, formatSeamBaseline, parseSeamBaseline } from './声音接缝.ts';

const measure = (id: string) => (({ '雷': { duration: 7 }, '曲': { duration: 200 }, '短': { duration: 0.5 } } as Record<string, { duration: number }>))[id];
const cue = (x: Partial<AssetCue> & Pick<AssetCue, 'asset' | 'sec' | '长秒'>): AssetCue => ({ name: x.asset, ...x });

describe('声音接缝', () => {
  it('亚波伦 11-19：雷声放到段尾、下一段不接，报截掉；写了 cutReason就放行', () => {
    const segs = [{ key: '1-召唤', durSec: 8.35, cues: [cue({ asset: '雷', sec: 6.4, 长秒: 1.95, 增益: 0.3 })] }, { key: '2-开盘', durSec: 4, cues: [] }];
    const issues = checkSoundSeams(segs, measure);
    expect(issues.map((x) => x.baselineKey)).toEqual(['1-召唤\t雷\t截掉']);
    expect(issues[0]!.text).toMatch(/文件还剩 5\.05 秒/);
    segs[0]!.cues = [cue({ asset: '雷', sec: 6.4, 长秒: 1.95, cutReason: '硬切到别处' })];
    expect(checkSoundSeams(segs, measure)).toEqual([]);
  });

  it('没放到段尾、文件放完了、淡出到 0 的都不算截掉', () => {
    const segs = [{ key: '甲', durSec: 5, cues: [cue({ asset: '雷', sec: 0, 长秒: 4 }), cue({ asset: '短', sec: 4.5, 长秒: 0.5 }), cue({ asset: '曲', sec: 0, 长秒: 5, fadeOutSec: 1 })] }, { key: '乙', durSec: 1, cues: [] }];
    expect(checkSoundSeams(segs, measure)).toEqual([]);
  });

  it('下一段从段头接着放：位置对得上不报，跳了报跳位；名字改了按位置也认得出', () => {
    const prev = { key: '甲', durSec: 5, cues: [cue({ asset: '曲', name: '战斗曲', sec: 1, 长秒: 4, 入点秒: 20 })] };
    expect(checkSoundSeams([prev, { key: '乙', durSec: 3, cues: [cue({ asset: '曲', name: '战斗曲', sec: 0, 长秒: 2, 入点秒: 24 })] }], measure)).toEqual([]);
    expect(checkSoundSeams([prev, { key: '乙', durSec: 3, cues: [cue({ asset: '曲', name: '战斗曲(接)', sec: 0, 长秒: 2, 入点秒: 24 })] }], measure)).toEqual([]);
    const jumped = checkSoundSeams([prev, { key: '乙', durSec: 3, cues: [cue({ asset: '曲', name: '战斗曲', sec: 0, 长秒: 2, 入点秒: 26 })] }], measure);
    expect(jumped.map((x) => x.baselineKey)).toEqual(['甲\t战斗曲\t跳位']);
  });

  it('整条增益接缝差 1 dB 以上报跳音量；逐格增益（按距离衰减）不比', () => {
    const prev = { key: '甲', durSec: 5, cues: [cue({ asset: '曲', sec: 1, 长秒: 4, 入点秒: 20, 增益: 0.5 })] };
    const next = (增益: AssetCue['增益']) => ({ key: '乙', durSec: 3, cues: [cue({ asset: '曲', sec: 0, 长秒: 2, 入点秒: 24, 增益 })] });
    expect(checkSoundSeams([prev, next(0.25)], measure).map((x) => x.baselineKey)).toEqual(['甲\t曲\t跳音量']);
    expect(checkSoundSeams([prev, next(0.52)], measure)).toEqual([]);
    expect(checkSoundSeams([prev, next({ perSec: 60, value: [0.1, 0.1] })], measure)).toEqual([]);
  });

  it('循环的放到段尾不接就报', () => {
    const segs = [{ key: '甲', durSec: 5, cues: [cue({ asset: '短', sec: 0, 长秒: 5, 循环: true })] }];
    expect(checkSoundSeams(segs, measure)[0]!.text).toMatch(/片尾被截掉.*循环没停/);
  });

  it('基线：注释行不算，按键去重排序', () => {
    const issues = [{ baselineKey: '乙\t b\t截掉', text: '' }, { baselineKey: '甲\ta\t截掉', text: '' }, { baselineKey: '甲\ta\t截掉', text: '' }];
    const text = formatSeamBaseline(issues, '# 头');
    expect(text).toBe('# 头\n乙\t b\t截掉\n甲\ta\t截掉\n');
    expect([...parseSeamBaseline(text)]).toEqual(['乙\t b\t截掉', '甲\ta\t截掉']);
  });
});
