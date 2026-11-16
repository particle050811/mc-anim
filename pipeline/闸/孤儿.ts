import { execFileSync } from 'node:child_process';
export type OrphanProcess = {
    pid: number;
    ppid: number;
    rss: number;
    command: string;
};
/** 浏览器目录（数据根 cache/浏览器/，或 Remotion 默认的 node_modules 下）+ headless shell + ppid 三项同时满足，不碰 Playwright 或普通 Chrome。 */
export const findOrphans = (text: string): OrphanProcess[] => text.split('\n').flatMap(l => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(l);
    if (!m)
        return [];
    const p = { pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), command: m[4]! };
    return p.ppid === 1 && /(?:\/node_modules\/(?:\.remotion|@remotion)|\/cache\/浏览器)\/[^\s]*chrome-headless-shell/.test(p.command) && !/playwright/i.test(p.command) ? [p] : [];
});
export const 读进程 = () => { try {
    return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
catch {
    return '';
} };
export const clearOrphans = (text = 读进程(), kill = (pid: number) => process.kill(pid, 'SIGTERM')) => {
    const cleared: OrphanProcess[] = [];
    for (const p of findOrphans(text)) {
        try {
            kill(p.pid);
            cleared.push(p);
        }
        catch { /* 进程已退出 */ }
    }
    return cleared;
};
