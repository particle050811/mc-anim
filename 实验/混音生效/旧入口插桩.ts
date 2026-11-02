import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
// 重现旧错配时传入 894cdab 的代码根；默认使用当前检出，不能把修后结果称为旧入口。
const 根 = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '../..'));
const require = createRequire(path.join(根, 'package.json'));
const { 固定混音顺序 } = await import(根 + '/pipeline/渲/混音顺序.ts');
固定混音顺序();
const 模块 = require(path.join(path.dirname(require.resolve('@remotion/renderer')), 'assets/inline-audio-mixing.js'));
const 原 = 模块.makeInlineAudioMixing;
let 次 = 0;
模块.makeInlineAudioMixing = (...a) => { 次++; return 原(...a); };
const { 测速 } = await import(根 + '/pipeline/渲/测速.ts');
const 结果 = await 测速({段:'6-穿塔斩首领',帧:[240,263],留输出:import.meta.dirname,不收日志:true});
const 证据 = {替换工厂调用次数:次,ESM入口:import.meta.resolve('@remotion/renderer'),CJS入口:require.resolve('@remotion/renderer'),结果};
fs.writeFileSync(path.join(import.meta.dirname,'旧入口插桩.json'), JSON.stringify(证据,null,2));
console.log(JSON.stringify(证据,null,2));
