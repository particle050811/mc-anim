// 只去无头浏览器的缓存诊断，不属于段的画面／声音输入；Studio 仍可看原日志。
module.exports = function stripAudioCacheLog(source) {
  const logOpenFramesCall = '      mediaCache.audioManager.logOpenFrames();';
  if (source.split(logOpenFramesCall).length !== 2) throw new Error('Remotion 音频缓存日志应恰好命中一次；请核对锁定版本');
  return source.replace(logOpenFramesCall, '');
};
