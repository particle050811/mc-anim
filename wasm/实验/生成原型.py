from pathlib import Path
import base64, subprocess, sys

root_dir = Path.cwd()
OUT_DIR = root_dir / 'out' / '三轮地形'
OUT_DIR.mkdir(parents=True, exist_ok=True)
source = (root_dir / 'wasm/区段解码.ts').read_text()
DECODER_SOURCE = (root_dir / 'engine/voxel/区段解码.ts').read_text()
encoder_source = (root_dir / 'pipeline/世界/烘焙/区段编码.ts').read_text()

def replace_text(text, old_text, new_text):
    if text.count(old_text) != 1: raise ValueError(old_text)
    return text.replace(old_text, new_text)

def write_module(name, core_source, shell_template):
    asm = OUT_DIR / (name + '核.ts'); binary = OUT_DIR / (name + '.wasm')
    asm.write_text(core_source)
    subprocess.run(['node','node_modules/assemblyscript/bin/asc.js',str(asm),'-o',str(binary),'--optimizeLevel','3','--shrinkLevel','0','--noAssert','--runtime','stub','--use','abort=','--initialMemory','8','--converge'],check=True)
    shell_template = replace_text(shell_template, "import { wasmBase64 } from './区段解码器.生成.ts';", 'const wasmBase64 = '+repr(base64.b64encode(binary.read_bytes()).decode())+';')
    (OUT_DIR / (name + '.ts')).write_text(shell_template)

start_marker = '  for (let c = 0; c < classes; c++) {\n    for (let v = 0; v < nodes; v++) {'
start_index = source.index(start_marker); end = source.index('  const l = L == 0',start_index)
build_tree_source = source[start_index:end].split('\n',1)[1].removesuffix('  }\n')
core_source = source[:start_index]+'  let 开过: u32 = 0;\n'+source[end:]
core_source = replace_text(core_source,'      let n: i32 = 1;', '''      const c = <i32>load<u8>(local + <usize>U), 标 = (<u32>1) << c;
      if ((开过 & 标) == 0) {
        开过 |= 标;
'''+build_tree_source+'      }\n      let n: i32 = 1;')
write_module('迟建字面树',core_source,DECODER_SOURCE)

expanded = replace_text(source,'  const p1 = 工,','  const 表长 = <usize>(classes * 2742);\n  memory.copy(工 + 表长, 表, 表长);\n  const p1 = 工,')
expanded = replace_text(expanded,'      const 顶 = k == nz - 1;', '      const 层偏: usize = k < (nz >> 1) ? 表长 : 0;\n      const 顶 = k == nz - 1;')
for column in ('跳','p1','p2','p3'): expanded = replace_text(expanded,'!bit('+column+',','!bit('+column+' + 层偏,')
write_module('上下半境',expanded,replace_text(DECODER_SOURCE,'M = align(W + m.init.byteLength)','M = align(W + 2 * m.init.byteLength)'))
encoder_source = replace_text(encoder_source,'probs = 模型.init.slice();','probs = new Uint16Array(2 * 模型.init.length);\n  probs.set(模型.init); probs.set(模型.init, 模型.init.length);')
for slot in ['W','N','U']:
    PALETTE_PATTERN = 'palette[2 * '+slot+']!))'; assert encoder_source.count(PALETTE_PATTERN) == (2 if slot=='U' else 1)
    encoder_source = encoder_source.replace(PALETTE_PATTERN,'(k < (nz >> 1) ? 65536 : 0) + palette[2 * '+slot+']!))')
encoder_source = replace_text(encoder_source,'模型.map[s]! * 1371','(模型.map[s & 65535]! + (s >= 65536 ? 模型.classes : 0)) * 1371')
(OUT_DIR/'上下半编码.ts').write_text(encoder_source)

ref = replace_text(source,'const bW = 有W ? base - nz : 有N ? base - 边 * nz : -1, bN = 有N ? base - 边 * nz : bW;', 'const 西列 = 有W ? 取(数,c-1) : 有N ? 取(数,c-边) : -1, 北列 = 有N ? 取(数,c-边) : 西列;\n    const bW = 西列 < 0 ? -1 : 西列 * nz, bN = 北列 < 0 ? -1 : 北列 * nz;\n    const 两个邻居 = 有W && 有N;')
ref = replace_text(ref,'else if (bN != bW)', 'else if (两个邻居)')
ref = replace_text(ref,'源 = bW;', '源 = 西列;')
ref = replace_text(ref,'源 = bN;', '源 = 北列;')
start_index = ref.index('      memory.copy(cm'); end = ref.index('    let k = nz - 1',start_index)
ref = ref[:start_index]+'      存(数,c,源);\n      continue;\n    }\n    存(数,c,c);\n'+ref[end:]
ref = replace_text(ref,'const base = c * nz, w0 = w;', 'const base = 取(数,c) * nz, w0 = w;')
write_module('整列引用',ref,DECODER_SOURCE)
