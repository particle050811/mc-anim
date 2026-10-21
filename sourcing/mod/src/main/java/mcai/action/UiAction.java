package mcai.action;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.platform.Lighting;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.platform.Window;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexSorting;
import mcai.Action;
import mcai.ActionException;
import mcai.Args;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSelectionList;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.world.InteractionHand;
import net.minecraftforge.client.ForgeHooksClient;
import org.joml.Matrix4f;
import org.lwjgl.opengl.GL11;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * 操作和录制游戏界面（6-2-3 要录结构罗盘搜索远古城市的界面）。
 * shoot 只画世界、拍不到界面；这里只画界面，分别画在纯黑和纯白的底上，两张一减得到每个像素的不透明度和颜色，
 * 存成带透明通道的 PNG：界面自己的半透明压暗底（`Screen.renderBackground` 的渐变）也留下，叠到参考模型库画面上就是游戏里开着界面的样子。
 * 鼠标不画（游戏不画光标），悬停高亮按 mx、my 算。
 * 点按钮、选列表、打字都直接调界面的 mouseClicked / charTyped，不走真实鼠标键盘，输入锁定（input off）时照样能用。
 */
public class UiAction implements Action {
    private static int savedGuiScale = -1;
    private static int savedW = -1, savedH = -1;

    public String name() {
        return "ui";
    }

    public String doc() {
        return "游戏界面：op=size 设虚拟窗口和界面缩放 / use 右键用主手物品（打开物品的界面）/ click 在界面坐标点一下 / scroll / type 打字 / key 按键 / info 列控件 / shoot 只拍界面（透明底 PNG）";
    }

    public List<Param> params() {
        return List.of(
                Param.must("op", "size|reset|use|click|scroll|type|key|info|shoot", "做什么"),
                Param.opt("w", "像素", "size：虚拟窗口宽"),
                Param.opt("h", "像素", "size：虚拟窗口高"),
                Param.opt("scale", "整数", "size：界面缩放（游戏设置里的界面尺寸），默认不改"),
                Param.opt("x", "界面坐标", "click / scroll：横坐标（界面缩放以后的坐标，左上角 0,0）"),
                Param.opt("y", "界面坐标", "click / scroll：纵坐标"),
                Param.opt("button", "0|1|2", "click：鼠标键，默认 0（左键）"),
                Param.opt("dy", "格", "scroll：滚多少（正 = 往上滚）"),
                Param.opt("text", "文字", "type：逐字送进界面（charTyped）"),
                Param.opt("key", "GLFW 键码", "key：按一下（keyPressed + keyReleased），如 259 = 退格、257 = 回车"),
                Param.opt("mx", "界面坐标", "shoot：鼠标停在哪（悬停高亮），默认 -1（不在界面上）"),
                Param.opt("my", "界面坐标", "shoot"),
                Param.opt("cursor", "on|off", "shoot：输入框的光标这一张亮还是灭（不给就按游戏自己的闪烁节奏，录屏时两张之间隔的真实时间对不上，闪得不对）"),
                Param.opt("out", "文件路径", "shoot：PNG 存到哪"));
    }

    public Where where() {
        return Where.CLIENT;
    }

    public JsonElement run(Args args) throws Exception {
        Minecraft mc = Minecraft.getInstance();
        String op = args.str("op");
        JsonObject o = new JsonObject();
        switch (op) {
            case "size" -> {
                Window win = mc.getWindow();
                if (savedW < 0) {
                    savedW = win.getWidth();
                    savedH = win.getHeight();
                    savedGuiScale = mc.options.guiScale().get();
                }
                if (args.has("scale")) mc.options.guiScale().set((int) args.num("scale"));
                win.setWidth((int) args.num("w"));
                win.setHeight((int) args.num("h"));
                mc.resizeDisplay();
                o.addProperty("guiScale", win.getGuiScale());
                o.addProperty("guiW", win.getGuiScaledWidth());
                o.addProperty("guiH", win.getGuiScaledHeight());
            }
            case "reset" -> {
                if (savedW > 0) {
                    mc.getWindow().setWidth(savedW);
                    mc.getWindow().setHeight(savedH);
                    mc.options.guiScale().set(savedGuiScale);
                    mc.resizeDisplay();
                    savedW = savedH = savedGuiScale = -1;
                }
                o.addProperty("reset", true);
            }
            case "use" -> {
                if (mc.player == null || mc.gameMode == null) throw new ActionException("还没进入世界");
                if (mc.player.isSpectator()) throw new ActionException("旁观模式不能用物品，先 cmd gamemode creative");
                o.addProperty("result", mc.gameMode.useItem(mc.player, InteractionHand.MAIN_HAND).toString());
            }
            case "click" -> {
                Screen s = screen(mc);
                double x = args.num("x"), y = args.num("y");
                int b = (int) args.num("button", 0);
                s.mouseMoved(x, y);
                o.addProperty("clicked", s.mouseClicked(x, y, b));
                // 点按钮可能已经把界面关掉了（比如 搜索），松开只发给还开着的那个界面
                if (mc.screen == s) s.mouseReleased(x, y, b);
            }
            case "scroll" -> o.addProperty("scrolled", screen(mc).mouseScrolled(args.num("x"), args.num("y"), args.num("dy")));
            case "type" -> {
                Screen s = screen(mc);
                for (char c : args.str("text").toCharArray()) s.charTyped(c, 0);
                o.addProperty("typed", args.str("text"));
            }
            case "key" -> {
                Screen s = screen(mc);
                int k = (int) args.num("key");
                s.keyPressed(k, 0, 0);
                if (mc.screen == s) s.keyReleased(k, 0, 0);
            }
            case "info" -> {
                Window win = mc.getWindow();
                o.addProperty("guiScale", win.getGuiScale());
                o.addProperty("guiW", win.getGuiScaledWidth());
                o.addProperty("guiH", win.getGuiScaledHeight());
                if (mc.screen != null) {
                    o.add("screen", ClickAction.describe(mc.screen));
                    o.add("widgets", widgets(mc.screen));
                }
            }
            case "shoot" -> {
                Screen s = screen(mc);
                Path out = args.path("out");
                int mx = (int) args.num("mx", -1), my = (int) args.num("my", -1);
                if (args.has("cursor")) setCursor(s, args.str("cursor").equals("on"));
                byte[] png = shoot(mc, s, mx, my);
                Files.createDirectories(out.getParent());
                Files.write(out, png);
                o.addProperty("out", out.toString());
            }
            default -> throw new ActionException("op 只能是 size|reset|use|click|scroll|type|key|info|shoot，收到 " + op);
        }
        if (mc.screen != null) o.addProperty("screenNow", mc.screen.getClass().getSimpleName());
        return o;
    }

    /**
     * 输入框光标的闪烁：EditBox 每个客户端刻 frame + 1，frame / 6 % 2 == 0 时画光标；模组的输入框可能自己另记一个
     * （结构罗盘的 TransparentTextField 是 pseudoCursorCounter）。都是私有字段（运行时是混淆名），找法：从输入框的类往上到 EditBox，
     * 所有 int 字段里调一次 tick() 恰好 + 1 的那些。亮 = 都设成 0，灭 = 都设成 6。
     */
    private static final java.util.Map<Class<?>, List<java.lang.reflect.Field>> counters = new java.util.HashMap<>();

    private static void setCursor(Screen s, boolean on) throws Exception {
        for (GuiEventListener c : s.children()) {
            if (!(c instanceof net.minecraft.client.gui.components.EditBox box)) continue;
            List<java.lang.reflect.Field> found = counters.get(box.getClass());
            if (found == null) {
                List<java.lang.reflect.Field> ints = new java.util.ArrayList<>();
                for (Class<?> k = box.getClass(); k != null && net.minecraft.client.gui.components.EditBox.class.isAssignableFrom(k); k = k.getSuperclass()) {
                    for (java.lang.reflect.Field f : k.getDeclaredFields()) {
                        if (f.getType() == int.class && !java.lang.reflect.Modifier.isStatic(f.getModifiers())) {
                            f.setAccessible(true);
                            ints.add(f);
                        }
                    }
                }
                int[] before = new int[ints.size()];
                for (int i = 0; i < ints.size(); i++) before[i] = ints.get(i).getInt(box);
                box.tick();
                found = new java.util.ArrayList<>();
                for (int i = 0; i < ints.size(); i++) if (ints.get(i).getInt(box) == before[i] + 1) found.add(ints.get(i));
                if (found.isEmpty()) throw new ActionException("找不到输入框的光标计数字段");
                counters.put(box.getClass(), found);
            }
            for (java.lang.reflect.Field f : found) f.setInt(box, on ? 0 : 6);
        }
    }

    private static Screen screen(Minecraft mc) {
        if (mc.screen == null) throw new ActionException("当前没有界面");
        return mc.screen;
    }

    private static JsonArray widgets(Screen screen) {
        JsonArray a = new JsonArray();
        for (GuiEventListener c : screen.children()) {
            JsonObject w = new JsonObject();
            w.addProperty("type", c.getClass().getSimpleName());
            if (c instanceof AbstractWidget aw) {
                w.addProperty("x", aw.getX());
                w.addProperty("y", aw.getY());
                w.addProperty("w", aw.getWidth());
                w.addProperty("h", aw.getHeight());
                w.addProperty("text", aw.getMessage().getString());
                w.addProperty("active", aw.active);
            }
            if (c instanceof AbstractSelectionList<?> l) {
                w.addProperty("left", l.getLeft());
                w.addProperty("top", l.getTop());
                w.addProperty("right", l.getRight());
                w.addProperty("bottom", l.getBottom());
                w.addProperty("rowLeft", l.getRowLeft());
                w.addProperty("rowWidth", l.getRowWidth());
                w.addProperty("scroll", l.getScrollAmount());
                JsonArray rows = new JsonArray();
                Object sel = l.getSelected();
                int i = 0, selIndex = -1;
                for (Object e : l.children()) {
                    rows.add(e instanceof net.minecraft.client.gui.components.ObjectSelectionList.Entry<?> en ? en.getNarration().getString() : String.valueOf(e));
                    if (e == sel) selIndex = i;
                    i++;
                }
                w.add("rows", rows);
                w.addProperty("selected", selIndex);
            }
            a.add(w);
        }
        return a;
    }

    /** 只画界面，黑底一张、白底一张，解出透明度：a = 1 − (白 − 黑)，颜色 = 黑 / a。 */
    private static byte[] shoot(Minecraft mc, Screen s, int mx, int my) throws Exception {
        RenderTarget main = mc.getMainRenderTarget();
        int w = main.width, h = main.height;
        try (NativeImage black = draw(mc, s, mx, my, 0f); NativeImage white = draw(mc, s, mx, my, 1f);
             NativeImage out = new NativeImage(w, h, false)) {
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int b = black.getPixelRGBA(x, y), wt = white.getPixelRGBA(x, y); // ABGR
                    int[] cb = {b & 255, (b >> 8) & 255, (b >> 16) & 255};
                    int[] cw = {wt & 255, (wt >> 8) & 255, (wt >> 16) & 255};
                    double diff = ((cw[0] - cb[0]) + (cw[1] - cb[1]) + (cw[2] - cb[2])) / 3.0 / 255.0;
                    double a = Math.min(1, Math.max(0, 1 - diff));
                    int r = 0, g = 0, bl = 0;
                    if (a > 0) {
                        r = (int) Math.round(Math.min(255, cb[0] / a));
                        g = (int) Math.round(Math.min(255, cb[1] / a));
                        bl = (int) Math.round(Math.min(255, cb[2] / a));
                    }
                    int A = (int) Math.round(a * 255);
                    out.setPixelRGBA(x, y, (A << 24) | (bl << 16) | (g << 8) | r);
                }
            }
            return out.asByteArray();
        }
    }

    private static NativeImage draw(Minecraft mc, Screen s, int mx, int my, float bg) {
        RenderTarget main = mc.getMainRenderTarget();
        Window win = mc.getWindow();
        main.bindWrite(true);
        RenderSystem.clearColor(bg, bg, bg, 1f);
        RenderSystem.clear(GL11.GL_COLOR_BUFFER_BIT | GL11.GL_DEPTH_BUFFER_BIT, Minecraft.ON_OSX);
        // 同 GameRenderer.render 里画界面的那一段
        Matrix4f m = new Matrix4f().setOrtho(0f, (float) (win.getWidth() / win.getGuiScale()), (float) (win.getHeight() / win.getGuiScale()), 0f, 1000f, ForgeHooksClient.getGuiFarPlane());
        RenderSystem.setProjectionMatrix(m, VertexSorting.ORTHOGRAPHIC_Z);
        PoseStack mv = RenderSystem.getModelViewStack();
        mv.pushPose();
        mv.setIdentity();
        mv.translate(0, 0, 1000f - ForgeHooksClient.getGuiFarPlane());
        RenderSystem.applyModelViewMatrix();
        Lighting.setupFor3DItems();
        GuiGraphics g = new GuiGraphics(mc, mc.renderBuffers().bufferSource());
        s.renderWithTooltip(g, mx, my, 0f);
        g.flush();
        mv.popPose();
        RenderSystem.applyModelViewMatrix();
        return Screenshot.takeScreenshot(main);
    }
}
