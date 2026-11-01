import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { 重试 } from './锁.ts';
export const 读JSON = <T>(file: string): T | null => { try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}
catch {
    return null;
} };
/** 临时文件不放票目录：旧轮询会把不认识的名字当死票删除。 */
export const 写JSON = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(path.dirname(file)), `.anim-${process.pid}-${randomUUID()}.tmp`);
    try {
        fs.writeFileSync(tmp, JSON.stringify(value) + '\n');
        重试(() => fs.renameSync(tmp, file));
    }
    finally {
        fs.rmSync(tmp, { force: true });
    }
};
export const 列文件 = (dir: string) => { try {
    return fs.readdirSync(dir);
}
catch {
    return [];
} };
const 提示过 = new Map<string, number>();
/** 监控类写入（心跳、监测、票状态、告警）失败绝不能杀掉排队或渲染；同名一分钟只说一行。 */
export const 只提示 = (名: string, fn: () => void) => {
    try {
        fn();
    }
    catch (err) {
        const now = Date.now();
        if (now - (提示过.get(名) ?? 0) < 60000)
            return;
        提示过.set(名, now);
        console.error(`!! ${名}失败（不影响任务）：${(err as Error).message}`);
    }
};
