package mcai.terrain;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.DynamicOps;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.MapLike;
import com.mojang.serialization.RecordBuilder;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.DensityFunctions;

import java.util.Objects;
import java.util.stream.Stream;

/**
 * 密度函数 mcai:region：一片修整区域的权重，0～1。形状里面离边界 falloff 格以上是 1，边界上和形状外是 0，中间 smoothstep 过渡。
 * 给 {@link TerrainEdit} 当区域用，也可以直接拿去乘别的密度函数。
 * <pre>
 * { "type": "mcai:region", "shape": { "type": "sector", "center": [x, z], "facing": 270, "half_angle": 90, "radius": 40000 },
 *   "falloff": 3000, "edge": &lt;密度函数，可省，默认 0&gt; }
 * </pre>
 * edge 加在有向距离上（格，正 = 边界往里缩）：填一个噪声，边界就不是几何直线、圆弧。edge 取值 ≥ 0 时形状本身就是外边界，
 * 形状外一格都不变；有负值时边界最多往外推 -edge.minValue() 格（包围盒跟着放大）。
 * edge 要只随 x、z 变（噪声的 y_scale 写 0）：区域通常包在 cache_2d 里，一列只算一次，随高度变的部分会被第一次算到的那个高度定死。
 *
 * 离线版是 参考模型库/工具/选种/生成修整.mjs 的 Region，两边逐行对应；取材mod/测试/地形修整测试.sh 逐位核对两边。
 */
public final class Region implements DensityFunction {
    public static final KeyDispatchDataCodec<Region> CODEC = KeyDispatchDataCodec.of(RecordCodecBuilder.mapCodec(i -> i.group(
            Shape.CODEC.fieldOf("shape").forGetter(r -> r.shape),
            Codec.doubleRange(Double.MIN_NORMAL, Double.MAX_VALUE).fieldOf("falloff").forGetter(r -> r.falloff),
            strictOptional(DensityFunction.HOLDER_HELPER_CODEC, "edge", DensityFunctions.zero()).forGetter(r -> r.edge)
    ).apply(i, Region::new)));

    private final Shape shape;
    private final double falloff;
    private final DensityFunction edge;
    private final double edgeMin, edgeMax;
    private final double minX, minZ, maxX, maxZ;

    public Region(Shape shape, double falloff, DensityFunction edge) {
        this.shape = shape;
        this.falloff = falloff;
        this.edge = edge;
        // edge 的取值范围：读数据包时 edge 里的噪声还没接上（引用的密度函数可能还没读到，范围是 ±∞），要等 RandomState 接上以后（mapAll 新建的对象）才是真实范围
        edgeMin = edge.minValue();
        edgeMax = edge.maxValue();
        // 包围盒连 edge 能把边界往外推的最大格数一起算上
        double out = Math.max(0, -edgeMin);
        double[] b = shape.box();
        minX = b[0] - out;
        minZ = b[1] - out;
        maxX = b[2] + out;
        maxZ = b[3] + out;
    }

    @Override
    public double compute(FunctionContext ctx) {
        int x = ctx.blockX(), z = ctx.blockZ();
        if (x < minX || x > maxX || z < minZ || z > maxZ) return 0;
        double d = shape.distance(x, z);
        // edge 的取值范围已经定下结果的列（形状外、深处，占包围盒里的大多数）不算 edge：边界噪声要算十几层柏林噪声，比形状贵得多。
        // 结果和照算一样（加法、除法都单调，下面两个判断成立时照算也是返回同一个 0 或 1）
        if (d + edgeMin >= 0) return 0;
        if (d + edgeMax <= -falloff) return 1;
        double sd = d + edge.compute(ctx);
        if (sd >= 0) return 0;
        double t = -sd / falloff;
        if (t >= 1) return 1;
        return t * t * (3 - 2 * t);
    }

    @Override
    public void fillArray(double[] out, ContextProvider provider) {
        provider.fillAllDirectly(out, this);
    }

    @Override
    public DensityFunction mapAll(Visitor visitor) {
        return visitor.apply(new Region(shape, falloff, edge.mapAll(visitor)));
    }

    @Override
    public double minValue() {
        return 0;
    }

    @Override
    public double maxValue() {
        return 1;
    }

    @Override
    public KeyDispatchDataCodec<? extends DensityFunction> codec() {
        return CODEC;
    }

    // equals、hashCode 要按内容比（原版密度函数都是 record）：游戏接噪声（RandomState）和建区块缓存（NoiseChunk）时按 equals 把同一个密度函数的几处引用并成一个对象，大陆度被好几处引用，并成一个才共用 cache_2d 缓存；只按对象比每处各算一遍，区块生成慢 30%～60%
    @Override
    public boolean equals(Object o) {
        return o instanceof Region r && shape.equals(r.shape) && Double.compare(falloff, r.falloff) == 0 && edge.equals(r.edge);
    }

    @Override
    public int hashCode() {
        return Objects.hash(shape, falloff, edge);
    }

    /** 可省的字段，但写了就必须读得出来。1.20.1 的 DFU（6.0.8）里 optionalFieldOf 遇到写错的值会悄悄当成没写（edge 写错了就成 0，进游戏才看得出），所以自己写：没写用默认值，写了读不出来就报错；写回时等于默认值就不写。 */
    static <A> MapCodec<A> strictOptional(Codec<A> codec, String name, A defaultValue) {
        return new MapCodec<>() {
            @Override
            public <T> DataResult<A> decode(DynamicOps<T> ops, MapLike<T> input) {
                T value = input.get(name);
                return value == null ? DataResult.success(defaultValue) : codec.parse(ops, value);
            }

            @Override
            public <T> RecordBuilder<T> encode(A input, DynamicOps<T> ops, RecordBuilder<T> prefix) {
                return Objects.equals(input, defaultValue) ? prefix : prefix.add(name, codec.encodeStart(ops, input));
            }

            @Override
            public <T> Stream<T> keys(DynamicOps<T> ops) {
                return Stream.of(ops.createString(name));
            }
        };
    }
}
