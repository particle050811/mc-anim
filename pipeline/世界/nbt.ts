// NBT（Minecraft 的二进制标签格式，大端）：读存档区块、level.dat、结构 .nbt、Sponge/WorldEdit .schem 都用它。
// 读出来不带标签类型（快，区块解码是热路径）：字节、短、整、浮点、双精度都成 number，长整数成 bigint，字节数组成 Buffer（不拷），
// 整数数组成 Int32Array，长整数数组成 { 长: Buffer }（8 字节一个、大端，不拷）。
// 写要标签类型，所以写入用带类型的 写标签；测试造结构文件、以后写回 .mca 用。
import { gunzipSync, inflateSync } from 'node:zlib';

export type LongArray = { length: Buffer };
export type NbtValue = number | bigint | string | Buffer | Int32Array | LongArray | NbtValue[] | Compound;
export type Compound = { [k: string]: NbtValue };

/** 读一份未压缩的 NBT，返回根复合标签（根名丢掉；要根名用 读NBT带名） */
export const readNbt = (buf: Buffer): Compound => readNbtNamed(buf).value;

export const readNbtNamed = (buf: Buffer): { name: string; value: Compound } => {
  let pos = 0;
  const readString = () => {
    const len = buf.readUInt16BE(pos);
    const str = buf.toString('utf8', pos + 2, pos + 2 + len);
    pos += 2 + len;
    return str;
  };
  const readValue = (t: number): NbtValue => {
    switch (t) {
      case 1:
        return buf.readInt8(pos++);
      case 2:
        pos += 2;
        return buf.readInt16BE(pos - 2);
      case 3:
        pos += 4;
        return buf.readInt32BE(pos - 4);
      case 4:
        pos += 8;
        return buf.readBigInt64BE(pos - 8);
      case 5:
        pos += 4;
        return buf.readFloatBE(pos - 4);
      case 6:
        pos += 8;
        return buf.readDoubleBE(pos - 8);
      case 7: {
        const len = buf.readInt32BE(pos);
        pos += 4 + len;
        return buf.subarray(pos - len, pos);
      }
      case 8:
        return readString();
      case 9: {
        const et = buf.readInt8(pos);
        const count = buf.readInt32BE(pos + 1);
        pos += 5;
        const list: NbtValue[] = new Array(count);
        for (let i = 0; i < count; i++) list[i] = readValue(et);
        return list;
      }
      case 10: {
        const compound: Compound = {};
        for (let tt = buf.readInt8(pos++); tt !== 0; tt = buf.readInt8(pos++)) {
          const k = readString();
          compound[k] = readValue(tt);
        }
        return compound;
      }
      case 11: {
        const count = buf.readInt32BE(pos);
        const ints = new Int32Array(count);
        for (let i = 0; i < count; i++) ints[i] = buf.readInt32BE(pos + 4 + 4 * i);
        pos += 4 + 4 * count;
        return ints;
      }
      case 12: {
        const count = buf.readInt32BE(pos);
        pos += 4 + 8 * count;
        return { length: buf.subarray(pos - 8 * count, pos) };
      }
    }
    throw new Error(`没见过的 NBT 标签 ${t}（偏移 ${pos - 1}）`);
  };
  const t = buf.readInt8(pos++);
  if (t !== 10) throw new Error(`NBT 根不是复合标签（是 ${t}）`);
  const name = readString();
  return { name: name, value: readValue(t) as Compound };
};

/** 按开头的魔数自动解 gzip（1f 8b）、zlib（78 xx），否则当未压缩 */
export const decompressNbt = (buf: Buffer): Buffer => (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf[0] === 0x78 ? inflateSync(buf) : buf);

// ---------- 写 ----------
export type NbtLabel =
  | { t: 'byte' | 'short' | 'int' | 'float' | 'double'; v: number }
  | { t: 'long'; v: bigint }
  | { t: 'string'; v: string }
  | { t: 'byteArray'; v: Uint8Array }
  | { t: 'intArray'; v: ArrayLike<number> }
  | { t: 'longArray'; v: ArrayLike<bigint> }
  | { t: 'list'; elementType: NbtLabel['t'] | 'end'; v: NbtLabel[] }
  | { t: 'compound'; v: Record<string, NbtLabel> };

const tagTypeId: Record<NbtLabel['t'] | 'end', number> = { end: 0, byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6, byteArray: 7, string: 8, list: 9, compound: 10, intArray: 11, longArray: 12 };

/** 写成未压缩的 NBT（根是复合标签） */
export const writeNbt = (root: Record<string, NbtLabel>, rootName = ''): Buffer => {
  const parts: Buffer[] = [];
  const u8 = (n: number) => parts.push(Buffer.from([n & 255]));
  const str = (s: string) => {
    const b = Buffer.from(s, 'utf8');
    const h = Buffer.alloc(2);
    h.writeUInt16BE(b.length);
    parts.push(h, b);
  };
  const val = (x: NbtLabel) => {
    const b = (n: number) => Buffer.alloc(n);
    switch (x.t) {
      case 'byte': {
        const o = b(1);
        o.writeInt8(x.v);
        return parts.push(o);
      }
      case 'short': {
        const o = b(2);
        o.writeInt16BE(x.v);
        return parts.push(o);
      }
      case 'int': {
        const o = b(4);
        o.writeInt32BE(x.v);
        return parts.push(o);
      }
      case 'long': {
        const o = b(8);
        o.writeBigInt64BE(x.v);
        return parts.push(o);
      }
      case 'float': {
        const o = b(4);
        o.writeFloatBE(x.v);
        return parts.push(o);
      }
      case 'double': {
        const o = b(8);
        o.writeDoubleBE(x.v);
        return parts.push(o);
      }
      case 'string':
        return str(x.v);
      case 'byteArray': {
        const o = b(4);
        o.writeInt32BE(x.v.length);
        return parts.push(o, Buffer.from(x.v));
      }
      case 'intArray': {
        const o = b(4 + 4 * x.v.length);
        o.writeInt32BE(x.v.length);
        for (let i = 0; i < x.v.length; i++) o.writeInt32BE(x.v[i]!, 4 + 4 * i);
        return parts.push(o);
      }
      case 'longArray': {
        const o = b(4 + 8 * x.v.length);
        o.writeInt32BE(x.v.length);
        for (let i = 0; i < x.v.length; i++) o.writeBigInt64BE(x.v[i]!, 4 + 8 * i);
        return parts.push(o);
      }
      case 'list': {
        u8(tagTypeId[x.v.length ? x.v[0]!.t : x.elementType]);
        const o = b(4);
        o.writeInt32BE(x.v.length);
        parts.push(o);
        for (const e of x.v) val(e);
        return;
      }
      case 'compound':
        for (const [k, e] of Object.entries(x.v)) {
          u8(tagTypeId[e.t]);
          str(k);
          val(e);
        }
        return u8(0);
    }
  };
  u8(10);
  str(rootName);
  val({ t: 'compound', v: root });
  return Buffer.concat(parts);
};
