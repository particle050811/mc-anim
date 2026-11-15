// 遮密和行超长：测试值都是假的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSchedulerEvents, recordSchedulerEvent } from './调度日志.ts';
import { readCaller, maskSecret, maskCommand } from './发起者.ts';
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-遮密-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('遮密', () => {
  it('引号没配对也遮', () => {
    expect(maskSecret('Authorization: "fake abc')).not.toContain('fake');
    expect(maskSecret('token="fake')).not.toContain('fake');
  });
  it('一长串命中的词不会卡住', () => {
    const startMs = performance.now();
    maskSecret('key-'.repeat(50000));
    expect(performance.now() - startMs).toBeLessThan(1000);
  });
  it.each([
    ['Authorization: Bearer fake-live-abc123'], ['Authorization: token fake_abc'], ['authorization=Basic fake abc'],
    ['curl -H "Authorization: Bearer fake-1" https://x.y'], ['Cookie: sid=fake-1; other=fake-2'], ['--cookie=sid=fake-1'],
    ['https://oauth2:fake-1@github.com/a'], ['git clone ssh://me:fake-1@host/x'], ['PASSWD=fake-1'], ['DB_PASS=fake-1'], ['MYSQL_PWD=fake-1'], ['pass=fake-1'], ['pwd: fake-1'], ['--auth=fake-1'], ['--auth fake-1'],
    ['credentials=fake-1'], ['--credentials fake-1'], ['aws_credential: fake-1'], ['API_KEY=fake-1'], ['x-api-key: fake-1'], ['apikey=fake-1'], ['--key fake-1'], ['?token=fake-1&x=1'], ['{"password":"fake-1"}'], ['Bearer fake-1'],
    ['Authorization: Bearer "fake-1"'], ["Authorization: Bearer 'fake-1'"], ['Authorization: Bearer "fake-1 fake-2"'], ['Authorization: token "fake-1"'], ['Authorization: "Bearer fake-1"'],
    ['Cookie: sid="fake-1"; o=fake-2'], ["Set-Cookie: sid='fake-1'; Path=/"], ['x-api-key: fake-1 fake-2'], ['X-Auth-Token: "fake-1" fake-2'], ['Bearer "fake-1 fake-2"'], ['GH_TOKEN="fake-1 fake-2'], ['https://u:fake 1@h/x'],
  ])('%s', s => { expect(maskSecret(s)).not.toContain('fake'); });
  it('长得像密钥的值，没有名字也遮', () => { expect(maskSecret('用 sk-fake0000 和 ghp_fake0000 登录')).toBe('用 [已遮蔽] 和 [已遮蔽] 登录'); });
  it.each([['token 满了'], ['pass 3 通过'], ['bypass=1'], ['author=张三'], ['keyframe=3'], ['monkey=3'], ['--keyframe 3'], ['task-1234567'], ['key-art/图.png'], ['负载1.0/10 闸40% 压力1 持锁#1 排队0'], ['--why auth 失败']])('不误遮 %s', s => { expect(maskSecret(s)).toBe(s); });
  it('argv 逐项遮：值带空格也整项遮掉', () => {
    expect(maskCommand(['anim', '--password', 'fake two words', '--to', '3'])).toBe('anim --password [已遮蔽] --to 3');
    expect(maskCommand(['--password=fake two words', 'PASSWD=fake two'])).toBe('--password=[已遮蔽] PASSWD=[已遮蔽]');
    expect(maskCommand(['-H', 'Authorization: Bearer fake abc'])).toBe('-H Authorization: [已遮蔽]');
    expect(maskCommand(['-H', 'Authorization: Bearer "fake abc"', '--to', '3'])).toBe('-H Authorization: [已遮蔽] --to 3');
    expect(maskCommand(['-H', 'Authorization: Bearer fake=abc'])).toBe('-H Authorization: [已遮蔽]');
    expect(maskCommand(['-H', 'Cookie: sid="fake"; o=fake', '--header', 'x-api-key: fake two'])).toBe('-H Cookie: [已遮蔽] --header x-api-key: [已遮蔽]');
    expect(maskCommand(['--why', 'pass 3: 通过', 'https://a.b/c:d', 'author: 张三'])).toBe('--why pass 3: 通过 https://a.b/c:d author: 张三');
  });
  it('进日志的字段和键都遮；发起者的命令走逐项遮', () => {
    recordSchedulerEvent(dir, '决定', { 为什么: 'DB_PASS=fake-1 https://u:fake-2@h/x', 发起: readCaller({ ANIM_ROUTE: 'token=fake-3' }, ['node', '--cookie', 'sid fake-4'], dir, false), cookie: 'fake-5', db_pwd: 'fake-6' });
    expect(JSON.stringify(readSchedulerEvents(dir))).not.toContain('fake');
  });
});

describe('遮密补漏：文本、argv 和日志回读', () => {
  const maskCases: [string, string[], string][] = [
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
  it.each(maskCases)('%s：argv 只换凭据，日志再次遮密不吞后续参数', (caseName, argv, expected) => {
    expect(maskCommand(argv)).toBe(expected);
    const initiator = readCaller({}, argv, dir, false);
    recordSchedulerEvent(dir, '决定', { 发起: initiator });
    expect((readSchedulerEvents(dir)[0]!.发起 as { 命令: string }).命令).toBe(expected);
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
  ])('文本与字段：%s', (raw, expected) => {
    expect(maskSecret(raw)).toBe(expected);
    recordSchedulerEvent(dir, '决定', { 命令: raw });
    expect(readSchedulerEvents(dir)[0]!.命令).toBe(expected);
  });
  it.each([
    ['x-api-key'], ['x-api-keyframe', '3'], ['x-api-key-path', '文档'], ['api-key', '说明'],
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
    ['anim', 'sched', 'note', '--why', '验证 -u user:x、-pX 和 ssh -p 22，不改中文参数', '--用途', '排错'],
    ['anim', 'sched', 'note', '--why', 'x-api-key-path 文档、mask_live_fake1234、myxoxb-fake1234'],
    ['anim', 'sched', 'note', '--why', 'mysql', '-u', 'root', '-pX'],
    ['printf', '%s', 'curl -u user:x'],
  ])('不误遮 argv：%j', (...argv) => {
    const raw = argv.join(' ');
    expect(maskCommand(argv)).toBe(raw);
    recordSchedulerEvent(dir, '决定', { 发起: readCaller({}, argv, dir, false) });
    expect((readSchedulerEvents(dir)[0]!.发起 as { 命令: string }).命令).toBe(raw);
  });
  it.each([
    'x-api-key', 'x-api-keyframe 3', 'x-api-key-path 文档', 'api-key 说明',
    'mask_live_fake1234 sk_lively_fake1234 sk_live_', 'myxoxb-fake1234 xoxb xoxb-',
    'sort -u a.txt', 'git add -u', 'mkdir -p 目录', 'ssh -p 22 host',
    'sort -uuser:x', 'mkdir -pX', 'ssh -p22 host', 'curl -p --silent',
    'mysql -p 数据库 -P 3306', 'curl -u', 'mysql -u', 'sshpass -p',
    'sshpass -e ssh -p 22 host', 'sshpass -f 本地文件 ssh -p22 host',
    'curl -- -u user:x', 'mysql -- -pX', 'curl --data "-u" --url https://example.invalid', 'mysql -e "-pX"',
    'anim sched note --why mysql -u root -pX', 'printf "%s" "curl -u user:x"',
  ])('不误遮文本：%s', raw => {
    expect(maskSecret(raw)).toBe(raw);
    recordSchedulerEvent(dir, '决定', { 命令: raw });
    expect(readSchedulerEvents(dir)[0]!.命令).toBe(raw);
  });
});

describe('行超长', () => {
  const makeInitiator = () => ({ ...readCaller({}, ['node', 'anim', 'sched', 'note', '字'.repeat(180)], '/数据/'.repeat(30), false) });
  it('决定、为什么 各 400 字加完整 谁、发起：全文保留，只丢快照', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    recordSchedulerEvent(dir, '决定', { 谁: makeInitiator(), 发起: makeInitiator(), 看到: { 人工: '看'.repeat(50), 摘要: '负载1', 队: Array(3).fill({ 票: '票'.repeat(100) }) }, 决定: '决'.repeat(400), 为什么: '因'.repeat(400), 机: { 负载: 1 } });
    const [record] = readSchedulerEvents(dir);
    expect(errorSpy.mock.calls.flat().join()).toContain('已压缩');
    errorSpy.mockRestore();
    expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThan(4096);
    expect(record).toMatchObject({ 决定: '决'.repeat(400), 为什么: '因'.repeat(400), 截断: true, 看到: `${'看'.repeat(50)}；负载1` });
    expect((record!.谁 as { pid: number }).pid).toBe(process.pid);
  });
  it('还放不下就截前缀，不落到只剩时间的最小行', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const longTextLength = '字'.repeat(400);
    recordSchedulerEvent(dir, '决定', { 谁: makeInitiator(), 发起: makeInitiator(), 看到: { 人工: longTextLength, 摘要: longTextLength }, 决定: longTextLength, 为什么: longTextLength });
    recordSchedulerEvent(dir, '决定', { 谁: makeInitiator(), 决定: '决', 为什么: '因', extraFields: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['字段' + i, longTextLength])) });
    errorSpy.mockRestore();
    const [firstRow, secondRow] = readSchedulerEvents(dir);
    for (const record of [firstRow!, secondRow!]) {
      expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThan(4096);
      expect(record.谁).toBeTruthy();
      expect(String(record.决定).startsWith(record === firstRow ? '字' : '决')).toBe(true);
    }
    expect(String(firstRow!.决定)).toMatch(/…$/);
    expect(secondRow!.其他).toBeUndefined();
  });
});


describe('登录选项返修', () => {
  it.each([
    [['curl', '--user', 'user:fake'], 'curl --user [已遮蔽]'],
    [['curl', '--user=user:fake'], 'curl --user=[已遮蔽]'],
    [['curl', '-U', 'user:fake'], 'curl -U [已遮蔽]'],
    [['curl', '-Uuser:fake'], 'curl -U[已遮蔽]'],
    [['curl', '--proxy-user', 'user:fake'], 'curl --proxy-user [已遮蔽]'],
    [['curl', '--proxy-user=user:fake'], 'curl --proxy-user=[已遮蔽]'],
    [['mysql', '--user', 'fake'], 'mysql --user [已遮蔽]'],
    [['mysql', '--user=fake'], 'mysql --user=[已遮蔽]'],
    ...['-su', '-sSLu', '-ku', '-vu', '-fsSLu', '-sU'].map(item => [
      ['curl', item, 'user:fake', 'https://h'], `curl ${item} [已遮蔽] https://h`,
    ]),
    [['curl', '-sSuuser:fake'], 'curl -sSu[已遮蔽]'],
    [['curl', '-u', '张三:fake'], 'curl -u [已遮蔽]'],
  ] as [string[], string][])('文本和 argv：%j', (argv, expected) => {
    expect(maskCommand(argv)).toBe(expected);
    expect(maskSecret(argv.join(' '))).toBe(expected);
  });
  it.each([
    ['curl', '--user-agent', 'demo'], ['curl', '--user-agent=demo'], ['mysql', '-U', '数据库'],
    ['curl', '-XPOST'], ['curl', '-dfoo-u'], ['curl', '-fsSL', '-o', 'a'],
    ['curl', '-F', '-u=1'], ['curl', '-b', '-u', 'x'], ['curl', '-w', '-u', 'x'],
    ['curl', '-u', '报错，改用', '--user', '也不行'], ['curl', '的', '-u', '参数要遮'],
    ['mysql', '-u', '写错了，重试'], ['sshpass', '-p', '的值要遮'],
  ])('选项正文和中文说明不遮：%j', (...argv) => {
    expect(maskCommand(argv)).toBe(argv.join(' '));
    expect(maskSecret(argv.join(' '))).toBe(argv.join(' '));
  });
});


describe('生产路径与文本命令边界返修', () => {
  it.each([
    ['curl -u user:fake', 'curl -u [已遮蔽]'],
    ['curl -u 张三:fake', 'curl -u [已遮蔽]'],
    ['mysql -pfake', 'mysql -p[已遮蔽]'],
    ['sshpass -p fake', 'sshpass -p [已遮蔽]'],
    ['说明; mysql -pfake', '说明; mysql -p[已遮蔽]'],
    ['curl -u 报错，改用 --user 也不行', 'curl -u 报错，改用 --user 也不行'],
    ['curl 的 -u 参数要遮', 'curl 的 -u 参数要遮'],
    ['mysql -u 写错了，重试', 'mysql -u 写错了，重试'],
    ['sshpass -p 的值要遮', 'sshpass -p 的值要遮'],
  ])('node argv → 读发起者 → 遮密 → 日志回读：%s', (raw, expected) => {
    const argv = ['/usr/local/bin/node', '/x/pipeline/cli/main.ts', 'sched', 'note', '--why', raw, '--decision', '排错'];
    const initiator = readCaller({}, argv, dir, false);
    const command = [...argv.slice(0, 5), expected, ...argv.slice(6)].join(' ');
    expect(initiator.命令).toBe(command);
    expect(maskSecret(initiator.命令)).toBe(command);
    recordSchedulerEvent(dir, '决定', { 发起: initiator, 为什么: raw });
    const record = readSchedulerEvents(dir)[0]!;
    expect((record.发起 as { 命令: string }).命令).toBe(command);
    expect(record.为什么).toBe(expected);
    expect(JSON.stringify(record)).not.toContain('fake');
    expect(maskCommand(['anim', '--why', raw])).toBe(`anim --why ${expected}`);
    expect(maskSecret(`anim --why "${raw}"`)).toBe(`anim --why "${expected}"`);
  });
  it.each([
    '6-斩娜迦', 'curl -u 张三', 'mysql -p中文', 'mysql -u root -pfake',
    '验证 -u user:fake、-pfake 和 ssh -p 22，不改中文参数',
    '/data/curl/-u/user:fake.png', '/data/mysql -pfake', 'C:\\data\\mysql\\-pfake.png',
  ])('不扩大 anim 参数的识别范围：%s', params => {
    const raw = `anim --why ${params}`;
    expect(maskCommand(['anim', '--why', params])).toBe(raw);
    expect(maskSecret(raw)).toBe(raw);
  });
  it.each([
    ['C:\\tools\\curl.exe -u user:fake', 'C:\\tools\\curl.exe -u [已遮蔽]'],
    ['C:\\tools\\mysql.exe -pfake', 'C:\\tools\\mysql.exe -p[已遮蔽]'],
    ['"C:\\tools\\curl.exe" -u user:fake', '"C:\\tools\\curl.exe" -u [已遮蔽]'],
    ['\\curl -u user:fake', '\\curl -u [已遮蔽]'],
    ['cu"r"l -u user:fake', 'cu"r"l -u [已遮蔽]'],
    ...['env ', 'sudo ', 'A=1 ', 'env A=1 ', 'sudo env A=1 ', 'time ', 'nohup ', 'command ', 'exec ', 'echo hi | ', 'cd /tmp && ', 'true; ', '\n', '; '].map(commandPrefix => [
      `${commandPrefix}curl -u user:fake`, `${commandPrefix}curl -u [已遮蔽]`,
    ]),
    ['sudo sshpass -p fake ssh host', 'sudo sshpass -p [已遮蔽] ssh host'],
    ['true; mysql -pfake', 'true; mysql -p[已遮蔽]'],
    ['curl -u user:fake || mysql -pfake', 'curl -u [已遮蔽] || mysql -p[已遮蔽]'],
  ])('工具路径、前缀和后续命令：%s', (raw, expected) => {
    expect(maskSecret(raw)).toBe(expected);
  });
  it.each([
    ['mysqldump', '-pfake'], ['mysqladmin', '-pfake'], ['mariadb-dump', '-pfake'],
    ['sshpass', '-P', 'assword:', '-p', 'fake', 'ssh', 'host'],
    ['SSHPASS=fake', 'sshpass', '-e', 'ssh', 'host'],
  ])('同族工具：%j', (...argv) => {
    expect(maskCommand(argv)).toBe(argv.join(' ').replace('fake', '[已遮蔽]'));
    expect(maskSecret(argv.join(' '))).toBe(argv.join(' ').replace('fake', '[已遮蔽]'));
  });
  it.each(['sshpass: 没装', 'sshpass: command not found', 'sshpass 没装', 'sshpass=fake'])('工具说明不是敏感词：%s', s => {
    expect(maskSecret(s)).toBe(s);
    expect(maskCommand(['anim', '--why', s])).toBe(`anim --why ${s}`);
  });
});


describe('截断与空格头返修', () => {
  it.each(['token', 'Cookie'])('4000 字截断不能留下 URL 密码半截：%s', secretKind => {
    const valuePrefix = secretKind === 'token' ? 'token="' : 'Cookie: ';
    const suffix = secretKind === 'token' ? '" ' : '\n';
    const url = 'https://u:fakeTAIL@h';
    const raw = valuePrefix + 'a'.repeat(4000 - valuePrefix.length - suffix.length - 'https://u:fake'.length) + suffix + url;
    expect(raw.slice(0, 4000)).toMatch(/fake$/);
    expect(maskSecret(raw)).toBe(secretKind === 'token' ? 'token=[已遮蔽] ' : 'Cookie: [已遮蔽]\n');
    expect(maskCommand(['anim', '--why', raw])).not.toContain('fake');
  });
  it('普通 URL 仍遮，argv 长项丢掉被切开的 URL，不做超大输入实验', () => {
    expect(maskSecret('https://u:fake@h')).toBe('https://[已遮蔽]@h');
    const raw = 'a'.repeat(3986) + ' https://u:fakeTAIL@h';
    expect(maskCommand(['anim', '--why', raw])).toBe('anim --why ' + 'a'.repeat(3986) + ' ');
  });
  it.each([
    'x-api-key 缺失，换头', '缺 x-api-key 头', 'x-api-key; 下一条',
    '缺 x-api-key\n第二行说明', 'x-api-key\n第二行说明',
    'echo x-api-key | grep foo', 'echo x-api-key ; true', 'x-api-key | grep foo',
  ])('中文说明和分隔符不遮：%s', s => {
    expect(maskSecret(s)).toBe(s);
    expect(maskCommand(['anim', '--why', s])).toBe(`anim --why ${s}`);
    recordSchedulerEvent(dir, '决定', { 发起: readCaller({}, ['node', '/x/main.ts', '--why', s], dir, false), 为什么: s });
    const record = readSchedulerEvents(dir)[0]!;
    expect(record.为什么).toBe(s);
    expect((record.发起 as { 命令: string }).命令).toBe(`node /x/main.ts --why ${s}`);
  });
  it.each(['x-api-key fakeA 是测试值', '缺 x-api-key fakeA 是测试值', 'x-api-key "fakeA 是测试值"'])('只看第一个值词：%s', s => {
    expect(maskSecret(s)).not.toContain('fakeA');
    expect(maskCommand(['anim', '--why', s])).not.toContain('fakeA');
  });
});
