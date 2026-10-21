package mcai.terrain;

import com.mojang.serialization.Codec;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;

import java.util.Map;

/**
 * 注册 mcai:region、mcai:edit 两种密度函数类型。注册本身不改任何世界：只有数据包（取材mod/数据包/主世界修整/）引用了它们才起作用。
 * 反过来，引用了它们的数据包放进世界以后，打开这个世界的每一端（主世界专用服务端、客户端的集成服务端）都必须装这个 mod，
 * 否则数据包读不进来：专用服务端起不来，客户端会提示进安全模式（只用原版数据），那样生成出来的就是没修整过的地形。
 */
public final class TerrainTypes {
    /** 类型名 → codec。下面的注册和离线测试（取材mod/测试/TerrainEditTest.java）都从这里取，类型名只写这一处 */
    public static final Map<String, Codec<? extends DensityFunction>> CODECS = Map.of(
            "region", Region.CODEC.codec(),
            "edit", TerrainEdit.CODEC.codec());

    // 密度函数类型是原版的内置注册表；Forge 在注册阶段把原版注册表解冻，DeferredRegister 在它的 RegisterEvent 里注册进去
    private static final DeferredRegister<Codec<? extends DensityFunction>> TYPES = DeferredRegister.create(Registries.DENSITY_FUNCTION_TYPE, "mcai");

    static {
        // 注册的必须是 KeyDispatchDataCodec 里存着的那一个 codec 对象：写回 JSON 时按对象本身（不是内容）反查类型名
        CODECS.forEach((name, codec) -> TYPES.register(name, () -> codec));
    }

    private TerrainTypes() {
    }

    public static void register(IEventBus modBus) {
        TYPES.register(modBus);
    }
}
