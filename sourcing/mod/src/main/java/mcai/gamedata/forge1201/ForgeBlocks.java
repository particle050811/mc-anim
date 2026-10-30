package mcai.gamedata.forge1201;

import com.mojang.blaze3d.platform.NativeImage;
import mcai.gamedata.BlockSource;
import mcai.gamedata.TintProbe;
import net.minecraft.client.Minecraft;
import net.minecraft.client.color.block.BlockColor;
import net.minecraft.client.color.block.BlockColors;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.block.BlockRenderDispatcher;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.texture.MissingTextureAtlasSprite;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.client.resources.model.MultiPartBakedModel;
import net.minecraft.client.resources.model.WeightedBakedModel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.RandomSource;
import net.minecraft.util.random.WeightedEntry;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.client.extensions.common.IClientFluidTypeExtensions;
import net.minecraftforge.client.model.data.ModelData;
import org.apache.commons.lang3.tuple.Pair;

import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Predicate;

/**
 * 方块模型（Forge 1.20.1）：BlockRenderDispatcher.getBlockModel 拿烘焙好的模型，getQuads 按渲染层、六个方向和不剔除的那组取面，
 * 和 ModelBlockRenderer 画方块时取面的顺序、随机种子一样。模组模型、资源包覆盖、方块状态的旋转和 uvlock 都在烘焙里算好了。
 * 和版本耦合的地方（移植时要逐条对）：
 * - 顶点格式 DefaultVertexFormat.BLOCK（每顶点 8 个 int：xyz、颜色、uv、光照、法线）；
 * - FaceBakery 的 uvShrinkRatio（烘焙时 uv 往面中心缩一点防渗色），这里按 1/64 像素网格判断要不要还原；
 * - MultiPartBakedModel 的部件表、WeightedBakedModel 的变体表是私有字段，按字段类型（List）反射取，取不到就整个模型算一组；
 * - 染色函数（BlockColors）表是私有 Map，只为写染色函数类名反射，取不到写方块 id；
 * - 液体用 Forge 的 IClientFluidTypeExtensions 取贴图和染色。
 */
final class ForgeBlocks implements BlockSource {
    private static final Direction[] SIDES = {Direction.DOWN, Direction.UP, Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST, null};
    private static final long SEED = 42L;
    private final Minecraft mc;
    private final BlockRenderDispatcher dispatcher;
    private final BlockColors colors;
    private final TextureAtlas atlas;
    private final Map<String, BlockState> states = new LinkedHashMap<>();

    ForgeBlocks(Minecraft mc) {
        this.mc = mc;
        dispatcher = mc.getBlockRenderer();
        colors = mc.getBlockColors();
        atlas = mc.getModelManager().getAtlas(TextureAtlas.LOCATION_BLOCKS);
        List<ResourceLocation> ids = new ArrayList<>(BuiltInRegistries.BLOCK.keySet());
        ids.sort(Comparator.comparing(ResourceLocation::toString));
        for (ResourceLocation id : ids) {
            Block block = BuiltInRegistries.BLOCK.get(id);
            states.put(name(block.defaultBlockState()), block.defaultBlockState());
            for (BlockState s : block.getStateDefinition().getPossibleStates()) states.putIfAbsent(name(s), s);
        }
    }

    static String name(BlockState s) {
        String id = BuiltInRegistries.BLOCK.getKey(s.getBlock()).toString();
        if (s.getValues().isEmpty()) return id;
        TreeMap<String, String> props = new TreeMap<>();
        s.getValues().forEach((p, v) -> props.put(p.getName(), valueName(p, v)));
        StringBuilder b = new StringBuilder(id).append('[');
        props.forEach((k, v) -> b.append(k).append('=').append(v).append(','));
        b.setCharAt(b.length() - 1, ']');
        return b.toString();
    }

    @SuppressWarnings("unchecked")
    private static <T extends Comparable<T>> String valueName(Property<T> p, Comparable<?> v) {
        return p.getName((T) v);
    }

    public List<String> states() {
        return new ArrayList<>(states.keySet());
    }

    public Model model(String id) {
        BlockState state = states.get(id);
        int light = state.getLightEmission();
        FluidState fluid = state.getFluidState();
        if (state.getRenderShape() != RenderShape.MODEL) {
            if (!fluid.isEmpty()) {
                // 液体方块（水、岩浆、气泡柱、模组流体）：方块渲染器不画，液体渲染器画
                IClientFluidTypeExtensions ext = IClientFluidTypeExtensions.of(fluid);
                ResourceLocation still = ext.getStillTexture(fluid, new ProbeLevel(0, state), ProbeLevel.POS[0]);
                String tint = TintProbe.route(set -> ext.getTintColor(fluid, new ProbeLevel(set, state), ProbeLevel.POS[set]), className(ext));
                return new Model(Layer.LIQUID, false, false, true, light, null, List.of(), List.of(), Map.of(),
                        still == null ? null : still.toString(), tint, "液体:" + className(ext));
            }
            return empty(light, "不画:" + state.getRenderShape());
        }
        BakedModel model = dispatcher.getBlockModel(state);
        // 随机变体：第 0 个出部件和面，全部变体只用来判断随机转
        List<BakedModel> variants = variants(model);
        BakedModel first = variants.get(0);
        Set<RenderType> layers = new LinkedHashSet<>();
        List<List<Quad>> parts = new ArrayList<>();
        List<BakedModel> partModels = parts(first, state);
        for (BakedModel part : partModels) parts.add(quads(part, state, layers));
        List<List<Quad>> all = new ArrayList<>();
        if (variants.size() == 1) {
            List<Quad> v = new ArrayList<>();
            parts.forEach(v::addAll);
            all.add(v);
        } else {
            for (BakedModel v : variants) all.add(quads(v, state, new LinkedHashSet<>()));
        }
        Map<Integer, String> tints = new TreeMap<>();
        for (List<Quad> part : parts) {
            for (Quad q : part) {
                if (q.tintIndex() >= 0 && !tints.containsKey(q.tintIndex())) tints.put(q.tintIndex(), tint(state, q.tintIndex()));
            }
        }
        return new Model(layer(layers), safe(() -> state.isSolidRender(EmptyBlockGetter.INSTANCE, BlockPos.ZERO)),
                safe(() -> Block.isShapeFullBlock(state.getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO))),
                first.useAmbientOcclusion(state), light, offset(state), parts, all, tints, null, null, className(model));
    }

    private static Model empty(int light, String renderer) {
        return new Model(Layer.SOLID, false, false, false, light, null, List.of(), List.of(), Map.of(), null, null, renderer);
    }

    private static Layer layer(Set<RenderType> layers) {
        if (layers.contains(RenderType.translucent()) || layers.contains(RenderType.tripwire())) return Layer.TRANSLUCENT;
        if (layers.contains(RenderType.cutout()) || layers.contains(RenderType.cutoutMipped())) return Layer.CUTOUT;
        return Layer.SOLID;
    }

    /** 花草的随机偏移：有就看 y 方向偏不偏（XYZ 的草会往下沉） */
    private static String offset(BlockState state) {
        if (!state.hasOffsetFunction()) return null;
        for (int i = 0; i < 16; i++) {
            Vec3 o = state.getOffset(EmptyBlockGetter.INSTANCE, new BlockPos(i * 37, 64, i * 91));
            if (o.y != 0) return "XYZ";
        }
        return "XZ";
    }

    private List<Quad> quads(BakedModel m, BlockState state, Set<RenderType> layers) {
        List<Quad> out = new ArrayList<>();
        RandomSource rand = RandomSource.create(SEED);
        for (RenderType rt : m.getRenderTypes(state, rand, ModelData.EMPTY)) {
            layers.add(rt);
            for (Direction side : SIDES) {
                rand.setSeed(SEED);
                for (BakedQuad q : m.getQuads(state, side, rand, ModelData.EMPTY, rt)) out.add(quad(q, side));
            }
        }
        return out;
    }

    static Quad quad(BakedQuad q, Direction side) {
        int[] v = q.getVertices();
        int stride = v.length / 4;
        TextureAtlasSprite s = q.getSprite();
        float[] pos = new float[12];
        double[] u = new double[4], w = new double[4];
        for (int i = 0; i < 4; i++) {
            for (int k = 0; k < 3; k++) pos[i * 3 + k] = Float.intBitsToFloat(v[i * stride + k]);
            u[i] = (Float.intBitsToFloat(v[i * stride + 4]) - (double) s.getU0()) / ((double) s.getU1() - s.getU0()) * 16;
            w[i] = (Float.intBitsToFloat(v[i * stride + 5]) - (double) s.getV0()) / ((double) s.getV1() - s.getV0()) * 16;
        }
        float[] uv = unshrink(u, w, s.uvShrinkRatio());
        return new Quad(pos, uv, s.contents().name().toString(), q.getTintIndex(), q.isShade(), side == null ? null : side.getSerializedName());
    }

    /**
     * FaceBakery 烘焙时 uv 往这个面 uv 框的中心挪了 ratio 倍（四个角的平均就是中心）。模组自己拼的面不一定挪过，
     * 两种都算，取离 1/64 像素网格近的那种
     */
    static float[] unshrink(double[] u, double[] v, double ratio) {
        double cu = (u[0] + u[1] + u[2] + u[3]) / 4, cv = (v[0] + v[1] + v[2] + v[3]) / 4;
        double[] raw = new double[8], fixed = new double[8];
        for (int i = 0; i < 4; i++) {
            raw[i * 2] = u[i];
            raw[i * 2 + 1] = v[i];
            fixed[i * 2] = (u[i] - ratio * cu) / (1 - ratio);
            fixed[i * 2 + 1] = (v[i] - ratio * cv) / (1 - ratio);
        }
        double[] pick = offGrid(fixed) <= offGrid(raw) ? fixed : raw;
        float[] out = new float[8];
        for (int i = 0; i < 8; i++) out[i] = (float) pick[i];
        return out;
    }

    private static double offGrid(double[] a) {
        double e = 0;
        for (double x : a) e += Math.abs(x - Math.rint(x * 64) / 64);
        return e;
    }

    private String tint(BlockState state, int index) {
        return TintProbe.route(set -> colors.getColor(state, new ProbeLevel(set, state), ProbeLevel.POS[set], index), colorName(state));
    }

    /** 随机变体：WeightedBakedModel 的变体表（blockstates 里列表的顺序）；不是就只有自己 */
    private static List<BakedModel> variants(BakedModel model) {
        if (model instanceof WeightedBakedModel w) {
            List<WeightedEntry.Wrapper<BakedModel>> list = listField(w, WeightedBakedModel.class);
            if (list != null && !list.isEmpty()) return list.stream().map(WeightedEntry.Wrapper::getData).toList();
        }
        return List.of(model);
    }

    /** 多部件：这个状态选中的各个部件（部件自己有随机变体的取第 0 个，同手写表）；不是多部件就整个模型一组 */
    private static List<BakedModel> parts(BakedModel model, BlockState state) {
        if (model instanceof MultiPartBakedModel mp) {
            List<Pair<Predicate<BlockState>, BakedModel>> selectors = listField(mp, MultiPartBakedModel.class);
            if (selectors != null) {
                BitSet bits = mp.getSelectors(state);
                List<BakedModel> out = new ArrayList<>();
                for (int i = bits.nextSetBit(0); i >= 0; i = bits.nextSetBit(i + 1)) out.add(variants(selectors.get(i).getRight()).get(0));
                return out;
            }
        }
        return List.of(model);
    }

    /** 按类型取私有的 List 字段（运行时是 SRG 名，不按名字找） */
    @SuppressWarnings("unchecked")
    private static <T> List<T> listField(Object o, Class<?> owner) {
        for (Field f : owner.getDeclaredFields()) {
            if (List.class.isAssignableFrom(f.getType()) && !java.lang.reflect.Modifier.isStatic(f.getModifiers())) {
                try {
                    f.setAccessible(true);
                    return (List<T>) f.get(o);
                } catch (ReflectiveOperationException | RuntimeException e) {
                    return null;
                }
            }
        }
        return null;
    }

    /** 染色函数的类名（lambda 去掉每次启动都变的后缀）；反射拿不到就写方块 id */
    private String colorName(BlockState state) {
        for (Field f : BlockColors.class.getDeclaredFields()) {
            if (!Map.class.isAssignableFrom(f.getType())) continue;
            try {
                f.setAccessible(true);
                Object c = ((Map<?, ?>) f.get(colors)).get(state.getBlock().builtInRegistryHolder());
                if (c instanceof BlockColor) return className(c);
            } catch (ReflectiveOperationException | RuntimeException ignored) {
            }
        }
        return BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
    }

    private static String className(Object o) {
        String n = o.getClass().getName();
        int lambda = n.indexOf("$$Lambda");
        return lambda < 0 ? n : n.substring(0, lambda);
    }

    private static boolean safe(java.util.function.BooleanSupplier f) {
        try {
            return f.getAsBoolean();
        } catch (RuntimeException e) {
            return false;
        }
    }

    public Texture texture(String sprite) {
        ResourceLocation loc = ResourceLocation.tryParse(sprite);
        if (loc == null || loc.equals(MissingTextureAtlasSprite.getLocation())) return null;
        TextureAtlasSprite s = atlas.getSprite(loc);
        if (s.contents().name().equals(MissingTextureAtlasSprite.getLocation())) return null;
        int w = s.contents().width(), h = s.contents().height();
        try {
            return pixels(s.contents().getOriginalImage(), w, h);
        } catch (RuntimeException e) {
            // 原图已经释放：从资源管理器重读（启用的资源包照样生效）
            Optional<net.minecraft.server.packs.resources.Resource> r = mc.getResourceManager().getResource(loc.withPath("textures/" + loc.getPath() + ".png"));
            if (r.isEmpty()) return null;
            try (InputStream in = r.get().open(); NativeImage img = NativeImage.read(in)) {
                return pixels(img, Math.min(w, img.getWidth()), Math.min(h, img.getHeight()));
            } catch (Exception ex) {
                return null;
            }
        }
    }

    /** 第一帧（动画贴图各帧排在原图里，第 0 帧在左上角）；NativeImage 的像素是 ABGR */
    private static Texture pixels(NativeImage img, int w, int h) {
        int[] argb = new int[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int c = img.getPixelRGBA(x, y);
                argb[y * w + x] = (c & 0xff00ff00) | (c & 0xff) << 16 | (c >> 16 & 0xff);
            }
        }
        return new Texture(w, h, argb);
    }
}
