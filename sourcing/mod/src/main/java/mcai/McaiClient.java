package mcai;

import net.minecraft.client.Minecraft;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import net.minecraftforge.fml.event.lifecycle.FMLConstructModEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

/** 客户端部分：HTTP 接口、机位、撤销、隐藏窗口。专用服务端上不加载这个类 */
final class McaiClient {
    private McaiClient() {
    }

    static void init() {
        FMLJavaModLoadingContext.get().getModEventBus().addListener(McaiClient::clientSetup);
        // 尽早把窗口藏起来：mod 构造阶段是 mod 代码能在主线程上跑的最早时机（enqueueWork 会排到主线程）。
        // 再早窗口是 Forge/游戏自己建的，mod 管不到，所以启动时窗口仍会闪现一两秒，由 mcai game start 负责把前台还回去
        FMLJavaModLoadingContext.get().getModEventBus().addListener((FMLConstructModEvent e) -> e.enqueueWork(() -> Input.set(false)));
        MinecraftForge.EVENT_BUS.register(CamState.class);
        MinecraftForge.EVENT_BUS.register(Undo.class);
    }

    private static void clientSetup(FMLClientSetupEvent event) {
        event.enqueueWork(() -> {
            // AI 操作时焦点在终端；不关这个，游戏一失焦就弹暂停菜单，集成服务端跟着停
            Minecraft.getInstance().options.pauseOnLostFocus = false;
        });
        HttpApi.start();
        IdleQuit.start();
    }
}
