package mcai;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;

/**
 * 输入锁定 + 窗口隐藏。默认关（enabled=false）：
 * - 窗口直接隐藏（glfwHideWindow）。截图是往离屏帧缓冲里画的，不需要窗口可见；
 *   看不见的窗口不会挡视线，也点不到；
 * - 即使窗口因为别的原因露出来，鼠标移动/点击/滚轮、键盘这几个入口也都在 mixin 里直接丢掉
 *   （MouseHandlerMixin、KeyboardHandlerMixin），游戏抓不到鼠标、视角不会转、不会触发交互、ESC 弹不出菜单。
 *   不用“开一个空界面挡输入”的办法：那会让集成服务端以为有界面开着，也会改变 state 里的界面状态。
 * mcai input on 才把窗口显示出来并放开输入，给用户自己进游戏操作用。
 */
public final class Input {
    public static volatile boolean enabled = false;

    private Input() {
    }

    /** 只能在渲染线程（macOS 上就是主线程）调：GLFW 的窗口函数不允许在别的线程用。 */
    public static void set(boolean on) {
        Minecraft mc = Minecraft.getInstance();
        long window = mc.getWindow().getWindow();
        if (on) {
            enabled = true;
            GLFW.glfwShowWindow(window);
            GLFW.glfwFocusWindow(window);
        } else {
            // 先松开已经按下的键和抓住的鼠标，否则锁定后人物会一直往前走
            mc.mouseHandler.releaseMouse();
            KeyMapping.releaseAll();
            enabled = false;
            GLFW.glfwHideWindow(window);
        }
    }
}
