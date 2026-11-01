// Remotion 4.0.537 的音频音量参数在 Chrome 157 / V8 15.7 中会触发对象字面量模板迁移的 TrustedCast 断言。
// 保留参数值、求值顺序和音量算法，只逐项构造这个对象，避开 Runtime_CreateObjectLiteral；不能靠静音或换成逐帧掩盖。
// 仅改已定位的音频调用，不改视频调用，也不写 node_modules；版本锁定，依赖布局变化时必须重新核对，不能静默漏补丁。
const 原片段 = `const { audio, durationInSeconds: assetDurationInSeconds } = result;
      const volumePropsFrame = frameForVolumeProp({
        behavior: loopVolumeCurveBehavior ?? "repeat",
        loop: loop ?? false,
        assetDurationInSeconds: assetDurationInSeconds ?? 0,
        fps,
        frame,
        startsAt,
        playbackRate: playbackRate ?? 1,
        trimBefore,
        trimAfter
      });`;
const 替换片段 = `const { audio, durationInSeconds: assetDurationInSeconds } = result;
      const volumeFrameOptions = {};
      volumeFrameOptions.behavior = loopVolumeCurveBehavior ?? "repeat";
      volumeFrameOptions.loop = loop ?? false;
      volumeFrameOptions.assetDurationInSeconds = assetDurationInSeconds ?? 0;
      volumeFrameOptions.fps = fps;
      volumeFrameOptions.frame = frame;
      volumeFrameOptions.startsAt = startsAt;
      volumeFrameOptions.playbackRate = playbackRate ?? 1;
      volumeFrameOptions.trimBefore = trimBefore;
      volumeFrameOptions.trimAfter = trimAfter;
      const volumePropsFrame = frameForVolumeProp(volumeFrameOptions);`;
module.exports = function 媒体字面量(source) {
  if (source.split(原片段).length !== 2) throw new Error('Remotion 音频字面量兼容补丁应恰好命中一次；请核对锁定的 @remotion/media 4.0.537 源码');
  return source.replace(原片段, 替换片段);
};
