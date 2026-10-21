package mcai;

import net.minecraftforge.client.event.ViewportEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;

/** cam 动作设的 FOV 和 roll。传送走服务端，这两个量只存在于客户端渲染里，用 Forge 的视口事件套上去。 */
public final class CamState {
    /**
     * 垂直视角（度）。0 表示交还给游戏自己算。
     * 接管的原因：旁观模式在飞行，游戏会把设置里的 FOV 再乘 1.1（疾跑、药水也会改），
     * 不接管的话同一个 fov 参数拍出来的视角不固定，也没法和参考模型库的机位对上。
     */
    public static volatile double fov = 0;
    public static volatile float roll = 0;
    /** 最近一帧实际用的 FOV，给 state 和截图元数据用。 */
    public static volatile double lastFov = 70;

    private CamState() {
    }

    @SubscribeEvent
    public static void onFov(ViewportEvent.ComputeFov event) {
        // usedConfiguredFov=false 是画手持物品用的固定 70 度，不动它
        if (!event.usedConfiguredFov()) return;
        if (fov > 0) event.setFOV(fov);
        lastFov = event.getFOV();
    }

    @SubscribeEvent
    public static void onAngles(ViewportEvent.ComputeCameraAngles event) {
        if (roll != 0) event.setRoll(roll);
    }
}
