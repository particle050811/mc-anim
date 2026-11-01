// 调度快路径不加载 Remotion、作品注册和全命令表。
if (process.argv[2] === '调度') {
    const { 跑调度 } = await import('../闸/命令.ts');
    const { 用法错误 } = await import('./参数.ts');
    try {
        process.exitCode = await 跑调度(process.argv.slice(3));
    }
    catch (e) {
        console.error((e as Error).message);
        process.exitCode = e instanceof 用法错误 ? 2 : 1;
    }
}
else
    await import('./全部命令.ts');
export {};
