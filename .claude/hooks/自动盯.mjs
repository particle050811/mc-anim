// Claude Code 钩子：替主 Agent 一直挂着 `anim 调度 盯`（用户 11-10 定：「你自己写一个 hook，自动挂上……不要靠模型自己去约束」）。
// settings.json 里以 asyncRewake 挂在 UserPromptSubmit、PostToolUse 上（SessionStart 不认 asyncRewake，会同步等它退出，新会话卡在「Running start-up hooks」，不能挂）：后台跑，退出码 2 时 Claude Code 把 stderr 交给模型并叫醒它。
// 一个会话只留一只（临时目录里一个 pid 文件）；已经有就立刻退 0。盯 到点（124）自己重挂，报了事就退 2，下一次工具调用或用户发话再起一只。
// 子 Agent 的工具调用不起：告警归主 Agent 管。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let payload = {};
try {
  payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch {}
if (payload.agent_id || payload.agent_type) process.exit(0);
// 非交互的 claude -p 也不起（用户 11-14 定）：没人会被叫醒；而且 -p 会同步等 UserPromptSubmit 钩子，没告警就一直挂着，
// 有告警退 2 又会拦下唯一那条提示词（11-14 主会话用 -p 跑 Fable 5.2，卡了 85 分钟没出一个字）。
// CLAUDE_CODE_ENTRYPOINT 从父会话继承，分不出 -p，只能往上看进程命令行；Windows 没有 ps，照旧挂。
const nonInteractive = () => {
  let pid = Number(process.env.CLAUDE_PID) || process.ppid;
  for (let i = 0; i < 4 && pid > 1; i++) {
    const r = spawnSync('ps', ['-o', 'ppid=,args=', '-p', String(pid)], { encoding: 'utf8' });
    const m = (r.stdout ?? '').trim().match(/^(\d+)\s+(.*)$/s);
    if (!m) return false;
    if (/^claude(\.exe)?$/.test(path.basename(m[2].split(/\s/)[0] ?? ''))) return /\s(-p|--print)(\s|$)/.test(m[2]);
    pid = Number(m[1]);
  }
  return false;
};
if (process.platform !== 'win32' && nonInteractive()) process.exit(0);
const sessionId = String(payload.session_id ?? process.env.CLAUDE_CODE_SESSION_ID ?? '');
if (!sessionId) process.exit(0);
const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
const pidFile = path.join(os.tmpdir(), `anim-自动盯-${sessionId}.pid`);
// 静音：告警已按归属分发（docs/调度.md「盯与等」），但主人没挂 盯 时会兜底广播；闲着的会话被这种广播反复叫醒时，主 Agent 放一个 .静音 文件就不再挂（被叫醒本身算一次用户发话，不这样停不下来）；开工前删掉。
if (fs.existsSync(pidFile.replace(/\.pid$/, '.静音'))) process.exit(0);
// O_EXCL 抢号：同一刻几个钩子一起起，只有一只留下
const claim = () => {
  try {
    fs.writeFileSync(pidFile, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
};
if (!claim()) {
  const oldPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  if (oldPid > 0 && isAlive(oldPid)) process.exit(0);
  fs.rmSync(pidFile, { force: true });
  if (!claim()) process.exit(0);
}
const onExit = () => {
  try {
    if (fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) fs.rmSync(pidFile);
  } catch {}
};
process.on('exit', onExit);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => process.exit(0));

const rootPid = Number(process.env.CLAUDE_PID) || process.ppid;
const entryFile = path.join(projectRoot, 'pipeline', 'cli', 'main.ts');
while (isAlive(rootPid)) {
  // 短挂：Claude Code 退了最多多留这么久（盯 只认自己的父进程，也就是本脚本）
  const r = spawnSync(process.execPath, [entryFile, '调度', '盯', '--最长', '300'], { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId } });
  const output = (r.stdout ?? '').trim();
  if (r.status === 0 && output) {
    process.stderr.write(`调度告警（钩子自动盯，不用自己挂 Monitor）：${output}\n看全貌：./anim 调度 --一行；处理完接着干，下一次工具调用钩子会自动再挂。\n`);
    process.exitCode = 2;
    break;
  }
  // 124 = 到点，接着挂；别的（anim 起不来、用法错）不重试，免得空转
  if (r.status !== 124) break;
}
