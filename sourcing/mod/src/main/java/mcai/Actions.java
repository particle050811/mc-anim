package mcai;

import com.google.gson.JsonElement;
import mcai.action.BatchAction;
import mcai.action.BiomesAction;
import mcai.action.BlocksAction;
import mcai.action.CamAction;
import mcai.action.ClickAction;
import mcai.action.CloseScreenAction;
import mcai.action.CmdAction;
import mcai.action.FillAction;
import mcai.action.FreezeAction;
import mcai.action.HelpAction;
import mcai.action.InputAction;
import mcai.action.KeyAction;
import mcai.action.MeshAction;
import mcai.action.QuitAction;
import mcai.action.ReadyAction;
import mcai.action.SetBlockAction;
import mcai.action.ShootAction;
import mcai.action.StateAction;
import mcai.action.UiAction;
import mcai.action.UndoAction;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/** 动作注册表。加新动作：写一个 Action 类，在这里 register 一行。 */
public final class Actions {
    private static final Map<String, Action> ALL = new LinkedHashMap<>();

    static {
        register(new HelpAction());
        register(new ReadyAction());
        register(new StateAction());
        register(new CamAction());
        register(new ShootAction());
        register(new CmdAction());
        register(new FreezeAction(true));
        register(new FreezeAction(false));
        register(new SetBlockAction());
        register(new FillAction());
        register(new UndoAction());
        register(new MeshAction());
        register(new BatchAction());
        register(new CloseScreenAction());
        register(new ClickAction());
        register(new InputAction());
        register(new KeyAction());
        register(new QuitAction());
        register(new UiAction());
        register(new BiomesAction());
        register(new BlocksAction());
    }

    private Actions() {
    }

    private static void register(Action action) {
        ALL.put(action.name(), action);
    }

    public static Collection<Action> all() {
        return ALL.values();
    }

    public static boolean exclusive(String name) {
        Action action = ALL.get(name);
        return action != null && action.exclusive();
    }

    /** 从 HTTP 线程调用：检查参数，切到动作声明的线程执行。 */
    public static JsonElement call(String name, Args args) throws Exception {
        Action action = ALL.get(name);
        if (action == null) throw new ActionException("没有这个动作：" + name + "（mcai help 看清单）");
        for (Action.Param p : action.params()) {
            if (p.required() && !args.has(p.name())) {
                throw new ActionException(name + " 缺少参数 " + p.name() + "（" + p.format() + "：" + p.doc() + "）");
            }
        }
        return switch (action.where()) {
            case HTTP -> action.run(args);
            case CLIENT -> Game.onClient(() -> action.run(args));
            case SERVER -> Game.onServer(() -> {
                if (!action.changesWorld()) return action.run(args);
                Undo.open(name);
                try {
                    return action.run(args);
                } finally {
                    Undo.close();
                }
            });
        };
    }
}
