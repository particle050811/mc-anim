import { execFileSync } from 'node:child_process';
import path from 'node:path';
export type 发起者 = {
    来源: string;
    会话: string;
    路: string;
    工作区: string;
    分支: string;
    提交: string;
    cwd: string;
    pid: number;
    ppid: number;
    命令: string;
    子会话: boolean;
    代理标: string;
};
/** 日志不是凭据容器；白名单字段和命令参数都遮掉敏感值。 */
export const 遮密 = (s: string) => s.replace(/((?:[\w-]*(?:token|key|secret|password|authorization)[\w-]*)[=:\s]+)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[已遮蔽]').replace(/Bearer\s+\S+/gi, 'Bearer [已遮蔽]');
export const 读发起者 = (env: NodeJS.ProcessEnv = process.env, argv = process.argv, cwd = process.cwd(), git = true): 发起者 => {
    const 查 = (args: string[]) => { try {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
    catch {
        return '?';
    } };
    return { 来源: env.CODEX_THREAD_ID ? 'codex' : env.CLAUDE_CODE_SESSION_ID ? 'claude' : '人',
        会话: (env.CODEX_THREAD_ID ?? env.CLAUDE_CODE_SESSION_ID ?? '').slice(0, 8), 路: 遮密(env.ANIM_ROUTE ?? '').slice(0, 80),
        工作区: path.basename(cwd), cwd, 分支: git ? 查(['branch', '--show-current']) : '?', 提交: git ? 查(['rev-parse', '--short', 'HEAD']) : '?',
        pid: process.pid, ppid: process.ppid, 命令: 遮密(argv.join(' ')).slice(0, 200), 子会话: env.CLAUDE_CODE_CHILD_SESSION === '1', 代理标: 遮密(env.AI_AGENT ?? '').slice(0, 80) };
};
