// 时刻落到 1/120 秒的刻上：60 帧/秒的帧、拼段从半帧剪进来的帧都在刻上。
// 几个 n/24 一加会带浮点零头，事件正好落在某一帧上时 `>=`、`<` 就可能偏到前一帧或后一帧；
// 落到刻上以后，同一时刻不管怎么算出来都是同一个数，判断和旧的整数帧一致。
// 只收浮点零头：离刻超过 1 微秒的时刻是真值（台词长、按戏解出来的时刻），原样返回，不取整（用户 11-16：1/24 格的取整一处不留）
const TICKS_PER_SEC = 120;
const FLOAT_SLACK_SEC = 1e-6;
export const onTick = (sec: number) => {
  const snapped = Math.round(sec * TICKS_PER_SEC) / TICKS_PER_SEC;
  return Math.abs(snapped - sec) < FLOAT_SLACK_SEC ? snapped : sec;
};
// 刻数：往上取到第一个不早于这一时刻的刻（拼段的截点；画面在这一刻以后的第一帧切过去）
export const ticksAtOrAfter = (sec: number) => Math.ceil(sec * TICKS_PER_SEC - FLOAT_SLACK_SEC * TICKS_PER_SEC);
export { TICKS_PER_SEC };
