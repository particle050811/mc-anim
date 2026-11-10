// 起步的画面：黑底上数秒
import { AbsoluteFill } from 'remotion';
import { 定义画面, use段 } from '@engine/段/段画面.tsx';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';

export default 定义画面(段, 声音, () => {
  const { 秒, 段: 本段 } = use段(段);
  return <AbsoluteFill style={{ background: '#000', color: '#fff', fontSize: 48, justifyContent: 'center', alignItems: 'center' }}>{`${秒.toFixed(2)} / ${本段.秒} 秒`}</AbsoluteFill>;
});
