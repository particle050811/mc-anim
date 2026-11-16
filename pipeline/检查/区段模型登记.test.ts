import fs from 'node:fs';
import { expect, test } from 'vitest';
import { isUnregisteredSectionModel } from './区段模型登记.ts';

test('漏模型、别名和命名空间调用都查得到，注释与 import 不算调用', () => {
  const importLine = `import { registerSource as 来源, registerModel as 模型 } from '@engine/voxel/区段工人池.ts';`;
  expect(isUnregisteredSectionModel('地形.ts', `${importLine} 来源({}); // 模型();`)).toBe(true);
  expect(isUnregisteredSectionModel('地形.ts', `${importLine} 模型(url, bytes); 来源({});`)).toBe(false);
  expect(isUnregisteredSectionModel('地形.ts', `import * as 池 from './区段工人池.ts'; 池.registerSource({});`)).toBe(true);
  expect(isUnregisteredSectionModel('地形.ts', `const registerSource = () => {}; registerSource();`)).toBe(false);
});

test('两处实际来源的模型接线都有守卫，删掉登记会复现检查失败', () => {
  for (const p of ['engine/voxel/导入地形.ts', '作品/应力转动/核对/世界编辑/地形.ts']) {
    const sourceText = fs.readFileSync(p, 'utf8');
    expect(isUnregisteredSectionModel(p, sourceText)).toBe(false);
    expect(isUnregisteredSectionModel(p, sourceText.replace(/registerModel\(url, bytes\);/, ''))).toBe(true);
  }
});
