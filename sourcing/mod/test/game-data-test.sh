#!/bin/sh
# mcai biomes / blocks 的出表部分（mcai.gamedata，不 import 游戏类）的离线核对，不开游戏：在 sourcing/mod/ 下 sh test/game-data-test.sh
#   只编 src/main/java/mcai/gamedata/*.java（不含 forge1201/）和 test/GameDataTest.java，类路径只要 Gradle 缓存里的 Gson。
#   各项见 GameDataTest.java 文件头。
set -e
cd "$(dirname "$0")/.."
D=$(pwd)
. "$D/test/env.sh"
GSON=$(find ~/.gradle/caches/modules-2 -name 'gson-2.10.1.jar' | head -1)
if [ -z "$GSON" ]; then echo "Gradle 缓存里没有 gson 2.10.1（和 1.20.1 游戏同版；先 ./gradlew build 一次）" >&2; exit 2; fi
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
"$JAVA_HOME/bin/javac" -nowarn -encoding UTF-8 -d "$T" -cp "$GSON" src/main/java/mcai/gamedata/*.java test/GameDataTest.java
"$JAVA_HOME/bin/java" -Djava.awt.headless=true -cp "$T:$GSON" GameDataTest
