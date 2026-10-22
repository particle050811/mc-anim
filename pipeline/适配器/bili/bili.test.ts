import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 导入, 最新数据, 曲线, 解析, type 原始包 } from './数据.ts';
import { 对交付, 按段统计, 标题数字, 留存于, 段区间们, 章范围, type 交付 } from './时间轴.ts';

const 包 = (取于: string): 原始包 => ({
  版本: 1,
  取于,
  请求数: 3,
  错误: [],
  停于风控: null,
  稿件: [
    {
      bvid: 'BV1',
      标题: '应力转动 6 出征暮色',
      时长: 40,
      发布: 1792500116,
      对比: { stat: { play: 100, full_play_ratio: 1850, tm_rate: 769, tm_rate_med: 593, crash_rate: 2740, total_new_attention_cnt: 7 } },
      总览: null,
      播放分析: null,
      分P: [{ cid: 1, 标题: 'p1', 时长: 40, 留存: { viewer_quit: [{ duration_key: 20, num: 6000 }, { duration_key: 40, num: 3000 }] }, 弹幕: [{ progress: 25500, msg: 'b' }, { progress: 5000, msg: 'a' }] }],
      评论: [],
    },
  ],
});

const 交付 = (名: string, 时长秒: number, 完成 = ''): 交付 => ({
  目录: `/x/${名}`,
  m: { 名, 时长秒, 完成, 帧率: 24, 宽: 1, 高: 1, 总帧数: 时长秒 * 24, 响度: { 增益dB: 0 }, 叠层: [], 文件: {}, 段: [] },
});

describe('解析', () => {
  it('万分制换成比例，留存补上 0 秒 100%，弹幕按毫秒换秒并排序', () => {
    const [s] = 解析(包('2026-10-22T07:58:00Z'));
    expect(s!.指标.完播率).toBeCloseTo(0.185);
    expect(s!.指标.封标点击率).toBeCloseTo(0.0769);
    expect(s!.中位.封标点击率).toBeCloseTo(0.0593);
    expect(s!.指标.涨粉).toBe(7);
    expect(s!.留存).toEqual([{ 秒: 0, 留存: 1 }, { 秒: 20, 留存: 0.6 }, { 秒: 40, 留存: 0.3 }]);
    expect(s!.弹幕秒).toEqual([5, 25.5]);
  });
  it('同类曲线外推出来的负值丢掉', () => {
    expect(曲线([{ duration_key: 20, num: 100 }, { duration_key: 40, num: -5 }]).map((p) => p.秒)).toEqual([0, 20]);
  });
});

describe('对时间轴', () => {
  it('章范围和标题数字', () => {
    expect(章范围('第6-7章')).toEqual([6, 7]);
    expect(章范围('冒烟')).toBeNull();
    expect(标题数字('应力转动（1-3）-初入世界')).toEqual([1, 3]);
    expect(标题数字('seedance2.0')).toEqual([2, 0]);
  });
  it('时长差 1.5 秒内、标题章号落在交付范围里才算对上；同时长的比对交付不选', () => {
    const 们 = [交付('重组A1-比对', 354.7, '2026-10-22'), 交付('第6-7章', 354.7, '2026-10-21'), 交付('第8章', 354.9)];
    expect(对交付({ 标题: '应力转动 6 出征暮色', 时长: 355 }, 们)?.m.名).toBe('第6-7章');
    expect(对交付({ 标题: '应力转动5-粉碎奸商', 时长: 355 }, 们)).toBeNull();
    expect(对交付({ 标题: '应力转动 6 出征暮色', 时长: 300 }, 们)).toBeNull();
  });
  it('段按帧换秒，留存插值、段内流失和弹幕落段', () => {
    const 段 = 段区间们({ ...交付('第6章', 40).m, 段: [
      { 编号: '6-01', 键: '6-进入森林', 指纹: '', 母版: '', 帧数: 240, 全片起帧: 0 },
      { 编号: '6-02', 键: '6-斩娜迦', 指纹: '', 母版: '', 帧数: 720, 全片起帧: 240 },
    ] });
    expect(段.map((s) => [s.名, s.起, s.止])).toEqual([['进入森林', 0, 10], ['斩娜迦', 10, 40]]);
    const [s] = 解析(包('2026-10-22T07:58:00Z'));
    expect(留存于(s!.留存, 10)).toBeCloseTo(0.8);
    const 统 = 按段统计(段, s!.留存, s!.弹幕秒);
    expect(统[0]!.流失).toBeCloseTo(0.2);
    expect(统[0]!.弹幕).toBe(1);
    expect(统[1]!.弹幕).toBe(1);
    expect(统[1]!.每10秒相对流失).toBeCloseTo(1 - Math.pow(0.3 / 0.8, 10 / 30));
    // 同类 10 秒处 0.9、40 秒处 0.45（相对流失一半）：本段 0.8 进 0.3 出，扣掉同类会走的 0.4，多走 0.1
    const 同类 = [{ 秒: 0, 留存: 1 }, { 秒: 20, 留存: 0.8 }, { 秒: 40, 留存: 0.45 }];
    expect(按段统计(段, s!.留存, [], 同类)[1]!.超同类流失).toBeCloseTo(0.1);
    expect(按段统计(段, s!.留存, [])[1]!.超同类流失).toBeNaN();
  });
});

describe('导入', () => {
  it('按取数时间（UTC）建目录、挪走原文件、不覆盖；最新按取于', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-bili-'));
    const 写 = (名: string, 取于: string) => {
      const f = path.join(根, 名);
      fs.writeFileSync(f, JSON.stringify(包(取于)));
      return f;
    };
    const 库 = path.join(根, '平台');
    const a = 写('a.json', '2026-10-22T07:58:30Z');
    expect(导入(a, 库).目标).toBe(path.join(库, '1022-0758', '数据.json'));
    expect(fs.existsSync(a)).toBe(false);
    expect(() => 导入(写('b.json', '2026-10-22T07:58:10Z'), 库)).toThrow(/不覆盖/);
    导入(写('c.json', '2026-10-23T01:00:00Z'), 库);
    expect(最新数据(库).包.取于).toBe('2026-10-23T01:00:00Z');
    fs.rmSync(根, { recursive: true });
  });
});
