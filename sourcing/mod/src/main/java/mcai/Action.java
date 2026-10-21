package mcai;

import com.google.gson.JsonElement;

import java.util.List;

/**
 * 一个动作一个类。名称、参数、跑在哪个线程都在这里声明，
 * HTTP 接口（POST /动作名）和 help 的输出都从 {@link Actions} 里的注册表生成，不另外维护清单。
 */
public interface Action {
    String name();

    String doc();

    List<Param> params();

    Where where();

    /** 改世界的动作执行期间，方块变化会被记进撤销记录（见 {@link Undo}）。 */
    default boolean changesWorld() {
        return false;
    }

    /** 要排队的动作：同一时间只执行一个（见 {@link HttpApi}）。只读状态的动作（help、ready、state）不排队，别人在截图时也能查。 */
    default boolean exclusive() {
        return true;
    }

    JsonElement run(Args args) throws Exception;

    enum Where {
        /** 渲染线程：读写客户端状态、截图 */
        CLIENT,
        /** 集成服务端线程：改世界、执行命令。只在单人世界里可用 */
        SERVER,
        /** 留在 HTTP 线程，自己分步调度到上面两个线程（要跨多帧等待的动作） */
        HTTP
    }

    record Param(String name, String format, boolean required, String doc) {
        public static Param must(String name, String format, String doc) {
            return new Param(name, format, true, doc);
        }

        public static Param opt(String name, String format, String doc) {
            return new Param(name, format, false, doc);
        }
    }
}
