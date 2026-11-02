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
    ['Authorization: Bearer "fake-1"'], ["Authorization: Bearer 'fake-1'"], ['Authorization: Bearer "fake-1 fake-2"'], ['Authorization: token "fake-1"'], ['Authorization: "Bearer fake-1"'],
    ['Cookie: sid="fake-1"; o=fake-2'], ["Set-Cookie: sid='fake-1'; Path=/"], ['x-api-key: fake-1 fake-2'], ['X-Auth-Token: "fake-1" fake-2'], ['Bearer "fake-1 fake-2"'], ['GH_TOKEN="fake-1 fake-2'], ['https://u:fake 1@h/x'],
  ])('%s', s => { expect(遮密(s)).not.toContain('fake'); });
  it('长得像密钥的值，没有名字也遮', () => { expect(遮密('用 sk-fake0000 和 ghp_fake0000 登录')).toBe('用 [已遮蔽] 和 [已遮蔽] 登录'); });
  it.each([['token 满了'], ['pass 3 通过'], ['bypass=1'], ['author=张三'], ['keyframe=3'], ['monkey=3'], ['--keyframe 3'], ['task-1234567'], ['key-art/图.png'], ['负载1.0/10 闸40% 压力1 持锁#1 排队0'], ['--为什么 auth 失败']])('不误遮 %s', s => { expect(遮密(s)).toBe(s); });
  it('argv 逐项遮：值带空格也整项遮掉', () => {
    expect(遮命令(['anim', '--password', 'fake two words', '--to', '3'])).toBe('anim --password [已遮蔽] --to 3');
    expect(遮命令(['--password=fake two words', 'PASSWD=fake two'])).toBe('--password=[已遮蔽] PASSWD=[已遮蔽]');
    expect(遮命令(['-H', 'Authorization: Bearer fake abc'])).toBe('-H Authorization: [已遮蔽]');
    expect(遮命令(['-H', 'Authorization: Bearer "fake abc"', '--to', '3'])).toBe('-H Authorization: [已遮蔽] --to 3');
    expect(遮命令(['-H', 'Authorization: Bearer fake=abc'])).toBe('-H Authorization: [已遮蔽]');
    expect(遮命令(['-H', 'Cookie: sid="fake"; o=fake', '--header', 'x-api-key: fake two'])).toBe('-H Cookie: [已遮蔽] --header x-api-key: [已遮蔽]');
    expect(遮命令(['--为什么', 'pass 3: 通过', 'https://a.b/c:d', 'author: 张三'])).toBe('--为什么 pass 3: 通过 https://a.b/c:d author: 张三');
  });
  it('进日志的字段和键都遮；发起者的命令走逐项遮', () => {
    记调度(dir, '决定', { 为什么: 'DB_PASS=fake-1 https://u:fake-2@h/x', 发起: 读发起者({ ANIM_ROUTE: 'token=fake-3' }, ['node', '--cookie', 'sid fake-4'], dir, false), cookie: 'fake-5', db_pwd: 'fake-6' });
    expect(JSON.stringify(读调度(dir))).not.toContain('fake');
  });
});

describe('遮密补漏：文本、argv 和日志回读', () => {
  const 该遮: [string, string[], string][] = [
    ['空格头', ['x-api-key', 'fakeA'], 'x-api-key [已遮蔽]'],
    ['头值整项', ['curl', '-H', 'x-api-key fakeA fakeB', '--url', 'https://example.invalid'], 'curl -H x-api-key [已遮蔽] --url https://example.invalid'],
    ['头值单独一项', ['x-api-key', 'fakeA fakeB'], 'x-api-key [已遮蔽]'],
    ['Stripe 前缀', ['echo', 'sk_live_fake1234'], 'echo [已遮蔽]'],
    ['Slack 前缀', ['echo', 'xoxb-fake-1234'], 'echo [已遮蔽]'],
    ['curl 短密码', ['curl', '-u', 'user:x', '--silent'], 'curl -u [已遮蔽] --silent'],
    ['curl 用户名', ['curl', '-u', 'user'], 'curl -u [已遮蔽]'],
    ['mysql 用户名', ['mysql', '-u', 'root', '--host', 'localhost'], 'mysql -u [已遮蔽] --host localhost'],
    ['mysql 连写密码', ['mysql', '-pX', '-P', '3306'], 'mysql -p[已遮蔽] -P 3306'],
    ['sshpass 密码', ['sshpass', '-p', 'X', 'ssh', '-p', '22', 'host'], 'sshpass -p [已遮蔽] ssh -p 22 host'],
    ['一项里有空格和引号', ['curl', '-u', 'user:x y"z'], 'curl -u [已遮蔽]'],
    ['绝对路径', ['/usr/bin/curl', '-u', 'user:x'], '/usr/bin/curl -u [已遮蔽]'],
    ['Windows 工具路径', ['C:\\tools\\mysql.exe', '-pX'], 'C:\\tools\\mysql.exe -p[已遮蔽]'],
    ['curl 连写用户', ['curl', '-uuser:x'], 'curl -u[已遮蔽]'],
    ['mysql 连写用户', ['mysql', '-uroot', '-pX'], 'mysql -u[已遮蔽] -p[已遮蔽]'],
    ['sshpass 连写密码', ['sshpass', '-pX', 'ssh', '-p22', 'host'], 'sshpass -p[已遮蔽] ssh -p22 host'],
    ['MariaDB 登录', ['mariadb', '-u', 'root', '-pX'], 'mariadb -u [已遮蔽] -p[已遮蔽]'],
  ];
  it.each(该遮)('%s：argv 只换凭据，日志再次遮密不吞后续参数', (_名, argv, 期望) => {
    expect(遮命令(argv)).toBe(期望);
    const 发起 = 读发起者({}, argv, dir, false);
    记调度(dir, '决定', { 发起 });
    expect((读调度(dir)[0]!.发起 as { 命令: string }).命令).toBe(期望);
  });
  it.each([
    ['x-api-key fakeA', 'x-api-key [已遮蔽]'],
    ['x-api-key fakeA fakeB', 'x-api-key [已遮蔽]'],
    ['X-API-KEY\tfakeA', 'X-API-KEY\t[已遮蔽]'],
    ['curl -H "x-api-key fakeA fakeB" --silent', 'curl -H "x-api-key [已遮蔽]" --silent'],
    ['sk_live_fake1234 xoxb-fake-1234', '[已遮蔽] [已遮蔽]'],
    ['sk_live_x xoxb-x', '[已遮蔽] [已遮蔽]'],
    ['curl -u user:x --silent', 'curl -u [已遮蔽] --silent'],
    ['curl -u user', 'curl -u [已遮蔽]'],
    ['mysql -u root -pX -P 3306', 'mysql -u [已遮蔽] -p[已遮蔽] -P 3306'],
    ['sshpass -p X ssh -p 22 host', 'sshpass -p [已遮蔽] ssh -p 22 host'],
    ["curl -u 'user:x y' --silent", "curl -u '[已遮蔽]' --silent"],
    ['curl -u user:x\\ y --silent', 'curl -u [已遮蔽] --silent'],
    ['curl -u user:x; sort -u a && mkdir -p b', 'curl -u [已遮蔽]; sort -u a && mkdir -p b'],
  ])('文本与字段：%s', (原文, 期望) => {
    expect(遮密(原文)).toBe(期望);
    记调度(dir, '决定', { 命令: 原文 });
    expect(读调度(dir)[0]!.命令).toBe(期望);
  });
  it.each([
    ['x-api-key'], ['x-api-keyframe', '3'], ['x-api-key-path', '文档'], ['api-key', '说明'],
    ['anim', '调度', '记', '--为什么', '说明; mysql -pX'],
    ['echo', 'mask_live_fake1234', 'sk_lively_fake1234', 'sk_live_'],
    ['echo', 'myxoxb-fake1234', 'xoxb', 'xoxb-'],
    ['sort', '-u', 'a.txt'], ['git', 'add', '-u'], ['mkdir', '-p', '目录'], ['ssh', '-p', '22', 'host'],
    ['sort', '-uuser:x'], ['mkdir', '-pX'], ['ssh', '-p22', 'host'],
    ['curl', '-p', '--silent'], ['curl', '-u'], ['mysql', '-u'],
    ['mysql', '-p', '数据库', '-P', '3306'], ['sshpass', '-p'],
    ['sshpass', '-e', 'ssh', '-p', '22', 'host'],
    ['sshpass', '-f', '本地文件', 'ssh', '-p22', 'host'],
    ['curl', '--', '-u', 'user:x'], ['mysql', '--', '-pX'],
    ['curl', '--data', '-u', '--url', 'https://example.invalid'], ['mysql', '-e', '-pX'],
    ['anim', '调度', '记', '--为什么', '验证 -u user:x、-pX 和 ssh -p 22，不改中文参数', '--用途', '排错'],
    ['anim', '调度', '记', '--为什么', 'curl -u user:x'],
    ['anim', '调度', '记', '--为什么', 'mysql -pX'],
    ['anim', '调度', '记', '--为什么', 'sshpass -p X'],
    ['anim', '调度', '记', '--为什么', 'x-api-key-path 文档、mask_live_fake1234、myxoxb-fake1234'],
    ['anim', '调度', '记', '--为什么', 'mysql', '-u', 'root', '-pX'],
    ['printf', '%s', 'curl -u user:x'],
  ])('不误遮 argv：%j', (...argv) => {
    const 原文 = argv.join(' ');
    expect(遮命令(argv)).toBe(原文);
    记调度(dir, '决定', { 发起: 读发起者({}, argv, dir, false) });
    expect((读调度(dir)[0]!.发起 as { 命令: string }).命令).toBe(原文);
  });
  it.each([
    'x-api-key', 'x-api-keyframe 3', 'x-api-key-path 文档', 'api-key 说明',
    'mask_live_fake1234 sk_lively_fake1234 sk_live_', 'myxoxb-fake1234 xoxb xoxb-',
    'sort -u a.txt', 'git add -u', 'mkdir -p 目录', 'ssh -p 22 host',
    'sort -uuser:x', 'mkdir -pX', 'ssh -p22 host', 'curl -p --silent',
    'mysql -p 数据库 -P 3306', 'curl -u', 'mysql -u', 'sshpass -p',
    'sshpass -e ssh -p 22 host', 'sshpass -f 本地文件 ssh -p22 host',
    'curl -- -u user:x', 'mysql -- -pX', 'curl --data "-u" --url https://example.invalid', 'mysql -e "-pX"',
    'anim 调度 记 --为什么 "curl -u user:x" --用途 中文',
    'anim 调度 记 --为什么 "mysql -pX"', 'anim 调度 记 --为什么 "sshpass -p X"',
    'anim 调度 记 --为什么 说明; mysql -pX',
    'anim 调度 记 --为什么 mysql -u root -pX', 'printf "%s" "curl -u user:x"',
  ])('不误遮文本：%s', 原文 => {
    expect(遮密(原文)).toBe(原文);
    记调度(dir, '决定', { 命令: 原文 });
    expect(读调度(dir)[0]!.命令).toBe(原文);
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
