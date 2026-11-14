// 只去无头浏览器的缓存诊断，不属于段的画面／声音输入；Studio 仍可看原日志。
module.exports = function 去音频缓存日志(源码) {
  const 调用 = '      mediaCache.audioManager.logOpenFrames();';
  if (源码.split(调用).length !== 2) throw new Error('Remotion 音频缓存日志应恰好命中一次；请核对锁定版本');
  return 源码.replace(调用, '');
};
