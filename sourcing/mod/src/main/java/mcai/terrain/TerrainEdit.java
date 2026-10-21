package mcai.terrain;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.level.levelgen.DensityFunction;

import java.util.List;
import java.util.Objects;

/**
 * 密度函数 mcai:edit：把 input 按顺序套上几条修整，每条是「区域 + 操作 + 目标值」。主世界的生成时修整（取材mod/数据包/主世界修整/）用它。
 * <pre>
 * { "type": "mcai:edit", "input": &lt;原来的密度函数&gt;,
 *   "edits": [ { "region": "mcai:region/base_sea", "op": "toward", "value": -0.8 }, ... ] }
 * </pre>
 * 不写死某一种地形（用户 10-04 定直接修整，以后还会要山、平地、峡湾、湖），而是在密度函数这一层按区域改某个量：要改哪个量就在数据包里覆盖那个密度函数文件，把原内容原样放进 input。
 * 比如一望无际的海 = 史诗地形的 etn:overworld/continents（大陆度）在区域里 toward -0.8；海底、海岸、群系、地表方块仍由游戏照常算，游戏截图和导入的地形天然一致。权重是 0 的地方（区域外）原值原样返回。
 *
 * op：toward 往目标值拉（权重 1 时等于目标值）、add 加上 权重×value、min 只往下压到目标值、max 只往上抬到目标值。
 * value 可以是数，也可以是密度函数（比如带噪声的目标）。区域的值超出 0～1 时按 0～1 截断。
 *
 * 离线版是 参考模型库/工具/选种/生成修整.mjs 的 Edit，两边逐行对应；取材mod/测试/地形修整测试.sh 逐位核对两边。
 */
public final class TerrainEdit implements DensityFunction {
    public enum Op implements StringRepresentable {
        TOWARD("toward"), ADD("add"), MIN("min"), MAX("max");

        public static final Codec<Op> CODEC = StringRepresentable.fromEnum(Op::values);
        private final String name;

        Op(String name) {
            this.name = name;
        }

        @Override
        public String getSerializedName() {
            return name;
        }
    }

    public record Entry(DensityFunction region, Op op, DensityFunction value) {
        static final Codec<Entry> CODEC = RecordCodecBuilder.create(i -> i.group(
                DensityFunction.HOLDER_HELPER_CODEC.fieldOf("region").forGetter(Entry::region),
                Op.CODEC.fieldOf("op").forGetter(Entry::op),
                DensityFunction.HOLDER_HELPER_CODEC.fieldOf("value").forGetter(Entry::value)
        ).apply(i, Entry::new));
    }

    public static final KeyDispatchDataCodec<TerrainEdit> CODEC = KeyDispatchDataCodec.of(RecordCodecBuilder.mapCodec(i -> i.group(
            DensityFunction.HOLDER_HELPER_CODEC.fieldOf("input").forGetter(e -> e.input),
            Entry.CODEC.listOf().fieldOf("edits").forGetter(e -> e.edits)
    ).apply(i, TerrainEdit::new)));

    private final DensityFunction input;
    private final List<Entry> edits;

    public TerrainEdit(DensityFunction input, List<Entry> edits) {
        this.input = input;
        this.edits = List.copyOf(edits);
    }

    @Override
    public double compute(FunctionContext ctx) {
        double v = input.compute(ctx);
        for (Entry e : edits) {
            double w = e.region.compute(ctx);
            if (!(w > 0)) continue;
            if (w > 1) w = 1;
            double t = e.value.compute(ctx);
            v = switch (e.op) {
                case TOWARD -> v + w * (t - v);
                case ADD -> v + w * t;
                case MIN -> v + w * (Math.min(v, t) - v);
                case MAX -> v + w * (Math.max(v, t) - v);
            };
        }
        return v;
    }

    @Override
    public void fillArray(double[] out, ContextProvider provider) {
        provider.fillAllDirectly(out, this);
    }

    @Override
    public DensityFunction mapAll(Visitor visitor) {
        return visitor.apply(new TerrainEdit(input.mapAll(visitor),
                edits.stream().map(e -> new Entry(e.region.mapAll(visitor), e.op, e.value.mapAll(visitor))).toList()));
    }

    // 取值范围按最宽的算，宁宽勿窄：原版拿它做 minecraft:min / max 的短路（一边已经低于另一边的下界就不算另一边）和样条的范围推算。太窄会把该算的跳过、出怪地形；太宽只是少一点优化
    @Override
    public double minValue() {
        double m = input.minValue();
        for (Entry e : edits) m = e.op == Op.ADD ? m + Math.min(0, e.value.minValue()) : Math.min(m, e.value.minValue());
        return m;
    }

    @Override
    public double maxValue() {
        double m = input.maxValue();
        for (Entry e : edits) m = e.op == Op.ADD ? m + Math.max(0, e.value.maxValue()) : Math.max(m, e.value.maxValue());
        return m;
    }

    @Override
    public KeyDispatchDataCodec<? extends DensityFunction> codec() {
        return CODEC;
    }

    // 按内容比，理由见 Region.equals：同一处修整被几处引用时游戏要能把它们并成一个，才共用 cache_2d 的缓存
    @Override
    public boolean equals(Object o) {
        return o instanceof TerrainEdit e && input.equals(e.input) && edits.equals(e.edits);
    }

    @Override
    public int hashCode() {
        return Objects.hash(input, edits);
    }
}
