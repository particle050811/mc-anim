package mcai.action;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import mcai.CamState;
import mcai.Freeze;
import mcai.HttpApi;
import mcai.Input;
import mcai.Undo;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.Vec3;
import org.lwjgl.glfw.GLFW;

import java.util.List;

public class StateAction implements Action {
    public String name() {
        return "state";
    }

    public String doc() {
        return "当前状态：位置、朝向、维度、时间天气、是否冻结、区块是否渲染完、有没有界面挡着";
    }

    public List<Param> params() {
        return List.of();
    }

    public Where where() {
        return Where.CLIENT;
    }

    public boolean exclusive() {
        return false;
    }

    public JsonElement run(Args args) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) throw new ActionException("还没进入世界（mcai ready 看原因）");
        return describe(mc);
    }

    /** shoot 把同一份内容写进 PNG，所以抽成公共方法。 */
    public static JsonObject describe(Minecraft mc) {
        JsonObject o = new JsonObject();
        Vec3 eye = mc.player.getEyePosition();
        o.add("pos", vec(eye));
        o.addProperty("yaw", round(Mth.wrapDegrees(mc.player.getYRot())));
        o.addProperty("pitch", round(mc.player.getXRot()));
        o.addProperty("roll", CamState.roll);
        o.addProperty("fov", round(CamState.lastFov));
        o.addProperty("dim", mc.level.dimension().location().toString());
        o.addProperty("gamemode", mc.gameMode.getPlayerMode().getName());
        o.addProperty("dayTime", mc.level.getDayTime() % 24000);
        o.addProperty("weather", mc.level.isThundering() ? "thunder" : mc.level.isRaining() ? "rain" : "clear");
        o.addProperty("frozen", Freeze.frozen);
        // 存档用目录名（mcai game start world=... 用的就是它）；level.dat 里的显示名从服务端复制来时都叫 world
        o.addProperty("world", mc.getSingleplayerServer() != null
                ? mc.getSingleplayerServer().getWorldPath(LevelResource.ROOT).normalize().getFileName().toString()
                : mc.getCurrentServer() != null ? mc.getCurrentServer().ip : "");
        o.addProperty("singleplayer", mc.getSingleplayerServer() != null);

        int[] chunks = ShootAction.chunkProgress(mc);
        JsonObject c = new JsonObject();
        c.addProperty("loaded", chunks[0]);
        c.addProperty("needed", chunks[1]);
        c.addProperty("total", mc.level.getChunkSource().getLoadedChunksCount());
        c.addProperty("meshDone", mc.levelRenderer.hasRenderedAllChunks());
        // 区块都到了、网格也编译完了才算画面完整
        c.addProperty("rendered", chunks[0] == chunks[1] && mc.levelRenderer.hasRenderedAllChunks());
        o.add("chunks", c);

        if (mc.screen != null) o.add("screen", ClickAction.describe(mc.screen));
        o.addProperty("paused", mc.isPaused());
        // 直接问 GLFW：游戏自己的 isWindowActive 只在收到焦点事件时更新，后台启动、从没拿到过焦点时会一直是 true
        long handle = mc.getWindow().getWindow();
        JsonObject win = new JsonObject();
        win.addProperty("focused", GLFW.glfwGetWindowAttrib(handle, GLFW.GLFW_FOCUSED) == GLFW.GLFW_TRUE);
        win.addProperty("visible", GLFW.glfwGetWindowAttrib(handle, GLFW.GLFW_VISIBLE) == GLFW.GLFW_TRUE);
        win.addProperty("minimized", GLFW.glfwGetWindowAttrib(handle, GLFW.GLFW_ICONIFIED) == GLFW.GLFW_TRUE);
        win.addProperty("size", mc.getWindow().getWidth() + "x" + mc.getWindow().getHeight());
        o.add("window", win);
        o.addProperty("input", Input.enabled ? "on" : "off");
        o.addProperty("undoDepth", Undo.depth());
        o.addProperty("port", HttpApi.port);
        return o;
    }

    static JsonArray vec(Vec3 v) {
        JsonArray a = new JsonArray();
        a.add(round(v.x));
        a.add(round(v.y));
        a.add(round(v.z));
        return a;
    }

    static double round(double v) {
        return Math.round(v * 1000) / 1000.0;
    }
}
