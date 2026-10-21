package mcai.action;

import com.google.gson.JsonElement;
import mcai.Action;
import mcai.Args;
import mcai.Game;
import mcai.Undo;

import java.util.List;

public class UndoAction implements Action {
    public String name() {
        return "undo";
    }

    public String doc() {
        return "撤销上一次改世界的动作（setblock、fill、cmd、整个 batch 各算一次），可连续撤销";
    }

    public List<Param> params() {
        return List.of();
    }

    public Where where() {
        return Where.SERVER;
    }

    public JsonElement run(Args args) {
        return Undo.undoLast(Game.server());
    }
}
