// base64 → 字节。不写 Uint8Array.from(atob(s), (c) => c.charCodeAt(0))：那样走字符串迭代器、逐个字符调回调，
// 几兆的粗高度图解一回比下面的循环慢十倍，开一个页面还不止解一回。Uint8Array.fromBase64 在 Node 24 里还没有，而 pipeline 也 import 这个文件
export const base64Bytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
