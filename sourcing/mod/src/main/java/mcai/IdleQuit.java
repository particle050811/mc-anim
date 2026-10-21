package mcai;

import com.mojang.logging.LogUtils;
import net.minecraft.client.Minecraft;
import net.minecraftforge.fml.loading.FMLPaths;
import org.slf4j.Logger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 空闲自动退出：一段时间没收到 mcai 的请求，就走游戏自己的退出流程（会存档）。
 * 起因（2026-10-03）：Agent 取材完没 mcai game stop，游戏在后台空转了近 22 小时；合盖后 Mac 被 Wi-Fi/蓝牙反复暗唤醒，
 * 醒着的时间里游戏照常跑，一夜把电池从 80% 耗到 22%，机器发烫。
 */
public final class IdleQuit {
    /**
     * 默认空闲多久退出。重启游戏约 30 秒，Agent 两次取材之间隔上十几分钟很常见，所以不设太短。
     * 实例的 config/mcai.idle 里写了分钟数就用那个（mcai game start idle=… 写入，只管这一次启动），0 表示不自动退出。
     */
    public static final int DEFAULT_MINUTES = 30;
    private static final Logger LOG = LogUtils.getLogger();
    private static final AtomicInteger IN_FLIGHT = new AtomicInteger();
    /**
     * 用墙上时间而不是 nanoTime：macOS 上 nanoTime 在睡眠期间不走，合盖睡几个小时也不算空闲；
     * 墙上时间把睡眠算进去，醒来（哪怕是暗唤醒）就能退。
     */
    private static volatile long lastActivity = System.currentTimeMillis();

    private IdleQuit() {
    }

    private static int configuredMinutes() {
        Path file = FMLPaths.CONFIGDIR.get().resolve("mcai.idle");
        try {
            if (Files.isRegularFile(file)) return Integer.parseInt(Files.readString(file).trim());
        } catch (IOException | NumberFormatException e) {
            LOG.error("[mcai] {} 读不出分钟数，用默认的 {}", file, DEFAULT_MINUTES, e);
        }
        return DEFAULT_MINUTES;
    }

    public static void start() {
        int minutes = configuredMinutes();
        if (minutes <= 0) {
            LOG.info("[mcai] 空闲自动退出已关闭");
            return;
        }
        long limit = TimeUnit.MINUTES.toMillis(minutes);
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "mcai-idle");
            t.setDaemon(true);
            return t;
        });
        timer.scheduleAtFixedRate(() -> {
            if (!idleFor(limit)) return;
            LOG.info("[mcai] 已经 {} 分钟没收到 mcai 的请求，自动退出游戏", minutes);
            Minecraft mc = Minecraft.getInstance();
            mc.execute(mc::stop);
            timer.shutdown();
        }, 30, 30, TimeUnit.SECONDS);
        LOG.info("[mcai] 空闲 {} 分钟没有请求就自动退出", minutes);
    }

    private static boolean idleFor(long limit) {
        // 动作还在执行（mesh、shoot 可能跑很久）不算空闲；input on 时是人自己在游戏里操作，不会有 mcai 请求，也不退
        if (IN_FLIGHT.get() > 0 || Input.enabled) return false;
        return System.currentTimeMillis() - lastActivity >= limit;
    }

    static void begin() {
        IN_FLIGHT.incrementAndGet();
        lastActivity = System.currentTimeMillis();
    }

    static void end() {
        lastActivity = System.currentTimeMillis();
        IN_FLIGHT.decrementAndGet();
    }
}
