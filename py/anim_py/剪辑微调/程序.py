"""ffmpeg、ffprobe 程序：anim 按自己的配置（ANIM_FFMPEG、ANIM_FFPROBE）放进环境变量传进来，单独跑时从 PATH 找。"""
import os

FFMPEG = os.environ.get('ANIM_FFMPEG', 'ffmpeg')
FFPROBE = os.environ.get('ANIM_FFPROBE', 'ffprobe')
