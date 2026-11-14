from pathlib import Path
import base64, subprocess, sys

根 = Path.cwd()
出 = 根 / 'out' / '三轮地形'
出.mkdir(parents=True, exist_ok=True)
源 = (根 / 'wasm/区段解码.ts').read_text()
接口 = (根 / 'engine/voxel/区段解码.ts').read_text()
编码 = (根 / 'pipeline/世界/烘焙/区段编码.ts').read_text()

def 代(文本, 旧, 新):
    if 文本.count(旧) != 1: raise ValueError(旧)
    return 文本.replace(旧, 新)

def 写模块(名称, 核, 壳):
    asm = 出 / (名称 + '核.ts'); binary = 出 / (名称 + '.wasm')
    asm.write_text(核)
    subprocess.run(['node','node_modules/assemblyscript/bin/asc.js',str(asm),'-o',str(binary),'--optimizeLevel','3','--shrinkLevel','0','--noAssert','--runtime','stub','--use','abort=','--initialMemory','8','--converge'],check=True)
    壳 = 代(壳, "import { wasmBase64 } from './区段解码器.生成.ts';", 'const wasmBase64 = '+repr(base64.b64encode(binary.read_bytes()).decode())+';')
    (出 / (名称 + '.ts')).write_text(壳)

头 = '  for (let c = 0; c < classes; c++) {\n    for (let v = 0; v < nodes; v++) {'
起 = 源.index(头); 止 = 源.index('  const l = L == 0',起)
建树 = 源[起:止].split('\n',1)[1].removesuffix('  }\n')
核 = 源[:起]+'  let 开过: u32 = 0;\n'+源[止:]
核 = 代(核,'      let n: i32 = 1;', '''      const c = <i32>load<u8>(local + <usize>U), 标 = (<u32>1) << c;
      if ((开过 & 标) == 0) {
        开过 |= 标;
'''+建树+'      }\n      let n: i32 = 1;')
写模块('迟建字面树',核,接口)

扩 = 代(源,'  const p1 = 工,','  const 表长 = <usize>(classes * 2742);\n  memory.copy(工 + 表长, 表, 表长);\n  const p1 = 工,')
扩 = 代(扩,'      const 顶 = k == nz - 1;', '      const 层偏: usize = k < (nz >> 1) ? 表长 : 0;\n      const 顶 = k == nz - 1;')
for 列 in ('跳','p1','p2','p3'): 扩 = 代(扩,'!bit('+列+',','!bit('+列+' + 层偏,')
写模块('上下半境',扩,代(接口,'M = align(W + m.init.byteLength)','M = align(W + 2 * m.init.byteLength)'))
编码 = 代(编码,'probs = 模型.init.slice();','probs = new Uint16Array(2 * 模型.init.length);\n  probs.set(模型.init); probs.set(模型.init, 模型.init.length);')
for 方 in ['W','N','U']:
    原 = 'palette[2 * '+方+']!))'; assert 编码.count(原) == (2 if 方=='U' else 1)
    编码 = 编码.replace(原,'(k < (nz >> 1) ? 65536 : 0) + palette[2 * '+方+']!))')
编码 = 代(编码,'模型.map[s]! * 1371','(模型.map[s & 65535]! + (s >= 65536 ? 模型.classes : 0)) * 1371')
(出/'上下半编码.ts').write_text(编码)
