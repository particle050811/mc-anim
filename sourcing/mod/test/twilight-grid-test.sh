#!/bin/sh
# 暮色地标网格的离线核对（不开游戏）：在 取材mod/ 下 sh 测试/暮色网格测试.sh，会先 ./gradlew build。
#   TwilightGridTest：照抄的函数、mixin 的处理函数对照暮色 jar 里的原函数；
#   MixinApplyTest：把 mixin 真的织进暮色 jar 和 Minecraft 的类，注入点都找得到、接在该接的地方。
# 类路径：重混淆后的 mcai jar、取材服务端里的暮色 jar、Gradle 给的运行时库；其中 Mojmap 名的 Forge 换成 ForgeGradle 缓存里 SRG 名的那份
set -e
cd "$(dirname "$0")/.."
D=$(pwd)
export JAVA_HOME=${MCAI_JAVA_HOME:-/opt/homebrew/opt/openjdk@17}  # JDK 17，同 取材mod/mcai
./gradlew build --console=plain -q
SRG=$(find ~/.gradle/caches/forge_gradle/minecraft_user_repo -name 'forge-1.20.1-47.4.10-srg.jar' | head -1)
LIBS=$(./gradlew -q printRuntimeClasspath | tr ':' '\n' | grep -v '_mapped_official_' | paste -sd: -)
CP=$D/build/libs/mcai-0.1.0.jar:$D/../game/取材服务端/mods/twilightforest-1.20.1-4.3.2508-universal.jar:$SRG:$LIBS
# Minecraft 自带的日志配置会往当前目录写 logs/，换到临时目录里跑
T=$(mktemp -d)
cd "$T"
"$JAVA_HOME/bin/java" -cp "$CP" "$D/测试/TwilightGridTest.java"
# Mixin 用 ServiceLoader 找托管服务，服务类和 META-INF/services 要排在类路径最前面（排在 Mixin 自带的 ModLauncher 服务之前）
mkdir -p "$T/classes/META-INF/services"
echo 'MixinApplyTest$Service' > "$T/classes/META-INF/services/org.spongepowered.asm.service.IMixinService"
echo 'MixinApplyTest$Props' > "$T/classes/META-INF/services/org.spongepowered.asm.service.IGlobalPropertyService"
"$JAVA_HOME/bin/javac" -nowarn -encoding UTF-8 -d "$T/classes" -cp "$CP" "$D/测试/MixinApplyTest.java"
"$JAVA_HOME/bin/java" -cp "$T/classes:$CP" MixinApplyTest
