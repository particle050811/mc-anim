#!/bin/sh
# 古城放大（mcai.BigJigsaw + sourcing/datapacks/古城放大4倍）的离线核对，不开游戏：在 sourcing/mod/ 下 sh test/ancient-city-test.sh [size:半径 ...]
#   先 ./gradlew build；AncientCityTest 核对放宽的编解码，再按取材服务端的种子在片场那座古城的起点区块 (-45, 15) 拼城，
#   原版参数、数据包参数、命令行另给的几组各拼一次，报件数、范围、用时，每件的模板和包围盒写进输出目录（默认 $TMPDIR 下的临时目录），
#   挑参数时拿来比件数和范围。拼大城单线程要几秒到几十秒，算重任务，先过资源闸。环境变量见 test/env.sh。
#   织入（注入点都找得到）在 test/twilight-grid-test.sh 的 MixinApplyTest 里一起核对。
# 环境变量 OUT 指定输出目录，SEED、CX、CZ 换种子和起点区块。
set -e
cd "$(dirname "$0")/.."
D=$(pwd)
. "$D/test/env.sh"
./gradlew build --console=plain -q
CP=$(./gradlew -q printRuntimeClasspath)
VANILLA=$(echo "$CP" | tr ':' '\n' | grep 'client-extra.jar' | head -1)
OUT=${OUT:-$(mktemp -d)}
T=$(mktemp -d)
mkdir -p "$T/classes"
"$JAVA_HOME/bin/javac" -nowarn -Xlint:none -encoding UTF-8 -d "$T/classes" -cp "$CP:$D/build/classes/java/main" test/AncientCityTest.java
# Minecraft 自带的日志配置会往当前目录写 logs/，换到临时目录里跑
cd "$T"
"$JAVA_HOME/bin/java" -Xmx8G -cp "$T/classes:$CP:$D/build/classes/java/main" AncientCityTest \
  "$VANILLA" "$D/../datapacks/古城放大4倍" "${SEED:-20260930}" "${CX:--45}" "${CZ:-15}" "$OUT" "$@"
echo "每件的包围盒在 $OUT"
