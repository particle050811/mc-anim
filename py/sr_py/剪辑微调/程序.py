"""ffmpeg、ffprobe 程序：sr 按自己的配置（SR_FFMPEG、SR_FFPROBE）放进环境变量传进来，单独跑时从 PATH 找。"""
import os

FFMPEG = os.environ.get('SR_FFMPEG', 'ffmpeg')
FFPROBE = os.environ.get('SR_FFPROBE', 'ffprobe')
