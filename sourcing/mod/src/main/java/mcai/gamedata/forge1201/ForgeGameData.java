package mcai.gamedata.forge1201;

import mcai.ActionException;
import mcai.gamedata.BiomeSource;
import mcai.gamedata.BlockSource;
import mcai.gamedata.GameData;
import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import net.minecraftforge.fml.ModList;
import net.minecraftforge.forgespi.language.IModInfo;
import net.minecraftforge.versions.forge.ForgeVersion;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Forge 1.20.1 的 {@link GameData}：在渲染线程上构造和使用（读客户端的注册表、模型、图集）。 */
public final class ForgeGameData implements GameData {
    private final Minecraft mc = Minecraft.getInstance();

    public ForgeGameData() {
        if (mc.level == null) throw new ActionException("还没进入世界：群系表要世界的注册表，先 mcai game start world=<存档>");
    }

    public String gameVersion() {
        return SharedConstants.getCurrentVersion().getName() + " forge-" + ForgeVersion.getVersion();
    }

    public Map<String, String> mods() {
        Map<String, String> out = new LinkedHashMap<>();
        ModList.get().getMods().stream().sorted(Comparator.comparing(IModInfo::getModId))
                .forEach(m -> out.put(m.getModId(), m.getVersion().toString()));
        return out;
    }

    public List<String> resourcePacks() {
        return new ArrayList<>(mc.getResourcePackRepository().getSelectedIds());
    }

    public BiomeSource biomes() {
        return new ForgeBiomes(mc.level);
    }

    public BlockSource blocks() {
        return new ForgeBlocks(mc);
    }
}
