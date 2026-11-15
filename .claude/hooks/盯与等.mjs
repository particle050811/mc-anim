// Claude Code 钩子：守 docs/调度.md「盯与等」。用法 node 盯与等.mjs 前|后，stdin 是钩子 JSON。
// 前（PreToolUse Bash）：拦 pgrep -f / pkill -f 和手写 until/while + sleep 等待循环。
//   pgrep -f 会匹配到外层 shell 自己的命令行（里面也写着那串字），循环永远停不下来；pkill -f 会杀掉自己。
//   用户 11-03 发现后台挂了两个 2.5 小时停不下来的循环、渲染卡在资源闸 13 分钟没人管，说「把那个 bug 修复一下 以后不要再出现这种情况」。
// 后（PostToolUse Bash）：后台开了 anim 重活、又没挂 盯，就提醒挂上：资源闸告警只写渲染日志的 stderr，不挂 盯 没人知道。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const segmentKey = process.argv[2];
const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
const command = String(payload.tool_input?.command ?? '');
const emit = (o) => process.stdout.write(JSON.stringify(o));

const alternatives = [
  '等进程结束：`./anim sched wait --pid <pid>`（前台，默认最长 540 秒）或 `kill -0 <pid>` 判活；',
  '等 anim 任务：`./anim sched watch --task \'#<pid>\'`；',
  '等文件、闸空、内存：`./anim sched wait --file <路径> | --gate-empty | --memory <n>`；',
  '盯日志里的某行：用 Monitor 工具（tail -f | grep --line-buffered，过滤要连失败、告警一起盖住）。',
].join('\n');

/** 去掉 heredoc 正文和引号里的字：提交说明、文档里写到 pgrep -f、until 这些字不算 */
const stripLiterals = (s) =>
  s
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, ' ')
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\[\s\S])*"/g, '""');

if (segmentKey === '前') {
  const stripped = stripLiterals(command);
  const reasons = [];
  if (/\bp(?:grep|kill)\b[^|;&\n]*\s-[A-Za-z]*f/.test(stripped))
    reasons.push('pgrep -f / pkill -f 会匹配到这条命令外层 shell 自己的命令行（里面也写着同一串字）：拿它判「进程没了」永远不成立，pkill 会把自己杀掉。');
  if (/\b(?:until|while)\b[\s\S]*?\bdo\b[\s\S]*?\bsleep\b[\s\S]*?\bdone\b/.test(stripped))
    reasons.push('不要手写 until/while + sleep 的等待循环（docs/调度.md「盯与等」）：条件写偏就永远停不下来，资源闸告警也盖不住。');
  if (reasons.length)
    emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${reasons.join('\n')}\n改用：\n${alternatives}` } });
} else if (segmentKey === '后') {
  const heavyJob = /(?:^|[\s;&|(])(?:\S*\/)?anim(?:\.cmd)?\s+(?:render|film|still|bench|verify|world\s+(?:bake|pregen|transcode)|extract|mcai)\b/;
  if (payload.tool_input?.run_in_background && heavyJob.test(command)) {
    let alreadyWatching = false;
    try {
      alreadyWatching = /cli\/main\.ts sched watch/.test(execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }));
    } catch {}
    if (!alreadyWatching)
      emit({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext:
            '后台开了 anim 重活，现在还没有 盯 挂着。马上用 Monitor 挂 `./anim sched watch --max-sec 1740`（timeout_ms 1800000），每次收到通知、处理完再挂。' +
            '资源闸等内存、排队长、「请主 Agent 决定」这类告警只写进渲染日志的 stderr，不挂 盯 就没人知道，任务会一直卡在闸前（docs/调度.md「盯与等」）。',
        },
      });
  }
}
