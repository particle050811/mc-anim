import fs from 'node:fs';
import { expect, test } from 'vitest';
import { 漏登记模型 } from './区段模型登记.ts';

test('漏模型、别名和命名空间调用都查得到，注释与 import 不算调用', () => {
  const 引 = `import { registerSource as 来源, registerModel as 模型 } from '@engine/voxel/区段工人池.ts';`;
  expect(漏登记模型('地形.ts', `${引} 来源({}); // 模型();`)).toBe(true);
  expect(漏登记模型('地形.ts', `${引} 模型(url, bytes); 来源({});`)).toBe(false);
  expect(漏登记模型('地形.ts', `import * as 池 from './区段工人池.ts'; 池.registerSource({});`)).toBe(true);
  expect(漏登记模型('地形.ts', `const registerSource = () => {}; registerSource();`)).toBe(false);
});

test('两处实际来源的模型接线都有守卫，删掉登记会复现检查失败', () => {
  for (const p of ['engine/voxel/导入地形.ts', '作品/应力转动/核对/世界编辑/地形.ts']) {
    const 源 = fs.readFileSync(p, 'utf8');
    expect(漏登记模型(p, 源)).toBe(false);
    expect(漏登记模型(p, 源.replace(/registerModel\(url, bytes\);/, ''))).toBe(true);
  }
});
