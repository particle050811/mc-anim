package mcai;

import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.thread.BlockableEventLoop;

import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

/** 取游戏对象、切线程的小工具。游戏状态的读写一律投递到对应线程上做。 */
public final class Game {
    private Game() {
    }

    public static Minecraft mc() {
        return Minecraft.getInstance();
    }

    public static MinecraftServer server() {
        MinecraftServer server = mc().getSingleplayerServer();
        if (server == null) throw new ActionException("这个动作要在单人世界里用（靠集成服务端改世界），现在没有打开单人世界");
        return server;
    }

    /** 当摄像机用的玩家。单人世界里只有房主一个玩家。 */
    public static ServerPlayer player() {
        var players = server().getPlayerList().getPlayers();
        if (players.isEmpty()) throw new ActionException("玩家还没进入世界");
        return players.get(0);
    }

    /** dim 参数没写就用玩家当前所在维度。 */
    public static ServerLevel level(Args args) {
        if (!args.has("dim")) return player().serverLevel();
        ResourceLocation id = ResourceLocation.tryParse(args.str("dim"));
        ServerLevel level = id == null ? null : server().getLevel(ResourceKey.create(Registries.DIMENSION, id));
        if (level == null) throw new ActionException("没有这个维度：" + args.str("dim"));
        return level;
    }

    public static <T> T onClient(Callable<T> job) throws Exception {
        return on(mc(), job);
    }

    public static <T> T onServer(Callable<T> job) throws Exception {
        return on(server(), job);
    }

    private static <T> T on(BlockableEventLoop<?> loop, Callable<T> job) throws Exception {
        CompletableFuture<T> done = new CompletableFuture<>();
        loop.execute(() -> {
            try {
                done.complete(job.call());
            } catch (Throwable t) {
                done.completeExceptionally(t);
            }
        });
        try {
            return done.get();
        } catch (ExecutionException e) {
            if (e.getCause() instanceof Exception cause) throw cause;
            throw e;
        }
    }
}
