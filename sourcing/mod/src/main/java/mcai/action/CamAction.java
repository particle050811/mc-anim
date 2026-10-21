package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import mcai.CamState;
import mcai.Game;
import net.minecraft.client.Minecraft;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

import java.util.List;

public class CamAction implements Action {
    public String name() {
        return "cam";
    }

    public String doc() {
        return "摆机位：把玩家切成旁观模式当摄像机。pos 是镜头（眼睛）的位置；朝向用 look（看向的目标点）或 yaw/pitch 给，都不给就保持原朝向";
    }

    public List<Param> params() {
        return List.of(
                Param.opt("pos", "x,y,z", "镜头位置，不写就留在原地"),
                Param.opt("look", "x,y,z", "看向的目标点，朝向由 mod 算"),
                Param.opt("yaw", "度", "水平朝向：0 朝南(+Z)，90 朝西(-X)，180 朝北，-90 朝东"),
                Param.opt("pitch", "度", "俯仰：正值朝下，90 垂直俯视"),
                Param.opt("fov", "度", "垂直视角。首次调用默认 70，之后沿用上次的值；写 0 交还给游戏自己算"),
                Param.opt("roll", "度", "绕视线轴的滚转，沿用上次的值，写 0 复位"),
                Param.opt("dim", "维度 id", "如 twilightforest:twilight_forest，不写就是当前维度"));
    }

    public Where where() {
        // 传送在服务端做，但要等客户端真的到位才能返回（否则紧跟着的 shoot 拍到的还是旧位置），所以自己分步调度
        return Where.HTTP;
    }

    public JsonElement run(Args args) throws Exception {
        if (args.has("look") && (args.has("yaw") || args.has("pitch"))) throw new ActionException("look 和 yaw/pitch 只能给一种");
        // 镜头一旦交给 mod 摆，FOV 就固定下来（理由见 CamState.fov）
        if (args.has("fov")) CamState.fov = args.num("fov");
        else if (CamState.fov == 0) CamState.fov = 70;
        if (args.has("roll")) CamState.roll = (float) args.num("roll");

        Vec3 target = Game.onServer(() -> {
            ServerPlayer player = Game.player();
            ServerLevel level = Game.level(args);
            if (player.gameMode.getGameModeForPlayer() != GameType.SPECTATOR) player.setGameMode(GameType.SPECTATOR);
            Vec3 eye = args.has("pos") ? args.vec("pos") : player.getEyePosition();
            float yaw = (float) args.num("yaw", player.getYRot());
            float pitch = (float) args.num("pitch", player.getXRot());
            if (args.has("look")) {
                Vec3 d = args.vec("look").subtract(eye);
                double flat = Math.sqrt(d.x * d.x + d.z * d.z);
                // MC 约定：yaw 0 朝南(+Z)、90 朝西(-X)；pitch 正值朝下。正上/正下看时水平分量为 0，yaw 保持原值
                if (flat > 1e-6) yaw = (float) Math.toDegrees(Math.atan2(-d.x, d.z));
                pitch = (float) -Math.toDegrees(Math.atan2(d.y, flat));
            }
            // teleportTo 收的是脚底坐标
            player.teleportTo(level, eye.x, eye.y - player.getEyeHeight(), eye.z, yaw, Mth.clamp(pitch, -90, 90));
            return eye;
        });

        String dim = Game.onServer(() -> Game.player().level().dimension().location().toString());
        Minecraft mc = Minecraft.getInstance();
        long deadline = System.currentTimeMillis() + 30_000;
        while (true) {
            boolean arrived = Game.onClient(() -> mc.player != null && mc.level != null
                    && mc.level.dimension().location().toString().equals(dim)
                    && mc.player.getEyePosition().distanceTo(target) < 0.05);
            if (arrived) break;
            if (System.currentTimeMillis() > deadline) throw new ActionException("传送指令已发出，但 30 秒内客户端没有到位（mcai state 看看卡在哪）");
            Thread.sleep(20);
        }
        return Game.onClient(() -> {
            JsonObject o = new JsonObject();
            o.add("pos", StateAction.vec(mc.player.getEyePosition()));
            o.addProperty("yaw", StateAction.round(Mth.wrapDegrees(mc.player.getYRot())));
            o.addProperty("pitch", StateAction.round(mc.player.getXRot()));
            o.addProperty("fov", CamState.fov);
            o.addProperty("roll", CamState.roll);
            o.addProperty("dim", dim);
            return o;
        });
    }
}
