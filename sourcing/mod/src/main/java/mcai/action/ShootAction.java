package mcai.action;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.platform.Window;
import com.mojang.blaze3d.vertex.PoseStack;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import mcai.CamState;
import mcai.Game;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.chunk.ChunkStatus;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.CRC32;

public class ShootAction implements Action {
    /** 连续这么多轮画面都就绪才按快门。理由见 run()。 */
    private static final int STABLE_FRAMES = 10;

    public String name() {
        return "shoot";
    }

    public String doc() {
        return "截图存成 PNG：只画世界（没有 HUD、手、准星、菜单），等区块加载和网格编译完才拍；机位、FOV、时间、天气写进 PNG 文本块（mcai meta 读）";
    }

    public List<Param> params() {
        return List.of(
                Param.must("out", "文件路径", "PNG 存到哪，相对路径按 mcai 的当前目录算，目录不存在会建"),
                Param.opt("size", "宽x高", "输出像素，默认 1920x1080，和窗口大小无关"),
                Param.opt("timeout", "秒", "等画面就绪的上限，默认 60"));
    }

    public Where where() {
        // 要跨很多帧等区块，不能占住渲染线程；在 HTTP 线程上循环，每次往渲染线程投一小步
        return Where.HTTP;
    }

    public JsonElement run(Args args) throws Exception {
        Path out = args.path("out");
        String[] wh = args.str("size", "1920x1080").toLowerCase().split("x");
        if (wh.length != 2) throw new ActionException("size 要写成 宽x高，如 1920x1080");
        int w = Integer.parseInt(wh[0].trim()), h = Integer.parseInt(wh[1].trim());
        long deadline = System.currentTimeMillis() + (long) (args.num("timeout", 60) * 1000);

        // 为什么要“连续多次都就绪”而不是看到一次就拍：区块网格一圈圈往外编译，两批之间队列会短暂为空，
        // 服务端也可能还在补发最外圈区块，只看一次会拍到加载一半的地形。所以要求连续 STABLE_FRAMES 轮（隔 30ms）都满足：
        // 区块到齐、编译队列空、已加载区块总数没再变。每轮都按输出尺寸真画一帧（视锥随画面比例变，要按实际视锥驱动编译），
        // 最后一轮那一帧直接取像素，不再另画（状态可能又变）。
        JsonObject meta = new JsonObject();
        PngSink save = png -> {
            JsonObject m = StateAction.describe(Minecraft.getInstance());
            m.addProperty("size", w + "x" + h);
            // 参考模型库的机位用 36mm 画幅的镜头焦距表示水平视角，顺手换算好：lens = 18 / (tan(垂直视角/2) × 宽高比)
            m.addProperty("lens36", StateAction.round(18 / (Math.tan(Math.toRadians(CamState.lastFov) / 2) * w / h)));
            for (String drop : new String[]{"chunks", "screen", "paused", "window", "input", "undoDepth"}) m.remove(drop);
            Files.createDirectories(out.getParent());
            Files.write(out, withText(png, "mcai", m.toString()));
            m.entrySet().forEach(e -> meta.add(e.getKey(), e.getValue()));
        };
        int stable = 0;
        int[] lastTotal = {-1};
        while (true) {
            boolean last = stable == STABLE_FRAMES - 1;
            String notReady = Game.onClient(() -> {
                String why = step(w, h, last ? save : null);
                int total = Minecraft.getInstance().level == null ? -1 : Minecraft.getInstance().level.getChunkSource().getLoadedChunksCount();
                if (why == null && total != lastTotal[0]) why = "区块还在陆续到达";
                lastTotal[0] = total;
                return why;
            });
            if (notReady == null && last) break;
            stable = notReady == null ? stable + 1 : 0;
            if (notReady != null && System.currentTimeMillis() > deadline) {
                throw new ActionException("等到超时画面还没就绪：" + notReady);
            }
            Thread.sleep(30);
        }
        meta.addProperty("out", out.toString());
        return meta;
    }

    private interface PngSink {
        void accept(byte[] png) throws IOException;
    }

    /** 渲染线程上的一步：检查 → 按输出尺寸画一帧世界 →（可选）取像素。返回 null 表示画面就绪，否则是没就绪的原因。 */
    private static String step(int w, int h, PngSink sink) throws IOException {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return "还没进入世界";
        if (mc.isPaused()) return "游戏暂停中（" + mc.screen.getClass().getSimpleName() + " 开着，集成服务端停了，区块不会加载），先 closescreen";
        int[] chunks = chunkProgress(mc);
        if (chunks[0] < chunks[1]) return "区块还在加载 " + chunks[0] + "/" + chunks[1];

        // 做法：临时把主帧缓冲改成输出尺寸，只调 renderLevel 画世界，画完改回去。
        // - 只调 renderLevel：HUD、准星、菜单都在它外面画，天然拍不到，所以有界面挡着也能拍；
        // - 画在离屏帧缓冲里：和窗口大小、是否被遮挡、是否在前台都无关；
        // - 不另建一个帧缓冲：LevelRenderer 画实体描边前会把输出重新绑回“主帧缓冲”，另建的会被它绑走
        //   （原版全景截图靠全景模式绕开，但全景模式会把 FOV 锁死在 90）。
        Window window = mc.getWindow();
        RenderTarget main = mc.getMainRenderTarget();
        int oldW = window.getWidth(), oldH = window.getHeight();
        boolean resize = oldW != w || oldH != h;
        mc.gameRenderer.setRenderHand(false);
        mc.gameRenderer.setRenderBlockOutline(false);
        try {
            if (resize) resize(mc, w, h);
            main.bindWrite(true);
            // partialTick 固定 1：镜头和实体都画在“当前 tick 的确切位置”，同一机位重拍结果一致
            mc.gameRenderer.renderLevel(1.0F, 0L, new PoseStack());
            if (!mc.levelRenderer.hasRenderedAllChunks()) return "区块网格还在编译";
            if (sink != null) {
                try (NativeImage image = Screenshot.takeScreenshot(main)) {
                    sink.accept(image.asByteArray());
                }
            }
            return null;
        } finally {
            mc.gameRenderer.setRenderHand(true);
            mc.gameRenderer.setRenderBlockOutline(true);
            if (resize) resize(mc, oldW, oldH);
            main.bindWrite(true);
        }
    }

    private static void resize(Minecraft mc, int w, int h) {
        mc.getWindow().setWidth(w);
        mc.getWindow().setHeight(h);
        mc.getMainRenderTarget().resize(w, h, Minecraft.ON_OSX);
        mc.gameRenderer.resize(w, h);
    }

    /**
     * 镜头周围该有的区块到了多少：{已到, 应到}。
     * 网格编译队列为空只说明“已经到客户端的区块”编译完了，刚传送过去时区块还在路上，所以要单独数。
     * 半径取渲染距离减 1 的圆：服务端下发范围比这个略大，圆内的一定会到，不会永远等不齐。
     */
    static int[] chunkProgress(Minecraft mc) {
        int r = mc.options.getEffectiveRenderDistance() - 1;
        ChunkPos center = mc.player.chunkPosition();
        int loaded = 0, needed = 0;
        for (int dx = -r; dx <= r; dx++) {
            for (int dz = -r; dz <= r; dz++) {
                if (dx * dx + dz * dz > r * r) continue;
                needed++;
                if (mc.level.getChunkSource().getChunk(center.x + dx, center.z + dz, ChunkStatus.FULL, false) != null) loaded++;
            }
        }
        return new int[]{loaded, needed};
    }

    /** 在 IHDR 后面插一个 iTXt 文本块（UTF-8，不压缩）。不另外生成元数据文件，图和机位永远在一起。 */
    private static byte[] withText(byte[] png, String keyword, String text) throws IOException {
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        data.write(keyword.getBytes(StandardCharsets.ISO_8859_1));
        data.write(new byte[]{0, 0, 0, 0, 0}); // 关键字结束符、不压缩、压缩方法、空语言标签、空译名
        data.write(text.getBytes(StandardCharsets.UTF_8));
        byte[] type = "iTXt".getBytes(StandardCharsets.ISO_8859_1);
        CRC32 crc = new CRC32();
        crc.update(type);
        crc.update(data.toByteArray());

        int ihdrEnd = 8 + 4 + 4 + 13 + 4; // 签名 + IHDR 的长度、类型、数据、CRC
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        DataOutputStream o = new DataOutputStream(out);
        o.write(png, 0, ihdrEnd);
        o.writeInt(data.size());
        o.write(type);
        o.write(data.toByteArray());
        o.writeInt((int) crc.getValue());
        o.write(png, ihdrEnd, png.length - ihdrEnd);
        return out.toByteArray();
    }
}
