# 三个离线核对脚本共用（. 进来）：JDK 17 和游戏环境只从环境变量取，不写死本机路径。sr 跑的时候按 sr 配置传。
#   MCAI_JAVA_HOME  JDK 17（编译 1.20.1 的 mod 必须 17）；不给就用 JAVA_HOME
#   MCAI_GAME       游戏环境目录（取材服务端、jar 缓存）
JAVA_HOME=${MCAI_JAVA_HOME:-$JAVA_HOME}
if [ -z "$JAVA_HOME" ]; then echo "要设 MCAI_JAVA_HOME（JDK 17）" >&2; exit 2; fi
if [ -z "$MCAI_GAME" ]; then echo "要设 MCAI_GAME（游戏环境目录，里面有 取材服务端/、缓存/）" >&2; exit 2; fi
export JAVA_HOME MCAI_GAME
