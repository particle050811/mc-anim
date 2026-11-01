// 遮密和行超长：测试值都是假的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { 读调度, 记调度 } from './调度日志.ts';
import { 读发起者, 遮密, 遮命令 } from './发起者.ts';
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-遮密-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('遮密', () => {
  it('引号没配对也遮', () => {
    expect(遮密('Authorization: "fake abc')).not.toContain('fake');
    expect(遮密('token="fake')).not.toContain('fake');
  });
  it('一长串命中的词不会卡住', () => {
    const 起 = performance.now();
    遮密('key-'.repeat(50000));
    expect(performance.now() - 起).toBeLessThan(1000);
  });
  it.each([
    ['Authorization: Bearer fake-live-abc123'], ['Authorization: token fake_abc'], ['authorization=Basic fake abc'],
    ['curl -H "Authorization: Bearer fake-1" https://x.y'], ['Cookie: sid=fake-1; other=fake-2'], ['--cookie=sid=fake-1'],
    ['https://oauth2:fake-1@github.com/a'], ['git clone ssh://me:fake-1@host/x'], ['PASSWD=fake-1'], ['DB_PASS=fake-1'], ['MYSQL_PWD=fake-1'], ['pass=fake-1'], ['pwd: fake-1'], ['--auth=fake-1'], ['--auth fake-1'],
    ['credentials=fake-1'], ['--credentials fake-1'], ['aws_credential: fake-1'], ['API_KEY=fake-1'], ['x-api-key: fake-1'], ['apikey=fake-1'], ['--key fake-1'], ['?token=fake-1&x=1'], ['{"password":"fake-1"}'], ['Bearer fake-1'],
  ])('%s', s => { expect(遮密(s)).not.toContain('fake'); });
  it('长得像密钥的值，没有名字也遮', () => { expect(遮密('用 sk-fake0000 和 ghp_fake0000 登录')).toBe('用 [已遮蔽] 和 [已遮蔽] 登录'); });
  it.each([['token 满了'], ['pass 3 通过'], ['bypass=1'], ['author=张三'], ['keyframe=3'], ['monkey=3'], ['--keyframe 3'], ['task-1234567'], ['key-art/图.png'], ['负载1.0/10 闸40% 压力1 持锁#1 排队0'], ['--为什么 auth 失败']])('不误遮 %s', s => { expect(遮密(s)).toBe(s); });
  it('argv 逐项遮：值带空格也整项遮掉', () => {
    expect(遮命令(['anim', '--password', 'fake two words', '--to', '3'])).toBe('anim --password [已遮蔽] --to 3');
    expect(遮命令(['--password=fake two words', 'PASSWD=fake two'])).toBe('--password=[已遮蔽] PASSWD=[已遮蔽]');
    expect(遮命令(['-H', 'Authorization: Bearer fake abc'])).toBe('-H Authorization: [已遮蔽]');
  });
  it('进日志的字段和键都遮；发起者的命令走逐项遮', () => {
    记调度(dir, '决定', { 为什么: 'DB_PASS=fake-1 https://u:fake-2@h/x', 发起: 读发起者({ ANIM_ROUTE: 'token=fake-3' }, ['node', '--cookie', 'sid fake-4'], dir, false), cookie: 'fake-5', db_pwd: 'fake-6' });
    expect(JSON.stringify(读调度(dir))).not.toContain('fake');
  });
});

describe('行超长', () => {
  const 发起 = () => ({ ...读发起者({}, ['node', 'anim', '调度', '记', '字'.repeat(180)], '/数据/'.repeat(30), false) });
  it('决定、为什么 各 400 字加完整 谁、发起：全文保留，只丢快照', () => {
    const 说 = vi.spyOn(console, 'error').mockImplementation(() => {});
    记调度(dir, '决定', { 谁: 发起(), 发起: 发起(), 看到: { 人工: '看'.repeat(50), 摘要: '负载1', 队: Array(3).fill({ 票: '票'.repeat(100) }) }, 决定: '决'.repeat(400), 为什么: '因'.repeat(400), 机: { 负载: 1 } });
    const [行] = 读调度(dir);
    expect(说.mock.calls.flat().join()).toContain('已压缩');
    说.mockRestore();
    expect(Buffer.byteLength(JSON.stringify(行))).toBeLessThan(4096);
    expect(行).toMatchObject({ 决定: '决'.repeat(400), 为什么: '因'.repeat(400), 截断: true, 看到: `${'看'.repeat(50)}；负载1` });
    expect((行!.谁 as { pid: number }).pid).toBe(process.pid);
  });
  it('还放不下就截前缀，不落到只剩时间的最小行', () => {
    const 说 = vi.spyOn(console, 'error').mockImplementation(() => {});
    const 长 = '字'.repeat(400);
    记调度(dir, '决定', { 谁: 发起(), 发起: 发起(), 看到: { 人工: 长, 摘要: 长 }, 决定: 长, 为什么: 长 });
    记调度(dir, '决定', { 谁: 发起(), 决定: '决', 为什么: '因', 其他: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['字段' + i, 长])) });
    说.mockRestore();
    const [甲, 乙] = 读调度(dir);
    for (const 行 of [甲!, 乙!]) {
      expect(Buffer.byteLength(JSON.stringify(行))).toBeLessThan(4096);
      expect(行.谁).toBeTruthy();
      expect(String(行.决定).startsWith(行 === 甲 ? '字' : '决')).toBe(true);
    }
    expect(String(甲!.决定)).toMatch(/…$/);
    expect(乙!.其他).toBeUndefined();
  });
});
