// 区段包在 public 目录下的位置：terrain/<名>/<版本>/<文件>（terrain 链到 <数据根>/terrain，见 pipeline/渲/public目录.ts）。
// 版本不从 assets/地形版本.json import：整表进闭包的话改任何一个包所有地形段都过期（用户 10-31 定按段依赖）。页面只拿到本段声明的包和版本，
// 由渲染入口经环境变量传（pipeline/渲/地形注入.ts；Remotion 只打包一次，环境变量能逐段不同，也不混进进指纹的 inputProps）；Studio 传全表（pipeline/预览/命令.ts）。
// 读没声明的包直接报错，不退回全表：指纹的地形项只记声明的包，偷读的包换了版本这段不会过期。Node 工具要用就自己设这个环境变量。
import { 地形版本环境名 } from '../段/地形环境.ts';
import { 记读包 } from './地形用量.ts';

// webpack 里没有 process 这个变量时（模块求值很早、Worker）也不能炸，只从 globalThis 取
const 环境 = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

let 上次原文: string | undefined;
let 上次表: Record<string, string> = {};
const 版本表 = () => {
  const 原文 = 环境()?.[地形版本环境名];
  if (原文 === undefined) throw new Error(`这个页面没拿到地形版本表（${地形版本环境名}）：渲染要传 pipeline/渲/地形注入.ts 的 段渲染环境，预览用 anim studio`);
  if (原文 !== 上次原文) {
    上次表 = JSON.parse(原文) as Record<string, string>;
    上次原文 = 原文;
  }
  return 上次表;
};

const packVersion = (packName: string) => {
  const 表 = 版本表();
  const version = 表[packName];
  if (!version) throw new Error(`读了没声明的区段包 ${packName}：这段的 段.ts 的 地形 里要写上它（现在声明的：${Object.keys(表).join('、') || '无'}）。新包还要 anim world bake 登记进 assets/地形版本.json`);
  记读包(packName, version);
  return version;
};
// 相对 public 目录的路径，交给 engine/core/数据源.ts。一个包取到的各个文件要出自同一版：取包时记下 packDir，后面的文件都从它拼，缓存也按它做键
export const packDir = (packName: string) => `terrain/${packName}/${packVersion(packName)}`;
