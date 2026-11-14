import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { 交对照, 存取样表, 存样本图, 核对口径, 读基点, type 取样证据 } from './基点对照.ts';

const 根们: string[] = [];
afterEach(() => { for (const 根 of 根们.splice(0)) fs.rmSync(根, { recursive: true, force: true }); });
const 准备 = () => {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), '基点对照-'));
  根们.push(根);
  const 留 = (名: string, 内容: string) => {
    const 目录 = path.join(根, 名);
    fs.mkdirSync(目录);
    const 证: 取样证据 = { 版本: 1, 提交: 名, 理由: '核对', 指纹: 名, 口径: { 作品: '甲', 段: '乙', 旧指纹: '旧', 旧片sha: '片', 宽: 32, 高: 32, 总帧数: 1, 帧号: [0], 级别: '视频', 平台: '测试', 主机: '甲', 后端: 'gl', 输出fps: 60, 缩放: 3, 阈值: '同一套' }, 帧: [{ 帧: 0, 结论: '不同', sha: 存样本图(目录, 0, Buffer.from(内容)) }] };
    存取样表(目录, 证);
    return { 目录, 证: 读基点(目录) };
  };
  return { 根, 留 };
};
it('基点自己不认旧片，候选抽样相同；同对证据重复交接只生成一个平铺报告', () => {
  const { 根, 留 } = 准备(), 基 = 留('基点', '旧差'), 现 = 留('候选', '旧差'), 预览 = path.join(根, '预览');
  const 交 = () => 交对照(基.目录, 基.证, 现.目录, 现.证, 预览);
  const 报 = 交();
  expect(报.判词).toContain('来自基点');
  expect(交().目录).toBe(报.目录);
  expect(fs.readdirSync(预览)).toHaveLength(1);
  expect(fs.readdirSync(报.目录)).toHaveLength(4);
});
it('候选也不认同一帧但 PNG 不同，不把差异归给基点', () => {
  const { 根, 留 } = 准备(), 基 = 留('基点', '甲'), 现 = 留('候选', '乙');
  expect(交对照(基.目录, 基.证, 现.目录, 现.证, path.join(根, '预览')).候选有差).toBe(true);
});
it('旧片被替换、抽样缺失、旧片判定矛盾或 PNG 损坏时不出归因报告', () => {
  const { 根, 留 } = 准备(), 基 = 留('基点', '甲'), 现 = 留('候选', '甲');
  expect(() => 核对口径(基.证.口径, { ...基.证.口径, 旧片sha: '换' })).toThrow('旧片sha');
  expect(() => 交对照(基.目录, 基.证, 现.目录, { ...现.证, 帧: [] }, 根)).toThrow('不齐');
  现.证.帧[0]!.结论 = '一样';
  expect(() => 交对照(基.目录, 基.证, 现.目录, 现.证, 根)).toThrow('结论不一致');
  fs.writeFileSync(path.join(基.目录, '第0000帧.png'), '被改了');
  expect(() => 读基点(基.目录)).toThrow('哈希不符');
});
