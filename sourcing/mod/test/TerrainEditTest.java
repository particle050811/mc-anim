import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import mcai.terrain.Region;
import mcai.terrain.Shape;
import mcai.terrain.TerrainEdit;
import mcai.terrain.TerrainTypes;
import net.minecraft.SharedConstants;
import net.minecraft.core.Holder;
import net.minecraft.core.MappedRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.RegistryDataLoader;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.FilePackResources;
import net.minecraft.server.packs.PackResources;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.PathPackResources;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.biome.MultiNoiseBiomeSource;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.chunk.ProtoChunk;
import net.minecraft.world.level.chunk.UpgradeData;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.DensityFunctions;
import net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator;
import net.minecraft.world.level.levelgen.NoiseGeneratorSettings;
import net.minecraft.world.level.levelgen.NoiseRouter;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.blending.Blender;

import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Proxy;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;
import java.util.concurrent.Executor;
import java.util.stream.Stream;

/**
 * 生成时修整（mcai.terrain：`mcai:region`、`mcai:edit`）的离线核对，不开游戏。跑法：在 sourcing/mod/ 下 sh test/terrain-edit-test.sh（先 gradlew build、跑离线版 terrain-edit-reference.mjs，最后跑这里）。
 *
 * 不开游戏也用游戏自己的代码：引导原版注册表、注册 mcai 的两种类型，用 RegistryDataLoader 读原版 + 史诗地形 + 修整包，RandomState 按种子接噪声，NoiseBasedChunkGenerator 生成区块。
 * 1. 真包整套世界生成注册表读得进，包里 `mcai:edit` 的覆盖文件真的带着修整（没被史诗地形同名文件盖掉）。
 * 2. 往返：每个密度函数文件 读 JSON → 写回 JSON，和原文一致（原版样条用 float 存，那几个数只比到 float）。
 * 3. 错例：test/terrain-edit-cases/bad-cases.json 每条都读不进来（离线版也核对同一批）。
 * 4. 用例对照：test/terrain-edit-cases/ 的各种形状、操作、边界噪声，在离线版取的同一批点上和离线版逐位相同。
 * 5. 真包对照：真包每个密度函数叠在史诗地形上、种子 116，和离线预览（地形.mjs）比，差不超过 1e-5。不要求逐位：
 *    deepslate 算 shift_a/shift_b 约两成点差 1 ulp，经史诗地形的 float 样条放大到 1e-6 左右，和修整无关（修整自己的部分由第 4 项逐位核对）。
 *    点取在 4 的倍数上：游戏里 flat_cache 只在 4 格格点上算（NoiseChunk），这里不经 NoiseChunk，对齐才是同一个值。
 *    含 interpolated / cache_all_in_cell 的（三维地形密度、洞穴）不比：游戏按格角插值，这里是逐点精确值。
 * 6. 重混淆后的 jar（装进游戏的）里 `Region`、`TerrainEdit` 实现了 `DensityFunction` 的全部方法（SRG 名对得上）。
 * 7. 同一个密度函数在噪声路由里被引用两次，接上噪声后是同一个对象（游戏按 equals 合并才共用 cache_2d 缓存，见 `Region.equals`）。
 * 加 --性能 再量开销：每次求值纳秒数、大陆度加修整前后、整块区块生成加修整前后。
 *
 * 用法：java TerrainEditTest <用例目录> <真包目录> <离线输出目录> <原版数据 jar> <史诗地形 zip> <重混淆 jar> <SRG 名的 Forge jar> <其余库，冒号分隔> [--性能]
 */
public class TerrainEditTest {
    static int checks, fails;
    static final RegistryAccess.Frozen BASE;

    static void check(boolean ok, String what) {
        checks++;
        if (!ok && fails++ < 30) System.out.println("不对：" + what);
    }

    static {
        // `Bootstrap.bootStrap()` 里 Forge 要初始化网络，离线跑不了；只要注册表，就置上「已引导」标记，直接引导内置注册表
        SharedConstants.tryDetectVersion();
        try {
            Field f = net.minecraft.server.Bootstrap.class.getDeclaredField("isBootstrapped");
            f.setAccessible(true);
            f.setBoolean(null, true);
            Method m = BuiltInRegistries.class.getDeclaredMethod("bootStrap");
            m.setAccessible(true);
            m.invoke(null);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        // 游戏里是 TerrainTypes 的 DeferredRegister 在注册阶段做的（Forge 解冻原版注册表），这里照样解冻、注册、再冻上
        MappedRegistry<com.mojang.serialization.Codec<? extends DensityFunction>> types =
                (MappedRegistry<com.mojang.serialization.Codec<? extends DensityFunction>>) BuiltInRegistries.DENSITY_FUNCTION_TYPE;
        types.unfreeze();
        TerrainTypes.CODECS.forEach((name, codec) -> Registry.register(types, ResourceLocation.tryBuild("mcai", name), codec));
        types.freeze();
        BASE = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
    }

    /** 和服务端开服时一样读整套世界生成注册表；有错 `RegistryDataLoader` 先把每个错打到日志，再抛异常 */
    static RegistryAccess.Frozen load(List<PackResources> packs) {
        try (MultiPackResourceManager rm = new MultiPackResourceManager(PackType.SERVER_DATA, packs)) {
            return RegistryDataLoader.load(rm, BASE, RegistryDataLoader.WORLDGEN_REGISTRIES);
        }
    }

    /** 数据包里某一类文件：id → 文件 */
    static Map<String, Path> files(Path pack, String kind) throws Exception {
        Map<String, Path> o = new TreeMap<>();
        Path data = pack.resolve("data");
        try (Stream<Path> nss = Files.list(data)) {
            for (Path ns : nss.toList()) {
                Path base = ns.resolve("worldgen").resolve(kind);
                if (!Files.isDirectory(base)) continue;
                try (Stream<Path> w = Files.walk(base)) {
                    for (Path p : w.filter(p -> p.toString().endsWith(".json")).toList()) {
                        String rel = base.relativize(p).toString().replace(File.separatorChar, '/');
                        o.put(ns.getFileName() + ":" + rel.substring(0, rel.length() - 5), p);
                    }
                }
            }
        }
        return o;
    }

    static JsonElement json(Path p) throws Exception {
        return JsonParser.parseString(Files.readString(p));
    }

    /** JSON 相同；数比数值，原版样条的点用 float 存，写回只剩 float 精度，所以 float 相等也算 */
    static boolean same(JsonElement a, JsonElement b) {
        if (a.isJsonObject() && b.isJsonObject()) {
            JsonObject x = a.getAsJsonObject(), y = b.getAsJsonObject();
            if (!x.keySet().equals(y.keySet())) return false;
            for (String k : x.keySet()) if (!same(x.get(k), y.get(k))) return false;
            return true;
        }
        if (a.isJsonArray() && b.isJsonArray()) {
            if (a.getAsJsonArray().size() != b.getAsJsonArray().size()) return false;
            for (int i = 0; i < a.getAsJsonArray().size(); i++) if (!same(a.getAsJsonArray().get(i), b.getAsJsonArray().get(i))) return false;
            return true;
        }
        if (a.isJsonPrimitive() && b.isJsonPrimitive()) {
            JsonPrimitive x = a.getAsJsonPrimitive(), y = b.getAsJsonPrimitive();
            if (x.isNumber() && y.isNumber()) {
                double u = x.getAsDouble(), v = y.getAsDouble();
                return u == v || (float) u == (float) v;
            }
            return x.equals(y);
        }
        return a.equals(b);
    }

    static boolean contains(DensityFunction f, Class<?> type) {
        boolean[] found = {false};
        f.mapAll(g -> {
            if (type.isInstance(g)) found[0] = true;
            return g;
        });
        return found[0];
    }

    /** 把一个密度函数按种子接上噪声：放进噪声路由交给 `RandomState`，走游戏生成时的接法（每个噪声按名字哈希出随机源）；离线版用 deepslate 的 RandomState 同样做 */
    static DensityFunction wire(RegistryAccess ra, NoiseGeneratorSettings base, String id, long seed) {
        Holder<DensityFunction> h = ra.registryOrThrow(Registries.DENSITY_FUNCTION).getHolderOrThrow(ResourceKey.create(Registries.DENSITY_FUNCTION, ResourceLocation.parse(id)));
        DensityFunction f = new DensityFunctions.HolderHolder(h), z = DensityFunctions.zero();
        NoiseRouter r = new NoiseRouter(f, z, z, z, z, z, z, z, z, z, z, z, z, z, z);
        NoiseGeneratorSettings s = new NoiseGeneratorSettings(base.noiseSettings(), base.defaultBlock(), base.defaultFluid(), r, base.surfaceRule(),
                base.spawnTarget(), base.seaLevel(), base.disableMobGeneration(), base.aquifersEnabled(), base.oreVeinsEnabled(), base.useLegacyRandomSource());
        return RandomState.create(s, ra.lookupOrThrow(Registries.NOISE), seed).router().barrierNoise();
    }

    /** 第 7 项：放进路由的两个位置，接上噪声后应当是同一个对象 */
    static boolean merged(RegistryAccess ra, NoiseGeneratorSettings base, String id) {
        Holder<DensityFunction> h = ra.registryOrThrow(Registries.DENSITY_FUNCTION).getHolderOrThrow(ResourceKey.create(Registries.DENSITY_FUNCTION, ResourceLocation.parse(id)));
        DensityFunction f = new DensityFunctions.HolderHolder(h), z = DensityFunctions.zero();
        NoiseRouter r = new NoiseRouter(f, f, z, z, z, z, z, z, z, z, z, z, z, z, z);
        NoiseGeneratorSettings s = new NoiseGeneratorSettings(base.noiseSettings(), base.defaultBlock(), base.defaultFluid(), r, base.surfaceRule(),
                base.spawnTarget(), base.seaLevel(), base.disableMobGeneration(), base.aquifersEnabled(), base.oreVeinsEnabled(), base.useLegacyRandomSource());
        NoiseRouter w = RandomState.create(s, ra.lookupOrThrow(Registries.NOISE), 1).router();
        return w.barrierNoise() == w.fluidLevelFloodednessNoise();
    }

    static NoiseGeneratorSettings overworld(RegistryAccess ra) {
        return ra.registryOrThrow(Registries.NOISE_SETTINGS).getOrThrow(NoiseGeneratorSettings.OVERWORLD);
    }

    record Pt(int x, int y, int z, long bits) {
    }

    /** 离线版写的点：函数 → 点 */
    static Map<String, List<Pt>> points(Path file) throws Exception {
        Map<String, List<Pt>> o = new LinkedHashMap<>();
        for (String line : Files.readAllLines(file)) {
            if (line.isEmpty()) continue;
            String[] s = line.split(" ");
            o.computeIfAbsent(s[0], k -> new ArrayList<>()).add(new Pt(Integer.parseInt(s[1]), Integer.parseInt(s[2]), Integer.parseInt(s[3]), Long.parseUnsignedLong(s[4], 16)));
        }
        return o;
    }

    /** 含不含按格角插值的缓存（`interpolated`、`cache_all_in_cell`），引用的密度函数也算 */
    static boolean interpolated(RegistryAccess ra, String id) {
        boolean[] found = {false};
        ra.registryOrThrow(Registries.DENSITY_FUNCTION).get(ResourceLocation.parse(id)).mapAll(g -> {
            if (g instanceof DensityFunctions.HolderHolder) return g;   // 引用本身没有 codec，`mapAll` 会接着走进它引用的函数
            ResourceLocation type = BuiltInRegistries.DENSITY_FUNCTION_TYPE.getKey(g.codec().codec());
            if (type != null && (type.getPath().equals("interpolated") || type.getPath().equals("cache_all_in_cell"))) found[0] = true;
            return g;
        });
        return found[0];
    }

    /** 和离线版比，tol = 0 要逐位相同，否则差不超过 tol；返回每个函数接好噪声的密度函数（--性能 用） */
    static Map<String, DensityFunction> compare(String what, RegistryAccess ra, long seed, Map<String, List<Pt>> pts, double tol) {
        NoiseGeneratorSettings base = overworld(ra);
        Map<String, DensityFunction> wired = new LinkedHashMap<>();
        for (var e : pts.entrySet()) {
            if (tol > 0 && interpolated(ra, e.getKey())) {
                System.out.printf("%s %-36s 含 interpolated，不比（见文件头第 5 项）%n", what, e.getKey());
                continue;
            }
            DensityFunction f = wire(ra, base, e.getKey(), seed);
            wired.put(e.getKey(), f);
            int diff = 0, band = 0;
            double maxDiff = 0;
            for (Pt p : e.getValue()) {
                double v = f.compute(new DensityFunction.SinglePointContext(p.x, p.y, p.z));
                if (v > 0 && v < 1) band++;
                if (Double.doubleToRawLongBits(v) != p.bits) {
                    double js = Double.longBitsToDouble(p.bits);
                    if (diff++ < 3 && (tol == 0 || Math.abs(v - js) > tol)) System.out.printf("  %s (%d, %d, %d)：游戏 %s，离线 %s%n", e.getKey(), p.x, p.y, p.z, v, js);
                    maxDiff = Math.max(maxDiff, Math.abs(v - js));
                }
            }
            check(tol == 0 ? diff == 0 : maxDiff <= tol, what + " " + e.getKey() + " 有 " + diff + " 个点和离线版不同（最大差 " + maxDiff + "）");
            System.out.printf("%s %-36s %6d 点，0～1 之间 %6d 点，不同 %d%s%n", what, e.getKey(), e.getValue().size(), band, diff, diff == 0 ? "" : "，最大差 " + maxDiff);
        }
        return wired;
    }

    public static void main(String[] a) throws Exception {
        Path cases = Path.of(a[0]), pack = Path.of(a[1]), offline = Path.of(a[2]);
        File vanillaJar = new File(a[3]), etnZip = new File(a[4]);
        boolean perf = List.of(a).contains("--性能");

        // ---------- 1. 真包读得进、修整没被盖掉 ----------
        RegistryAccess.Frozen real = load(List.of(new FilePackResources("vanilla", vanillaJar, true),
                new FilePackResources("epicterrain", etnZip, false), new PathPackResources("主世界修整", pack, false)));
        Map<String, Path> packFiles = files(pack, "density_function");
        var dfs = real.registryOrThrow(Registries.DENSITY_FUNCTION);
        for (var e : packFiles.entrySet()) {
            DensityFunction f = dfs.get(ResourceLocation.parse(e.getKey()));
            check(f != null, "真包里的 " + e.getKey() + " 没读进注册表");
            if (f != null && Files.readString(e.getValue()).contains("\"mcai:edit\""))
                check(contains(f, TerrainEdit.class), e.getKey() + " 读出来不带修整（被别的包的同名文件盖掉了？）");
        }
        System.out.println("真包：原版 + 史诗地形 + " + pack.getFileName() + " 读进 " + dfs.size() + " 个密度函数，包里 " + packFiles.size() + " 个");

        RegistryAccess.Frozen test = load(List.of(new FilePackResources("vanilla", vanillaJar, true), new PathPackResources("用例", cases, false)));

        // ---------- 2. 往返 ----------
        int round = 0;
        for (var pair : List.of(Map.entry(real, packFiles), Map.entry(test, files(cases, "density_function")))) {
            RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, pair.getKey());
            for (var e : pair.getValue().entrySet()) {
                JsonElement src = json(e.getValue());
                DataResult<JsonElement> back = DensityFunction.DIRECT_CODEC.parse(ops, src).flatMap(f -> DensityFunction.DIRECT_CODEC.encodeStart(ops, f));
                check(back.result().isPresent() && same(src, back.result().get()), e.getKey() + " 读进来再写回去和原文不同：" + back.error().map(Object::toString).orElse(back.result().map(Object::toString).orElse("")));
                round++;
            }
        }
        System.out.println("往返：" + round + " 个文件");

        // ---------- 3. 错例 ----------
        JsonObject bad = json(cases.resolve("bad-cases.json")).getAsJsonObject();
        RegistryOps<JsonElement> testOps = RegistryOps.create(JsonOps.INSTANCE, test);
        int nBad = 0;
        for (JsonElement b : bad.getAsJsonArray("错例")) {
            DataResult<DensityFunction> r = DensityFunction.DIRECT_CODEC.parse(testOps, b.getAsJsonArray().get(1));
            check(r.error().isPresent(), "错例「" + b.getAsJsonArray().get(0).getAsString() + "」读进来了");
            nBad++;
        }
        System.out.println("错例：" + nBad + " 条");

        // ---------- 4、5. 和离线版逐位比 ----------
        long seed = json(cases.resolve("points.json")).getAsJsonObject().get("种子").getAsLong();
        Map<String, List<Pt>> casePts = points(offline.resolve("用例.txt")), realPts = points(offline.resolve("真包.txt"));
        Map<String, DensityFunction> caseFns = compare("用例", test, seed, casePts, 0);
        compare("真包", real, 116, realPts, 1e-5);

        // ---------- 6. 重混淆后的 jar ----------
        checkReobf(a[5], a[6], a[7]);

        // ---------- 7. 两处引用并成一个 ----------
        int nMerged = 0;
        for (var pair : List.of(Map.entry(real, packFiles), Map.entry(test, files(cases, "density_function")))) {
            for (String id : pair.getValue().keySet()) {
                check(merged(pair.getKey(), overworld(pair.getKey()), id), id + " 被引用两次时接上噪声后是两个对象（equals、hashCode 没按内容比？）");
                nMerged++;
            }
        }
        System.out.println("合并：" + nMerged + " 个密度函数被引用两次时都并成一个对象");

        if (perf) perf(real, vanillaJar, etnZip, caseFns, casePts, realPts.values().iterator().next());
        System.out.println(fails == 0 ? "地形修整测试：全部通过（" + checks + " 项）" : "地形修整测试：" + fails + " / " + checks + " 项不对");
        System.exit(fails == 0 ? 0 : 1);
    }

    /**
     * 游戏里跑 SRG 名：重混淆要把 `compute`、`mapAll` 这些方法一起改名，漏一个进游戏就是 AbstractMethodError。
     * 另开类加载器，只放 SRG 名 Forge、重混淆 jar 和其余库，查 `DensityFunction` 每个抽象方法在两个类里都有实现
     */
    static void checkReobf(String reobfJar, String srgJar, String libs) throws Exception {
        List<URL> urls = new ArrayList<>(List.of(new File(reobfJar).toURI().toURL(), new File(srgJar).toURI().toURL()));
        for (String l : libs.split(":")) if (!l.isEmpty()) urls.add(new File(l).toURI().toURL());
        try (URLClassLoader cl = new URLClassLoader(urls.toArray(URL[]::new), ClassLoader.getPlatformClassLoader())) {
            Class<?> df = Class.forName("net.minecraft.world.level.levelgen.DensityFunction", false, cl);
            int n = 0;
            for (String name : List.of("mcai.terrain.Region", "mcai.terrain.TerrainEdit")) {
                Class<?> c = Class.forName(name, false, cl);
                check(df.isAssignableFrom(c), name + " 在重混淆的 jar 里不是 DensityFunction");
                for (Method m : df.getMethods()) {
                    if (!Modifier.isAbstract(m.getModifiers())) continue;
                    Method impl = c.getMethod(m.getName(), m.getParameterTypes());
                    check(!Modifier.isAbstract(impl.getModifiers()), name + " 在重混淆的 jar 里没实现 " + m.getName());
                    n++;
                }
            }
            System.out.println("重混淆：Region、TerrainEdit 实现了 DensityFunction 的 " + n / 2 + " 个抽象方法（SRG 名）");
        }
    }

    // ================= --性能 =================

    /** 每次求值多少纳秒：把这批点反复算，凑够 0.3 秒 */
    static double nsPerEval(DensityFunction f, List<DensityFunction.FunctionContext> ctx) {
        double sink = 0;
        for (int w = 0; w < 3; w++) for (var c : ctx) sink += f.compute(c);
        long n = 0, t0 = System.nanoTime(), t;
        do {
            for (var c : ctx) sink += f.compute(c);
            n += ctx.size();
        } while ((t = System.nanoTime() - t0) < 300_000_000L);
        if (sink == 12345.678) System.out.print("");
        return (double) t / n;
    }

    static List<DensityFunction.FunctionContext> ctxs(List<Pt> pts) {
        return pts.stream().map(p -> (DensityFunction.FunctionContext) new DensityFunction.SinglePointContext(p.x, p.y, p.z)).toList();
    }

    static void perf(RegistryAccess.Frozen real, File vanillaJar, File etnZip, Map<String, DensityFunction> caseFns, Map<String, List<Pt>> casePts, List<Pt> realPts) {
        System.out.println("\n== 性能（单线程；游戏里噪声这一步按区块多线程，比例不变）");
        System.out.println("-- 用例每次求值（离线版取的那批点，包围盒外、过渡带、深处都有）");
        for (var e : caseFns.entrySet()) System.out.printf("  %-36s %7.1f ns%n", e.getKey(), nsPerEval(e.getValue(), ctxs(casePts.get(e.getKey()))));

        System.out.println("-- 多边形点数和每次求值（半径 10 km 的正多边形，falloff 1 km，不加 edge；点在外接方框里均匀取）");
        Random r = new Random(1);
        List<DensityFunction.FunctionContext> box = new ArrayList<>();
        for (int i = 0; i < 20000; i++) box.add(new DensityFunction.SinglePointContext(r.nextInt(-11000, 11000), 64, r.nextInt(-11000, 11000)));
        for (int n : new int[]{4, 16, 64, 256, 1024}) {
            List<Shape.Vec> v = new ArrayList<>();
            for (int i = 0; i < n; i++) v.add(new Shape.Vec(10000 * Math.cos(2 * Math.PI * i / n), 10000 * Math.sin(2 * Math.PI * i / n)));
            System.out.printf("  多边形 %4d 点 %8.1f ns%n", n, nsPerEval(new Region(new Shape.Polygon(v), 1000, DensityFunctions.zero()), box));
        }

        // 真包：大陆度加修整前后；点取在真包每个区域附近
        RegistryAccess.Frozen plain = load(List.of(new FilePackResources("vanilla", vanillaJar, true), new FilePackResources("epicterrain", etnZip, false)));
        RandomState withEdit = RandomState.create(overworld(real), real.lookupOrThrow(Registries.NOISE), 116);
        RandomState without = RandomState.create(overworld(plain), plain.lookupOrThrow(Registries.NOISE), 116);
        List<DensityFunction.FunctionContext> near = ctxs(realPts);
        System.out.println("-- 路由的大陆度每次求值（不经区块缓存；点是离线版在真包各区域附近取的那批）");
        System.out.printf("  史诗地形原样 %7.1f ns，加修整 %7.1f ns%n", nsPerEval(without.router().continents(), near), nsPerEval(withEdit.router().continents(), near));

        // 整块区块：群系、噪声两步加修整前后交替量；区块选在修整区域深处、过渡带、区域外
        System.out.println("-- 区块生成（群系 + 噪声两步，4×4 个区块一组，交替量 3 轮取后 2 轮）");
        DensityFunction weight = null;
        for (var e : real.registryOrThrow(Registries.DENSITY_FUNCTION).entrySet()) {
            if (e.getValue() instanceof Region) {
                weight = wire(real, overworld(real), e.getKey().location().toString(), 116);
                System.out.println("  按区域 " + e.getKey().location() + " 选区块");
                break;
            }
        }
        if (weight == null) return;
        Map<String, int[]> where = new LinkedHashMap<>();
        for (int x = -60000; x <= 120000 && where.size() < 3; x += 512) {
            for (int z = -60000; z <= 60000 && where.size() < 3; z += 512) {
                double w = weight.compute(new DensityFunction.SinglePointContext(x, 64, z));
                String k = w >= 1 ? "区域深处" : w > 0 ? "过渡带" : null;
                if (k != null && !where.containsKey(k)) where.put(k, new int[]{x >> 4, z >> 4});
            }
        }
        where.put("区域外", new int[]{0, 0});
        Gen a = new Gen(real), b = new Gen(plain);
        for (var e : where.entrySet()) {
            double[] ta = new double[2], tb = new double[2];
            for (int round = 0; round < 3; round++) {
                double[] x = a.time(e.getValue()[0], e.getValue()[1]), y = b.time(e.getValue()[0], e.getValue()[1]);
                if (round == 0) continue;
                for (int i = 0; i < 2; i++) {
                    ta[i] += x[i] / 2;
                    tb[i] += y[i] / 2;
                }
            }
            System.out.printf("  %s 区块 (%d, %d) 起：群系 %.2f → %.2f ms/块（%+.1f%%），噪声 %.2f → %.2f ms/块（%+.1f%%）%n", e.getKey(), e.getValue()[0], e.getValue()[1],
                    tb[0], ta[0], 100 * (ta[0] / tb[0] - 1), tb[1], ta[1], 100 * (ta[1] / tb[1] - 1));
        }
    }

    static Object zero(Class<?> t) {
        if (t == boolean.class) return false;
        if (t == int.class) return 0;
        if (t == long.class) return 0L;
        if (t == float.class) return 0f;
        if (t == double.class) return 0.0;
        if (t == short.class) return (short) 0;
        if (t == byte.class) return (byte) 0;
        if (t == char.class) return (char) 0;
        return null;
    }

    /** 用游戏的 NoiseBasedChunkGenerator 生成区块的前两步（群系、噪声），量每块的毫秒数 */
    static final class Gen {
        final NoiseBasedChunkGenerator gen;
        final RandomState rs;
        final LevelHeightAccessor height;
        final Registry<net.minecraft.world.level.biome.Biome> biomes;

        Gen(RegistryAccess ra) {
            var settings = ra.registryOrThrow(Registries.NOISE_SETTINGS).getHolderOrThrow(NoiseGeneratorSettings.OVERWORLD);
            var params = ra.registryOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST).getHolderOrThrow(MultiNoiseBiomeSourceParameterLists.OVERWORLD);
            gen = new NoiseBasedChunkGenerator(MultiNoiseBiomeSource.createFromPreset(params), settings);
            rs = RandomState.create(settings.value(), ra.lookupOrThrow(Registries.NOISE), 116);
            height = LevelHeightAccessor.create(settings.value().noiseSettings().minY(), settings.value().noiseSettings().height());
            biomes = ra.registryOrThrow(Registries.BIOME);
        }

        double[] time(int cx0, int cz0) {
            Executor direct = Runnable::run;
            long tb = 0, tn = 0;
            for (int dx = 0; dx < 4; dx++) {
                for (int dz = 0; dz < 4; dz++) {
                    ProtoChunk chunk = new ProtoChunk(new ChunkPos(cx0 + dx, cz0 + dz), UpgradeData.EMPTY, height, biomes, null);
                    // 噪声这一步要问结构管理器区块里有没有结构，给一个只认这个空区块的假世界
                    LevelAccessor level = (LevelAccessor) Proxy.newProxyInstance(TerrainEditTest.class.getClassLoader(), new Class<?>[]{LevelAccessor.class},
                            (p, m, args) -> m.getName().equals("getChunk") ? chunk : zero(m.getReturnType()));
                    StructureManager sm = new StructureManager(level, WorldOptions.defaultWithRandomSeed(), null);
                    long t0 = System.nanoTime();
                    gen.createBiomes(direct, rs, Blender.empty(), sm, chunk).join();
                    long t1 = System.nanoTime();
                    gen.fillFromNoise(direct, Blender.empty(), rs, sm, chunk).join();
                    tb += t1 - t0;
                    tn += System.nanoTime() - t1;
                }
            }
            return new double[]{tb / 16e6, tn / 16e6};
        }
    }
}
