import fs from 'node:fs';
const 回调 = new Set<(码: number, 信号?: string) => void>();
let 已装 = false, 已收 = false;
export const 信号码 = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;
export const 收尾 = (码: number, 信号?: string) => {
    if (已收)
        return;
    已收 = true;
    for (const fn of [...回调].reverse()) {
        try {
            fn(码, 信号);
        }
        catch (e) {
            console.error(`!! 收尾失败：${(e as Error).message}`);
        }
    }
};
export const 闸记被杀 = (信号: keyof typeof 信号码) => 收尾(信号码[信号], 信号);
export const 登记收尾 = (fn: (码: number, 信号?: string) => void) => {
    回调.add(fn);
    if (!已装) {
        已装 = true;
        process.on('exit', code => 收尾(code));
        for (const sig of Object.keys(信号码) as (keyof typeof 信号码)[])
            process.on(sig, () => { 闸记被杀(sig); process.exit(信号码[sig]); });
    }
    return () => { 回调.delete(fn); };
};
export const 登记临时文件 = (file: string) => 登记收尾(() => fs.rmSync(file, { force: true }));
