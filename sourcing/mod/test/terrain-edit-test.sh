#!/bin/sh
# 生成时修整（mcai:region、mcai:edit，取材mod/src/main/java/mcai/terrain/）的离线核对，不开游戏：在 取材mod/ 下 sh 测试/地形修整测试.sh [--性能] [--包 <目录>]
#   先 ./gradlew build；再用离线版（参考模型库/工具/选种/生成修整.mjs）在一批随机点上算值（测试/地形修整对照.mjs）；
#   最后 TerrainEditTest 用游戏自己的代码读数据包、按种子接噪声，和离线版逐位比，另核对往返、错例、重混淆（各项见 TerrainEditTest.java 文件头）。
#   用例在 测试/地形修整用例/（一个数据包：各种形状、操作、边界噪声，取点.json 是取点的框，错例.json 是必须报错的写法）。
#   --性能 另外量每次求值和整块区块生成加修整前后的开销（单线程约 1 分钟，算重任务，经 参考模型库/工具/资源闸.py 跑）。
#   --包 换一个修整包来核对（默认 数据包/主世界修整）：改区域时先拷一份改，过了再换回去。
# 前提：参考模型库/工具/选种/ 下 npm install 过（deepslate），game/缓存/client-1.20.1.jar（离线版的原版数据）和
# game/取材服务端-主世界/世界数据包/epicterrain_compatible1.20.zip 在。
# 类路径：Gradle 给的运行时库（Mojmap 名的 Forge）加 build/classes；重混淆那一项另开类加载器，用 build/libs 的 jar 和 SRG 名的 Forge。
set -e
cd "$(dirname "$0")/.."
D=$(pwd)
PACK=$D/数据包/主世界修整
PERF=
while [ $# -gt 0 ]; do
  case "$1" in
    --性能) PERF=--性能 ;;
    --包) PACK=$(cd "$2" && pwd); shift ;;
    *) echo "不认识的参数：$1"; exit 2 ;;
  esac
  shift
done
export JAVA_HOME=${MCAI_JAVA_HOME:-/opt/homebrew/opt/openjdk@17}  # JDK 17，同 取材mod/mcai
./gradlew build --console=plain -q
CP=$(./gradlew -q printRuntimeClasspath)
SRG=$(find ~/.gradle/caches/forge_gradle/minecraft_user_repo -name 'forge-1.20.1-47.4.10-srg.jar' | head -1)
LIBS=$(echo "$CP" | tr ':' '\n' | grep -v '_mapped_official_' | paste -sd: -)
# 原版数据（data/minecraft/worldgen/...）：Gradle 缓存里的 client-extra.jar，和编译用的是同一版
VANILLA=$(echo "$CP" | tr ':' '\n' | grep 'client-extra.jar' | head -1)
ETN=$D/../game/取材服务端-主世界/世界数据包/epicterrain_compatible1.20.zip
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT   # 离线版写的点有二十几 MB，跑完就删
node 测试/地形修整对照.mjs 测试/地形修整用例 "$PACK" "$T"
mkdir -p "$T/classes"
"$JAVA_HOME/bin/javac" -nowarn -Xlint:none -encoding UTF-8 -d "$T/classes" -cp "$CP:$D/build/classes/java/main" 测试/TerrainEditTest.java
# Minecraft 自带的日志配置会往当前目录写 logs/，换到临时目录里跑
cd "$T"
"$JAVA_HOME/bin/java" -cp "$T/classes:$CP:$D/build/classes/java/main" TerrainEditTest \
  "$D/测试/地形修整用例" "$PACK" "$T" "$VANILLA" "$ETN" "$D/build/libs/mcai-0.1.0.jar" "$SRG" "$LIBS" $PERF
