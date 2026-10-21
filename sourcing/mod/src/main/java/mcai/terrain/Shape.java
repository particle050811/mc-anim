package mcai.terrain;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.ExtraCodecs;

import java.util.List;
import java.util.Objects;

/**
 * mcai:region 的形状：给一个方块列 (x, z) 算到形状边界的有向距离（格，形状里面为负）。坐标是游戏坐标，x 朝东、z 朝南；
 * 朝向按罗盘，0 = 北（-z）、90 = 东（+x）。
 *
 * 离线版是 参考模型库/工具/选种/生成修整.mjs 的 parseShape()，两边逐行对应，改一边要同时改另一边。
 * 三角函数只在解析时算一次，用 StrictMath（和 V8 的 Math.sin/cos 同是 fdlibm 的算法）；逐列只有加减乘除和 sqrt，两边逐位一致
 * （取材mod/测试/地形修整测试.sh 核对）。加一种形状：这里加一个 record 和 codecOf 的一行，生成修整.mjs 的 parseShape() 加同样的一支，
 * 测试/地形修整用例/ 里加一个用这种形状的区域。
 */
public sealed interface Shape permits Shape.Circle, Shape.Sector, Shape.Polygon, Shape.Path {
    record Vec(double x, double z) {
    }

    Codec<Vec> POINT = Codec.DOUBLE.listOf().comapFlatMap(
            l -> l.size() == 2 ? DataResult.success(new Vec(l.get(0), l.get(1))) : DataResult.error(() -> "mcai:region 的坐标要写 [x, z]：" + l),
            p -> List.of(p.x(), p.z()));

    Codec<Shape> CODEC = Codec.STRING.partialDispatch("type", s -> DataResult.success(s.type()), Shape::codecOf);

    private static DataResult<Codec<? extends Shape>> codecOf(String type) {
        return switch (type) {
            case "circle" -> DataResult.success(Circle.CODEC);
            case "sector" -> DataResult.success(Sector.CODEC);
            case "polygon" -> DataResult.success(Polygon.CODEC);
            case "path" -> DataResult.success(Path.CODEC);
            default -> DataResult.error(() -> "mcai:region 没有这种形状：" + type + "（有 circle、sector、polygon、path）");
        };
    }

    String type();

    double distance(double x, double z);

    /** 包围盒 {minX, minZ, maxX, maxZ}：盒外的列 Region 直接给 0，不算距离 */
    double[] box();

    static double segment(double px, double pz, double ax, double az, double bx, double bz) {
        double ux = bx - ax, uz = bz - az, l2 = ux * ux + uz * uz;
        double t = l2 > 0 ? ((px - ax) * ux + (pz - az) * uz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        double dx = px - ax - t * ux, dz = pz - az - t * uz;
        return Math.sqrt(dx * dx + dz * dz);
    }

    record Circle(Vec center, double radius) implements Shape {
        static final Codec<Circle> CODEC = RecordCodecBuilder.create(i -> i.group(
                POINT.fieldOf("center").forGetter(Circle::center),
                Codec.doubleRange(0, Double.MAX_VALUE).fieldOf("radius").forGetter(Circle::radius)
        ).apply(i, Circle::new));

        public String type() {
            return "circle";
        }

        public double distance(double x, double z) {
            double dx = x - center.x(), dz = z - center.z();
            return Math.sqrt(dx * dx + dz * dz) - radius;
        }

        public double[] box() {
            return new double[]{center.x() - radius, center.z() - radius, center.x() + radius, center.z() + radius};
        }
    }

    /** 扇形：圆心、朝向、半角、半径。半角 ≥ 180 就是整圆 */
    final class Sector implements Shape {
        static final Codec<Sector> CODEC = RecordCodecBuilder.create(i -> i.group(
                POINT.fieldOf("center").forGetter(s -> s.center),
                Codec.DOUBLE.fieldOf("facing").forGetter(s -> s.facing),
                Codec.doubleRange(0, 360).fieldOf("half_angle").forGetter(s -> s.halfAngle),
                Codec.doubleRange(0, Double.MAX_VALUE).fieldOf("radius").forGetter(s -> s.radius)
        ).apply(i, Sector::new));

        private final Vec center;
        private final double facing, halfAngle, radius;
        private final boolean full;
        private final double fx, fz, cosA, lx, lz, rx, rz;

        Sector(Vec center, double facing, double halfAngle, double radius) {
            this.center = center;
            this.facing = facing;
            this.halfAngle = halfAngle;
            this.radius = radius;
            full = halfAngle >= 180;
            double f = facing * Math.PI / 180, l = (facing - halfAngle) * Math.PI / 180, r = (facing + halfAngle) * Math.PI / 180;
            fx = StrictMath.sin(f);
            fz = -StrictMath.cos(f);
            cosA = StrictMath.cos(halfAngle * Math.PI / 180);
            lx = StrictMath.sin(l);
            lz = -StrictMath.cos(l);
            rx = StrictMath.sin(r);
            rz = -StrictMath.cos(r);
        }

        public String type() {
            return "sector";
        }

        public double distance(double x, double z) {
            double px = x - center.x(), pz = z - center.z(), d = Math.sqrt(px * px + pz * pz);
            if (full) return d - radius;
            boolean inAngle = px * fx + pz * fz >= d * cosA;
            double edge = Math.min(segment(px, pz, 0, 0, radius * lx, radius * lz), segment(px, pz, 0, 0, radius * rx, radius * rz));
            // 角度范围外时离弧最近的是弧的端点，已经算在两条半径边里
            double arc = inAngle ? Math.abs(d - radius) : Double.POSITIVE_INFINITY;
            double near = Math.min(edge, arc);
            return inAngle && d <= radius ? -near : near;
        }

        public double[] box() {
            return new double[]{center.x() - radius, center.z() - radius, center.x() + radius, center.z() + radius};
        }

        // 按内容比（另外几种形状是 record，自带），理由见 Region.equals
        @Override
        public boolean equals(Object o) {
            return o instanceof Sector s && center.equals(s.center) && Double.compare(facing, s.facing) == 0
                    && Double.compare(halfAngle, s.halfAngle) == 0 && Double.compare(radius, s.radius) == 0;
        }

        @Override
        public int hashCode() {
            return Objects.hash(center, facing, halfAngle, radius);
        }
    }

    // 校验要加在 MapCodec 上再转 Codec：dispatch 只有拿到 MapCodec 转的 Codec 才从同一个 JSON 对象里读字段，
    // 别的 Codec 会去读 "value" 字段（读不到，报 Not a JSON object）
    record Polygon(List<Vec> points) implements Shape {
        static final Codec<Polygon> CODEC = ExtraCodecs.validate(RecordCodecBuilder.<Polygon>mapCodec(i -> i.group(
                POINT.listOf().fieldOf("points").forGetter(Polygon::points)
        ).apply(i, Polygon::new)), p -> p.points.size() >= 3 ? DataResult.success(p) : DataResult.error(() -> "mcai:region 的 polygon 至少 3 个点")).codec();

        public String type() {
            return "polygon";
        }

        public double distance(double x, double z) {
            double d = Double.POSITIVE_INFINITY;
            boolean inside = false;
            int n = points.size();
            for (int i = 0; i < n; i++) {
                Vec a = points.get(i), b = points.get((i + 1) % n);
                d = Math.min(d, segment(x, z, a.x(), a.z(), b.x(), b.z()));
                if ((a.z() > z) != (b.z() > z) && x < (b.x() - a.x()) * (z - a.z()) / (b.z() - a.z()) + a.x()) inside = !inside;
            }
            return inside ? -d : d;
        }

        public double[] box() {
            return bounds(points, 0);
        }
    }

    /** 折线两边各 width/2 的带子（峡湾、河道） */
    record Path(List<Vec> points, double width) implements Shape {
        static final Codec<Path> CODEC = ExtraCodecs.validate(RecordCodecBuilder.<Path>mapCodec(i -> i.group(
                POINT.listOf().fieldOf("points").forGetter(Path::points),
                Codec.doubleRange(0, Double.MAX_VALUE).fieldOf("width").forGetter(Path::width)
        ).apply(i, Path::new)), p -> p.points.size() >= 2 ? DataResult.success(p) : DataResult.error(() -> "mcai:region 的 path 至少 2 个点")).codec();

        public String type() {
            return "path";
        }

        public double distance(double x, double z) {
            double d = Double.POSITIVE_INFINITY;
            for (int i = 0; i + 1 < points.size(); i++) {
                Vec a = points.get(i), b = points.get(i + 1);
                d = Math.min(d, segment(x, z, a.x(), a.z(), b.x(), b.z()));
            }
            return d - width / 2;
        }

        public double[] box() {
            return bounds(points, width / 2);
        }
    }

    private static double[] bounds(List<Vec> points, double pad) {
        double[] b = {Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY};
        for (Vec p : points) {
            b[0] = Math.min(b[0], p.x());
            b[1] = Math.min(b[1], p.z());
            b[2] = Math.max(b[2], p.x());
            b[3] = Math.max(b[3], p.z());
        }
        return new double[]{b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad};
    }
}
