import fs from 'node:fs';
const callbacks = new Set<(exitCode: number, signal?: string) => void>();
let installed = false, cleaned = false;
export const signalCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;
export const finalize = (exitCode: number, signal?: string) => {
    if (cleaned)
        return;
    cleaned = true;
    for (const fn of [...callbacks].reverse()) {
        try {
            fn(exitCode, signal);
        }
        catch (e) {
            console.error(`!! 收尾失败：${(e as Error).message}`);
        }
    }
};
export const gateRecordKilled = (signal: keyof typeof signalCodes) => finalize(signalCodes[signal], signal);
export const registerCleanup = (fn: (exitCode: number, signal?: string) => void) => {
    callbacks.add(fn);
    if (!installed) {
        installed = true;
        process.on('exit', code => finalize(code));
        for (const sig of Object.keys(signalCodes) as (keyof typeof signalCodes)[])
            process.on(sig, () => { gateRecordKilled(sig); process.exit(signalCodes[sig]); });
    }
    return () => { callbacks.delete(fn); };
};
export const registerTempFile = (file: string) => registerCleanup(() => fs.rmSync(file, { force: true }));
