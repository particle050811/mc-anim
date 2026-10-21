// 同一个声音文件叠几条时给 <Audio> 的 src 加区分标记。
// @remotion/media（4.0.530）的 <Audio> 渲染时按「src + 所在 Sequence 的起点和长度」起 id，同 id 的几条写进同一个 wav，后写的盖掉先写的，
// 摘掉一条时同 id 的也一起摘掉。6-1-9b 两条配乐交叉的那两帧母版里只剩一条，成片顿一下；剪辑包照清单合成配乐，所以剪映里没有
// （用户 10-20：「为什么这个视频里面衔接处还会顿一下 音频还会顿一下 而剪映里面没有」）。
// 加在 # 后面：fetch 不带 # 后面的部分，取的还是同一个文件；@remotion/media 按整个 src 另开一个解码器，所以只给会叠的加。
export const tagSrc = (src: string, tag: string | number) => `${src}#${tag}`;
