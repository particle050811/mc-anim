import org.objectweb.asm.ClassReader;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.spongepowered.asm.launch.MixinBootstrap;
import org.spongepowered.asm.launch.platform.container.ContainerHandleVirtual;
import org.spongepowered.asm.launch.platform.container.IContainerHandle;
import org.spongepowered.asm.mixin.MixinEnvironment;
import org.spongepowered.asm.mixin.Mixins;
import org.spongepowered.asm.mixin.transformer.IMixinTransformer;
import org.spongepowered.asm.mixin.transformer.IMixinTransformerFactory;
import org.spongepowered.asm.service.IClassBytecodeProvider;
import org.spongepowered.asm.service.IClassProvider;
import org.spongepowered.asm.service.IClassTracker;
import org.spongepowered.asm.service.IGlobalPropertyService;
import org.spongepowered.asm.service.IMixinAuditTrail;
import org.spongepowered.asm.service.IPropertyKey;
import org.spongepowered.asm.service.ITransformerProvider;
import org.spongepowered.asm.service.MixinServiceAbstract;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * mixin 织入的离线核对，不开游戏：用 Forge 同版的 Mixin 0.8.5，把编好的 mcai jar 里「两端都织」的 mixin 真的织进暮色 jar 和 SRG 名的 Minecraft 类里。
 * mixin 配置要求每个注入点都找到，找不到游戏一启动就崩，这里先在离线时撞出来。跑法：sh 测试/暮色网格测试.sh（和 `TwilightGridTest` 一起跑）。
 *
 * Mixin 平时由 ModLauncher 托管，这里换成最小的托管服务（`Service`），类字节码直接从类路径读，不经过 Forge 的访问转换和 coremod。
 * 环境的端是「未知」，所以只织配置里的 "mixins"，不织 "client" 那三个（只在客户端，早就在取材客户端里用着）。织完再看几处关键的：处理函数接在了该接的地方，该换的调用换掉、不该动的还在。
 */
public class MixinApplyTest {
    static int checks, fails;

    static void check(boolean ok, String what) {
        checks++;
        if (!ok) {
            fails++;
            System.out.println("不对：" + what);
        }
    }

    /** Mixin 的托管服务：没有类加载器钩子，只提供读字节码 */
    public static class Service extends MixinServiceAbstract implements IClassProvider, IClassBytecodeProvider {
        static Service instance;

        public Service() {
            instance = this;
        }

        public String getName() {
            return "mcai-offline";
        }

        public boolean isValid() {
            return true;
        }

        /** 直接从 DEFAULT 阶段开始，配置加进来就生效 */
        public MixinEnvironment.Phase getInitialPhase() {
            return MixinEnvironment.Phase.DEFAULT;
        }

        /** mcai.mixins.json 写的是 JAVA_17 */
        public MixinEnvironment.CompatibilityLevel getMaxCompatibilityLevel() {
            return MixinEnvironment.CompatibilityLevel.JAVA_17;
        }

        public IClassProvider getClassProvider() {
            return this;
        }

        public IClassBytecodeProvider getBytecodeProvider() {
            return this;
        }

        public ITransformerProvider getTransformerProvider() {
            return null;
        }

        public IClassTracker getClassTracker() {
            return null;
        }

        public IMixinAuditTrail getAuditTrail() {
            return null;
        }

        public Collection<String> getPlatformAgents() {
            return List.of();
        }

        public IContainerHandle getPrimaryContainer() {
            return new ContainerHandleVirtual(this.getName());
        }

        public InputStream getResourceAsStream(String name) {
            return MixinApplyTest.class.getClassLoader().getResourceAsStream(name);
        }

        public URL[] getClassPath() {
            return new URL[0];
        }

        public Class<?> findClass(String name) throws ClassNotFoundException {
            return Class.forName(name, false, MixinApplyTest.class.getClassLoader());
        }

        public Class<?> findClass(String name, boolean initialize) throws ClassNotFoundException {
            return Class.forName(name, initialize, MixinApplyTest.class.getClassLoader());
        }

        public Class<?> findAgentClass(String name, boolean initialize) throws ClassNotFoundException {
            return this.findClass(name, initialize);
        }

        public ClassNode getClassNode(String name) throws ClassNotFoundException, IOException {
            return this.getClassNode(name, true);
        }

        public ClassNode getClassNode(String name, boolean runTransformers) throws ClassNotFoundException, IOException {
            ClassNode cn = new ClassNode();
            new ClassReader(bytes(name)).accept(cn, ClassReader.EXPAND_FRAMES);
            return cn;
        }

        IMixinTransformer transformer() {
            return this.getInternal(IMixinTransformerFactory.class).createTransformer();
        }
    }

    /** Mixin 的全局属性，平时放在 ModLauncher 的 Blackboard 里 */
    public static class Props implements IGlobalPropertyService {
        record Key(String name) implements IPropertyKey {
        }

        final Map<IPropertyKey, Object> map = new HashMap<>();

        public IPropertyKey resolveKey(String name) {
            return new Key(name);
        }

        @SuppressWarnings("unchecked")
        public <T> T getProperty(IPropertyKey key) {
            return (T) this.map.get(key);
        }

        public void setProperty(IPropertyKey key, Object value) {
            this.map.put(key, value);
        }

        @SuppressWarnings("unchecked")
        public <T> T getProperty(IPropertyKey key, T defaultValue) {
            return (T) this.map.getOrDefault(key, defaultValue);
        }

        public String getPropertyString(IPropertyKey key, String defaultValue) {
            Object v = this.map.get(key);
            return v == null ? defaultValue : v.toString();
        }
    }

    static byte[] bytes(String name) throws IOException, ClassNotFoundException {
        try (InputStream in = MixinApplyTest.class.getClassLoader().getResourceAsStream(name.replace('.', '/') + ".class")) {
            if (in == null) throw new ClassNotFoundException(name);
            return in.readAllBytes();
        }
    }

    /** 方法里依次调到的方法名（只看名字里带 mcai$ 的处理函数，和 names 里点名的） */
    static List<String> calls(ClassNode cn, String method, String... names) {
        List<String> out = new ArrayList<>();
        for (MethodNode m : cn.methods) {
            if (!m.name.equals(method)) continue;
            for (AbstractInsnNode n : m.instructions) {
                if (n instanceof MethodInsnNode mi && (mi.name.contains("mcai$") || List.of(names).contains(mi.name))) {
                    out.add(mi.name.contains("mcai$") ? mi.name.substring(mi.name.indexOf("mcai$")) : mi.name);
                }
            }
        }
        return out;
    }

    static boolean reads(ClassNode cn, String method, String field) {
        for (MethodNode m : cn.methods) {
            if (!m.name.equals(method)) continue;
            for (AbstractInsnNode n : m.instructions) {
                if (n instanceof FieldInsnNode f && f.name.equals(field)) return true;
            }
        }
        return false;
    }

    public static void main(String[] args) throws Exception {
        MixinBootstrap.init();
        Mixins.addConfiguration("mcai.mixins.json");
        IMixinTransformer transformer = Service.instance.transformer();

        // mcai.mixins.json 里 "mixins" 的每个目标类（织不进去这里直接抛异常）
        String[] targets = {
                "net.minecraft.server.level.ServerLevel", "net.minecraft.world.level.Level", "net.minecraft.world.ticks.LevelTicks",
                "net.minecraft.world.level.NaturalSpawner", "net.minecraft.world.entity.Mob", "net.minecraft.world.level.chunk.LevelChunk",
                "net.minecraft.world.level.chunk.LevelChunkSection",
                "twilightforest.util.LegacyLandmarkPlacements", "twilightforest.world.components.chunkgenerators.ChunkGeneratorTwilight",
                "twilightforest.world.components.structures.type.FinalCastleStructure",
                "twilightforest.world.components.structures.finalcastle.FinalCastleMazeTower13Component",
                "net.minecraft.world.level.levelgen.structure.pieces.StructurePiecesBuilder",
                "net.minecraft.world.level.levelgen.structure.structures.JigsawStructure", "net.minecraft.world.level.chunk.ChunkGenerator",
                "net.minecraft.world.level.StructureManager", "net.minecraft.world.level.chunk.storage.ChunkSerializer",
                "net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator"};
        Map<String, ClassNode> woven = new HashMap<>();
        for (String name : targets) {
            ClassNode cn = new ClassNode();
            new ClassReader(transformer.transformClassBytes(name, name, bytes(name))).accept(cn, 0);
            woven.put(name, cn);
            check(cn.methods.stream().anyMatch(m -> m.name.contains("mcai$")), name + " 没织进任何东西");
        }

        // 暮色地标网格
        ClassNode llp = woven.get("twilightforest.util.LegacyLandmarkPlacements");
        check(calls(llp, "getNearestCenterXZ").equals(List.of("mcai$nearestCenter")), "网格中心 " + calls(llp, "getNearestCenterXZ"));
        check(calls(llp, "pickLandmarkForChunk").equals(List.of("mcai$roundX", "mcai$roundZ")), "地形改造取整 " + calls(llp, "pickLandmarkForChunk"));
        check(calls(llp, "getFeatureForRegion").equals(List.of("mcai$roundX", "mcai$roundZ")), "地形改造取整 " + calls(llp, "getFeatureForRegion"));
        check(calls(llp, "pickVarietyLandmark").equals(List.of("mcai$variety")), "普通地标");
        check(calls(llp, "landmarkCenterScanner").equals(List.of("mcai$scanner")), "/locate 扫描");
        ClassNode cgt = woven.get("twilightforest.world.components.chunkgenerators.ChunkGeneratorTwilight");
        check(calls(cgt, "deformTerrainForTrollCloud2").equals(List.of("mcai$cloudRegionX", "mcai$cloudRegionZ"))
                && !reads(cgt, "deformTerrainForTrollCloud2", "f_45578_") && !reads(cgt, "deformTerrainForTrollCloud2", "f_45579_"), "云层编号");

        // 终焉城堡：getFirstPiece 返回前挪主楼；迷宫第 1 次 isWithinRange（离出口近不近）不动，第 2 次（城堡范围）换成 mcai 的
        ClassNode castle = woven.get("twilightforest.world.components.structures.type.FinalCastleStructure");
        check(calls(castle, "getFirstPiece").equals(List.of("mcai$centerOnLandmark")), "主楼 " + calls(castle, "getFirstPiece"));
        ClassNode maze = woven.get("twilightforest.world.components.structures.finalcastle.FinalCastleMazeTower13Component");
        check(calls(maze, "buildContinueTowerTowards", "isWithinRange").equals(List.of("isWithinRange", "mcai$nearCastleCenter")),
                "迷宫 " + calls(maze, "buildContinueTowerTowards", "isWithinRange"));
        // 残塔：碰撞检查（StructurePieceAccessor.findCollisionPiece，SRG 名 m_141921_）整个换成 mcai 的，迷宫塔、出口塔那两处不动
        check(calls(maze, "buildDamagedTower", "m_141921_").equals(List.of("mcai$collideOrOutOfReach")), "残塔 " + calls(maze, "buildDamagedTower", "m_141921_"));
        check(calls(maze, "buildContinueTowerTowards", "m_141921_").equals(List.of("mcai$nearCastleCenter", "m_141921_"))
                && calls(maze, "buildEndTowerTowards", "m_141921_").equals(List.of("m_141921_")),
                "迷宫塔、出口塔的碰撞检查被动了 " + calls(maze, "buildContinueTowerTowards", "m_141921_") + calls(maze, "buildEndTowerTowards", "m_141921_"));
        ClassNode builder = woven.get("net.minecraft.world.level.levelgen.structure.pieces.StructurePiecesBuilder");
        check(builder.interfaces.contains("mcai/mixin/StructurePiecesBuilderAccessor") && reads(builder, "mcai$pieces", "f_192778_"), "StructurePiecesBuilder 的 pieces");

        // 读方块碰上调色板扩容就重读：LevelChunkSection.getBlockState 里取 PalettedContainer.get 的那一处整个换成 mcai 的
        ClassNode section = woven.get("net.minecraft.world.level.chunk.LevelChunkSection");
        check(calls(section, "m_62982_", "m_63087_").equals(List.of("mcai$getRetrying")), "区段读方块 " + calls(section, "m_62982_", "m_63087_"));

        // 大拼图结构（古城放大，mcai.BigJigsaw）：SRG 名 createReferences m_223076_、tryGenerateStructure m_223104_、Structure.generate m_226596_、fillStartsForStructure m_220480_、
        // LevelAccessor.getChunk m_46819_、getStartForStructure m_220512_、unpackStructureReferences m_208154_
        ClassNode jig = woven.get("net.minecraft.world.level.levelgen.structure.structures.JigsawStructure");
        check(calls(jig, "<clinit>").equals(List.of("mcai$wideCodec")) && jig.interfaces.contains("mcai/mixin/JigsawStructureAccessor")
                && reads(jig, "mcai$maxDistanceFromCenter", "f_227611_"), "拼图结构的编解码、访问器 " + calls(jig, "<clinit>"));
        ClassNode cg = woven.get("net.minecraft.world.level.chunk.ChunkGenerator");
        check(calls(cg, "m_223076_").equals(List.of("mcai$farReferences")), "createReferences 末尾 " + calls(cg, "m_223076_"));
        check(calls(cg, "m_223104_", "m_226596_").equals(List.of("mcai$cachedStart")), "tryGenerateStructure 算起点 " + calls(cg, "m_223104_", "m_226596_"));
        ClassNode sm = woven.get("net.minecraft.world.level.StructureManager");
        check(calls(sm, "m_220480_", "m_46819_", "m_220512_").equals(List.of("mcai$chunkOrNull", "mcai$startOrFar")),
                "fillStartsForStructure " + calls(sm, "m_220480_", "m_46819_", "m_220512_"));
        // 别处取起点的不动（startsForStructure 两个重载里取本区块引用的 getChunk 还在）
        check(calls(sm, "m_220504_", "m_46819_").equals(List.of("m_46819_")) && calls(sm, "m_220477_", "m_46819_").equals(List.of("m_46819_")), "startsForStructure 被动了");
        ClassNode cs = woven.get("net.minecraft.world.level.chunk.storage.ChunkSerializer");
        check(calls(cs, "m_208154_", "filter").equals(List.of("mcai$keepFar")), "读存档的引用过滤 " + calls(cs, "m_208154_", "filter"));

        // 大结构铺满群系（mcai.FillBiome）：doCreateBiomes m_224291_ 开头记参数，写群系 ChunkAccess.fillBiomesFromNoise m_183442_ 前换解析器；同类里的 applyCarvers m_213679_ 不动；StructureManager 多了 level 的访问器
        ClassNode ncg = woven.get("net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator");
        check(calls(ncg, "m_224291_", "m_183442_").equals(List.of("mcai$rememberArgs", "mcai$fillBiome", "m_183442_")), "doCreateBiomes " + calls(ncg, "m_224291_", "m_183442_"));
        check(calls(ncg, "m_213679_").isEmpty(), "applyCarvers 被动了 " + calls(ncg, "m_213679_"));
        check(sm.interfaces.contains("mcai/mixin/StructureManagerAccessor") && reads(sm, "mcai$level", "f_220460_"), "StructureManager 的 level 访问器");

        System.out.println("mixin 织入" + (fails == 0 ? "全部通过" : "失败 " + fails + " 项") + "，共核对 " + checks + " 项");
        System.exit(fails == 0 ? 0 : 1);
    }
}
