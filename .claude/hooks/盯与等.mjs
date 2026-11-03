// Claude Code 钩子：守 docs/调度.md「盯与等」。用法 node 盯与等.mjs 前|后，stdin 是钩子 JSON。
// 前（PreToolUse Bash）：拦 pgrep -f / pkill -f 和手写 until/while + sleep 等待循环。
//   pgrep -f 会匹配到外层 shell 自己的命令行（里面也写着那串字），循环永远停不下来；pkill -f 会杀掉自己。
//   用户 11-03 发现后台挂了两个 2.5 小时停不下来的循环、渲染卡在资源闸 13 分钟没人管，说「把那个 bug 修复一下 以后不要再出现这种情况」。
// 后（PostToolUse Bash）：后台开了 anim 重活、又没挂 盯，就提醒挂上：资源闸告警只写渲染日志的 stderr，不挂 盯 没人知道。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const 段 = process.argv[2];
const 入 = JSON.parse(readFileSync(0, 'utf8') || '{}');
const 命令 = String(入.tool_input?.command ?? '');
const 出 = (o) => process.stdout.write(JSON.stringify(o));

const 替代 = [
  '等进程结束：`./anim 调度 等 --pid <pid>`（前台，默认最长 540 秒）或 `kill -0 <pid>` 判活；',
  '等 anim 任务：`./anim 调度 盯 --任务 \'#<pid>\'`；',
  '等文件、闸空、内存：`./anim 调度 等 --文件 <路径> | --闸空 | --内存 <n>`；',
  '盯日志里的某行：用 Monitor 工具（tail -f | grep --line-buffered，过滤要连失败、告警一起盖住）。',
].join('\n');

/** 去掉 heredoc 正文和引号里的字：提交说明、文档里写到 pgrep -f、until 这些字不算 */
const 去字面 = (s) =>
  s
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, ' ')
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\[\s\S])*"/g, '""');

if (段 === '前') {
  const 码 = 去字面(命令);
  const 原因 = [];
  if (/\bp(?:grep|kill)\b[^|;&\n]*\s-[A-Za-z]*f/.test(码))
    原因.push('pgrep -f / pkill -f 会匹配到这条命令外层 shell 自己的命令行（里面也写着同一串字）：拿它判「进程没了」永远不成立，pkill 会把自己杀掉。');
  if (/\b(?:until|while)\b[\s\S]*?\bdo\b[\s\S]*?\bsleep\b[\s\S]*?\bdone\b/.test(码))
    原因.push('不要手写 until/while + sleep 的等待循环（docs/调度.md「盯与等」）：条件写偏就永远停不下来，资源闸告警也盖不住。');
  if (原因.length)
    出({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${原因.join('\n')}\n改用：\n${替代}` } });
} else if (段 === '后') {
  const 重活 = /(?:^|[\s;&|(])(?:\S*\/)?anim(?:\.cmd)?\s+(?:render|film|still|bench|verify|world\s+(?:bake|pregen|转码)|extract|mcai)\b/;
  if (入.tool_input?.run_in_background && 重活.test(命令)) {
    let 已挂 = false;
    try {
      已挂 = /cli\/main\.ts 调度 盯/.test(execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }));
    } catch {}
    if (!已挂)
      出({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext:
            '后台开了 anim 重活，现在还没有 盯 挂着。马上用 Monitor 挂 `./anim 调度 盯 --最长 1740`（timeout_ms 1800000），每次收到通知、处理完再挂。' +
            '资源闸等内存、排队长、「请主 Agent 决定」这类告警只写进渲染日志的 stderr，不挂 盯 就没人知道，任务会一直卡在闸前（docs/调度.md「盯与等」）。',
        },
      });
  }
}
