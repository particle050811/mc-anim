package mcai;

/** 给调用方看的错误（参数不对、当前状态做不了），消息直接返回给 mcai。 */
public class ActionException extends RuntimeException {
    public ActionException(String message) {
        super(message);
    }
}
