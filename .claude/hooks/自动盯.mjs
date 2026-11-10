// Claude Code 钩子：替主 Agent 一直挂着 `anim 调度 盯`（用户 11-10 定：「你自己写一个 hook，自动挂上……不要靠模型自己去约束」）。
// settings.json 里以 asyncRewake 挂在 SessionStart、UserPromptSubmit、PostToolUse 上：后台跑，退出码 2 时 Claude Code 把 stderr 交给模型并叫醒它。
// 一个会话只留一只（临时目录里一个 pid 文件）；已经有就立刻退 0。盯 到点（124）自己重挂，报了事就退 2，下一次工具调用或用户发话再起一只。
// 子 Agent 的工具调用不起：告警归主 Agent 管。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let 入 = {};
try {
  入 = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch {}
if (入.agent_id || 入.agent_type) process.exit(0);
const 会话 = String(入.session_id ?? process.env.CLAUDE_CODE_SESSION_ID ?? '');
if (!会话) process.exit(0);
const 根 = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const 活 = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
const 号 = path.join(os.tmpdir(), `anim-自动盯-${会话}.pid`);
// O_EXCL 抢号：同一刻几个钩子一起起，只有一只留下
const 抢 = () => {
  try {
    fs.writeFileSync(号, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
};
if (!抢()) {
  const 旧 = Number(fs.readFileSync(号, 'utf8').trim());
  if (旧 > 0 && 活(旧)) process.exit(0);
  fs.rmSync(号, { force: true });
  if (!抢()) process.exit(0);
}
const 收 = () => {
  try {
    if (fs.readFileSync(号, 'utf8').trim() === String(process.pid)) fs.rmSync(号);
  } catch {}
};
process.on('exit', 收);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => process.exit(0));

const 主 = Number(process.env.CLAUDE_PID) || process.ppid;
const anim = path.join(根, process.platform === 'win32' ? 'anim.cmd' : 'anim');
while (活(主)) {
  // 短挂：Claude Code 退了最多多留这么久（盯 只认自己的父进程，也就是本脚本）
  const r = spawnSync(anim, ['调度', '盯', '--最长', '300'], { cwd: 根, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_SESSION_ID: 会话 }, shell: process.platform === 'win32' });
  const 话 = (r.stdout ?? '').trim();
  if (r.status === 0 && 话) {
    process.stderr.write(`调度告警（钩子自动盯，不用自己挂 Monitor）：${话}\n看全貌：./anim 调度 --一行；处理完接着干，下一次工具调用钩子会自动再挂。\n`);
    process.exitCode = 2;
    break;
  }
  // 124 = 到点，接着挂；别的（anim 起不来、用法错）不重试，免得空转
  if (r.status !== 124) break;
}
