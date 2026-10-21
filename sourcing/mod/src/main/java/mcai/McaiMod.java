package mcai;

import mcai.terrain.TerrainTypes;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.fml.loading.FMLEnvironment;

/**
 * 两端都装：取材客户端用全部功能；取材服务端（无界面）用暮色放大 4 倍的地标网格（TwilightGrid）、主世界的生成时修整和放大的古城（BigJigsaw），
 * 新世界由服务端预生成，客户端的集成服务端在镜头飞到没生成过的地方时补生成，两边必须用同一套网格。
 * 主世界的生成时修整（mcai.terrain）同理：放了「主世界修整」数据包的世界，生成它的每一端都要装。
 * 客户端专用的类（Minecraft、窗口、输入）全在 McaiClient 里，只在客户端加载。
 */
@Mod("mcai")
public class McaiMod {
    public McaiMod() {
        MinecraftForge.EVENT_BUS.addListener(TwilightGrid::onServerAboutToStart);
        // 超出原版范围的大拼图结构（古城放大4倍 数据包）：读存档时留多远的结构引用，按这个世界的结构注册表算
        MinecraftForge.EVENT_BUS.addListener(BigJigsaw::onServerAboutToStart);
        // 大结构铺满它的群系（放大的古城地下全是深暗之域，长幽匿）：只认数据包里的结构标签 mcai:fill_biome
        MinecraftForge.EVENT_BUS.addListener(FillBiome::onServerAboutToStart);
        // 主世界生成时修整的两种密度函数（mcai.terrain），只有世界里放了「主世界修整」数据包才用到
        TerrainTypes.register(FMLJavaModLoadingContext.get().getModEventBus());
        if (FMLEnvironment.dist == Dist.CLIENT) McaiClient.init();
    }
}
