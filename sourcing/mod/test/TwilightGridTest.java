import mcai.TwilightGrid;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.commons.ClassRemapper;
import org.objectweb.asm.commons.SimpleRemapper;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.InsnNode;
import org.objectweb.asm.tree.IntInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.util.Printer;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import twilightforest.init.TFLandmark;
import twilightforest.util.XZQuadrantIterator;

import java.io.InputStream;
import java.lang.invoke.MethodHandles;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.TreeMap;

/**
 * 暮色地标网格的离线核对，不开游戏。跑法：在 取材mod/ 下 sh 测试/暮色网格测试.sh。
 * 拿重混淆后的 build/libs/mcai-0.1.0.jar（和装进游戏的同一个文件）对照暮色 4.3.2508 jar 里的原函数：
 * 1. `TwilightGrid` 的照抄函数在 grid = 16 时和暮色原函数逐值相同；
 * 2. mixin 处理函数（反射调用，离线不织入）：开关关着时原样放行；开着时 64 区块网格和原版 16 区块网格满足「整体放大 4 倍」；
 * 3. 终焉城堡（第 8～11 条）：结构件类要整套注册表才能加载，离线造不出来，所以从暮色 jar 字节码核对 mixin 依据的原版写法，
 *    再用暮色原来的 getComponentToAddBoundingBox 和 BoundingBox 按 mixin 的做法算主楼和迷宫的落点。
 * 暮色的 `LegacyLandmarkPlacements` 静态初始化要引导整套注册表，离线起不来，被测方法又用不到那张表，所以读出类、去掉静态初始化、改名另装一份来调。
 * jar 里的 Minecraft 方法是 SRG 名，BlockPos 的 getX/getZ 写成 m_123341_/m_123343_。
 */
public class TwilightGridTest {
    static int checks, fails;
    static Method origCenter, origVariety, origScanner;

    static void check(boolean ok, String what) {
        checks++;
        if (!ok && fails++ < 20) System.out.println("不对：" + what);
    }

    static int x(BlockPos p) {
        return p.m_123341_();
    }

    static int z(BlockPos p) {
        return p.m_123343_();
    }

    static Method handler(String cls, String name, Class<?>... args) throws Exception {
        Method m = Class.forName(cls).getDeclaredMethod(name, args);
        m.setAccessible(true);
        return m;
    }

    static int field(Object o, String name) throws Exception {
        Field f = o.getClass().getDeclaredField(name);
        f.setAccessible(true);
        return f.getInt(o);
    }

    /** 暮色 jar 里的类，只读字节码，不加载 */
    static ClassNode classNode(String name) throws Exception {
        try (InputStream in = TwilightGridTest.class.getClassLoader().getResourceAsStream(name + ".class")) {
            ClassNode cn = new ClassNode();
            new ClassReader(in.readAllBytes()).accept(cn, ClassReader.SKIP_FRAMES);
            return cn;
        }
    }

    static MethodNode method(ClassNode cn, String name, String desc) {
        for (MethodNode m : cn.methods) {
            if (m.name.equals(name) && (desc == null || m.desc.equals(desc))) return m;
        }
        return null;
    }

    /** 方法的指令，一条一行写成「操作码 操作数」，标签、行号略去 */
    static List<String> insns(MethodNode m) {
        List<String> out = new ArrayList<>();
        for (AbstractInsnNode n : m.instructions) {
            if (n.getOpcode() < 0) continue;
            String op = Printer.OPCODES[n.getOpcode()];
            if (n instanceof IntInsnNode i) op += " " + i.operand;
            else if (n instanceof VarInsnNode v) op += " " + v.var;
            else if (n instanceof MethodInsnNode mi) op += " " + mi.owner + "." + mi.name + " " + mi.desc;
            else if (n instanceof FieldInsnNode f) op += " " + f.owner + "." + f.name;
            else if (n instanceof TypeInsnNode t) op += " " + t.desc;
            out.add(op);
        }
        return out;
    }

    /** 暮色某个结构件的构造函数里，包围盒取的是父件包围盒四边各外扩 k 格（minX - k、minZ - k、maxX + k、maxZ + k） */
    static boolean expands(String cls, int k) throws Exception {
        String bb = "INVOKEVIRTUAL net/minecraft/world/level/levelgen/structure/BoundingBox.";
        String n = k <= 5 ? "ICONST_" + k : "BIPUSH " + k;
        for (MethodNode m : classNode(cls).methods) {
            if (!m.name.equals("<init>")) continue;
            List<String> in = insns(m);
            if (find(in, bb + "m_162395_ ()I", n, "ISUB") >= 0 && find(in, bb + "m_162398_ ()I", n, "ISUB") >= 0
                    && find(in, bb + "m_162399_ ()I", n, "IADD") >= 0 && find(in, bb + "m_162401_ ()I", n, "IADD") >= 0) return true;
        }
        return false;
    }

    /** seq 在 list 里连续出现的位置，没有是 -1 */
    static int find(List<String> list, String... seq) {
        return Collections.indexOfSubList(list, List.of(seq));
    }

    /** 把暮色 FinalCastleMazeTower13Component.isWithinRange 原样搬进一个只有它的新类（原类要注册表，离线加载不了） */
    static Object originalWithinRange() throws Exception {
        MethodNode m = method(classNode(MAZE), "isWithinRange", "(IIIII)Z");
        m.access = Opcodes.ACC_PUBLIC;
        ClassNode cn = new ClassNode();
        cn.version = Opcodes.V17;
        cn.access = Opcodes.ACC_PUBLIC | Opcodes.ACC_SUPER;
        cn.name = "twilightforest/util/OrigWithinRange";
        cn.superName = "java/lang/Object";
        MethodNode init = new MethodNode(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
        init.instructions.add(new VarInsnNode(Opcodes.ALOAD, 0));
        init.instructions.add(new MethodInsnNode(Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false));
        init.instructions.add(new InsnNode(Opcodes.RETURN));
        cn.methods.add(init);
        cn.methods.add(m);
        ClassWriter cw = new ClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);
        cn.accept(cw);
        return MethodHandles.privateLookupIn(XZQuadrantIterator.class, MethodHandles.lookup()).defineClass(cw.toByteArray()).getConstructor().newInstance();
    }

    static final String FC = "twilightforest/world/components/structures/finalcastle/";
    static final String MAIN = FC + "FinalCastleMainComponent";
    static final String MAZE = FC + "FinalCastleMazeTower13Component";

    /** 原版主楼的包围盒：起点区块 (sx, sz)，照 LandmarkStructure 取 x = 区块 * 16 + 7，照 FinalCastleMainComponent 吸附再摆（第 8 条核对过这两步） */
    static BoundingBox vanillaMainBox(int sx, int sz) {
        int x = sx * 16 + 7, z = sz * 16 + 7;
        x = x + 127 >> 8 << 8;
        z = z + 127 >> 8 << 8;
        return TFLandmark.getComponentToAddBoundingBox(x, 70, z, -24, 120, -24, 48, 40, 48, Direction.SOUTH, false);
    }

    /** 原版迷宫的城堡中心（FinalCastleMazeTower13Component.buildContinueTowerTowards，第 8 条核对过） */
    static int vanillaCastleCenter(int startMin) {
        return startMin + 128 >> 8 << 8;
    }

    /** 暮色原版 LegacyLandmarkPlacements 去掉静态初始化，改名 OrigLegacyLandmarkPlacements 装进同一个包 */
    static Class<?> originalPlacements() throws Exception {
        String from = "twilightforest/util/LegacyLandmarkPlacements";
        byte[] bytes;
        try (InputStream in = TwilightGridTest.class.getClassLoader().getResourceAsStream(from + ".class")) {
            bytes = in.readAllBytes();
        }
        ClassWriter cw = new ClassWriter(0);
        ClassVisitor noClinit = new ClassVisitor(Opcodes.ASM9, cw) {
            @Override
            public MethodVisitor visitMethod(int access, String name, String desc, String sig, String[] exceptions) {
                return name.equals("<clinit>") ? null : super.visitMethod(access, name, desc, sig, exceptions);
            }
        };
        new ClassReader(bytes).accept(new ClassRemapper(noClinit, new SimpleRemapper(from, "twilightforest/util/OrigLegacyLandmarkPlacements")), 0);
        return MethodHandles.privateLookupIn(XZQuadrantIterator.class, MethodHandles.lookup()).defineClass(cw.toByteArray());
    }

    static BlockPos origCenter(int cx, int cz, int h) throws Exception {
        return (BlockPos) origCenter.invoke(null, cx, cz, h);
    }

    static TFLandmark origVariety(int cx, int cz, long seed) throws Exception {
        return (TFLandmark) origVariety.invoke(null, cx, cz, seed);
    }

    static boolean forcedNagaLich(int regionX, int regionZ) {
        int ox = Math.abs((regionX + 4) % 8), oz = Math.abs((regionZ + 4) % 8);
        return ox == 4 && (oz == 3 || oz == 5) || oz == 4 && (ox == 3 || ox == 5);
    }

    public static void main(String[] args) throws Exception {
        Class<?> orig = originalPlacements();
        origCenter = orig.getMethod("getNearestCenterXZ", int.class, int.class, int.class);
        origVariety = orig.getMethod("pickVarietyLandmark", int.class, int.class, long.class);
        origScanner = orig.getMethod("landmarkCenterScanner", BlockPos.class, int.class);

        String llp = "mcai.mixin.LegacyLandmarkPlacementsMixin";
        Method center = handler(llp, "mcai$nearestCenter", int.class, int.class, int.class, CallbackInfoReturnable.class);
        Method roundX = handler(llp, "mcai$roundX", int.class);
        Method roundZ = handler(llp, "mcai$roundZ", int.class);
        Method variety = handler(llp, "mcai$variety", int.class, int.class, long.class, CallbackInfoReturnable.class);
        Method scanner = handler(llp, "mcai$scanner", BlockPos.class, int.class, CallbackInfoReturnable.class);
        String cgt = "mcai.mixin.ChunkGeneratorTwilightMixin";
        Method cloudX = handler(cgt, "mcai$cloudRegionX", ChunkPos.class);
        Method cloudZ = handler(cgt, "mcai$cloudRegionZ", ChunkPos.class);
        Random r = new Random(20261004);

        // 1. 照抄函数在 grid = 16 时等于暮色原函数（区块坐标正负 20 万以内，含负数网格的 +9 分支）
        for (int i = 0; i < 1_000_000; i++) {
            int cx = r.nextInt(400_001) - 200_000, cz = r.nextInt(400_001) - 200_000;
            long seed = r.nextLong();
            check(TwilightGrid.nearestCenter(cx, cz, 7, 16).equals(origCenter(cx, cz, 7)), "grid16 中心 " + cx + "," + cz);
            check(TwilightGrid.varietyLandmark(cx, cz, seed, 16) == origVariety(cx, cz, seed), "grid16 普通地标 " + cx + "," + cz);
        }

        // 2. 开关关着：全部原样放行
        TwilightGrid.enabled = false;
        for (int i = 0; i < 10_000; i++) {
            int cx = r.nextInt(400_001) - 200_000, cz = r.nextInt(400_001) - 200_000;
            CallbackInfoReturnable<BlockPos> c1 = new CallbackInfoReturnable<>("getNearestCenterXZ", true);
            center.invoke(null, cx, cz, 0, c1);
            CallbackInfoReturnable<TFLandmark> c2 = new CallbackInfoReturnable<>("pickVarietyLandmark", true);
            variety.invoke(null, cx, cz, 1L, c2);
            CallbackInfoReturnable<?> c3 = new CallbackInfoReturnable<>("landmarkCenterScanner", true);
            scanner.invoke(null, new BlockPos(cx * 16, 0, cz * 16), 3, c3);
            check(!c1.isCancelled() && !c2.isCancelled() && !c3.isCancelled(), "关着时不该接管 " + cx + "," + cz);
            check((int) roundX.invoke(null, cx) == cx && (int) roundZ.invoke(null, cz) == cz, "关着时不该取整");
            ChunkPos pos = new ChunkPos(cx, cz);
            check((int) cloudX.invoke(null, pos) == cx && (int) cloudZ.invoke(null, pos) == cz, "关着时云层编号不该变");
        }

        TwilightGrid.enabled = true;
        // 3. 网格中心：64 区块网格 (rx, rz) 的中心 = 原版网格中心放大 4 倍（rx >= 0 时 4c - 24，rx < 0 时 4c - 27，来自原函数 +8 / +9 的半格修正）；
        //    网格内任一区块查到同一个中心，中心区块查自己得到自己
        for (int i = 0; i < 200_000; i++) {
            int rx = r.nextInt(6001) - 3000, rz = r.nextInt(6001) - 3000;
            int cx = rx * 64 + r.nextInt(64) - 32, cz = rz * 64 + r.nextInt(64) - 32;
            CallbackInfoReturnable<BlockPos> c = new CallbackInfoReturnable<>("getNearestCenterXZ", true);
            center.invoke(null, cx, cz, 0, c);
            BlockPos ours = c.getReturnValue();
            BlockPos o = origCenter(rx * 16, rz * 16, 0);
            check(x(ours) == 4 * x(o) - (rx >= 0 ? 24 : 27) && z(ours) == 4 * z(o) - (rz >= 0 ? 24 : 27),
                    "中心不是原版放大 4 倍：网格 " + rx + "," + rz + " 得 " + ours + " 原版 " + o);
            check(TwilightGrid.region(x(ours) >> 4, 64) == rx && TwilightGrid.region(z(ours) >> 4, 64) == rz, "中心不在本网格 " + rx + "," + rz);
            CallbackInfoReturnable<BlockPos> c2 = new CallbackInfoReturnable<>("getNearestCenterXZ", true);
            center.invoke(null, x(ours) >> 4, z(ours) >> 4, 0, c2);
            check(c2.getReturnValue().equals(ours), "中心区块查到的不是自己 " + ours);
        }

        // 4. 取整（地形改造取群系的那一点）：取到 64 的倍数、离原坐标不超过半格，原函数接着按 16 取整不再变
        for (int i = 0; i < 200_000; i++) {
            int c = r.nextInt(400_001) - 200_000;
            int v = (int) roundX.invoke(null, c);
            check(v % 64 == 0 && Math.abs(v - c) <= 32 && Math.round(v / 16.0f) * 16 == v && (int) roundZ.invoke(null, c) == v, "取整 " + c + " -> " + v);
        }

        // 5. 普通地标：64 区块网格落在强制娜迦/巫妖位置上时和原版一致；否则抽签，种子按区块 (64k, 64m) 算，等于原函数在该点抽到的
        for (int i = 0; i < 300_000; i++) {
            int cx = r.nextInt(400_001) - 200_000, cz = r.nextInt(400_001) - 200_000;
            long seed = r.nextLong();
            int k = Math.round(cx / 64.0f), m = Math.round(cz / 64.0f);
            CallbackInfoReturnable<TFLandmark> c = new CallbackInfoReturnable<>("pickVarietyLandmark", true);
            variety.invoke(null, cx, cz, seed, c);
            TFLandmark want = forcedNagaLich(k, m) ? origVariety(k * 16, m * 16, seed) : origVariety(k * 64, m * 64, seed);
            check(c.getReturnValue() == want, "普通地标 " + cx + "," + cz + " 得 " + c.getReturnValue() + " 应为 " + want);
        }

        // 6. /locate 的扫描：圈数、遍历起始状态同原版，只是起点对齐到 64 区块、步长 64
        for (int i = 0; i < 20_000; i++) {
            BlockPos focus = new BlockPos(r.nextInt(2_000_001) - 1_000_000, 0, r.nextInt(2_000_001) - 1_000_000);
            int radius = 1 + r.nextInt(10);
            CallbackInfoReturnable<XZQuadrantIterator<BlockPos>> c = new CallbackInfoReturnable<>("landmarkCenterScanner", true);
            scanner.invoke(null, focus, radius, c);
            Object ours = c.getReturnValue(), o = origScanner.invoke(null, focus, radius);
            check(field(ours, "xConstant") == Math.floorDiv(x(focus) >> 4, 64) * 64 && field(ours, "zConstant") == Math.floorDiv(z(focus) >> 4, 64) * 64
                    && field(ours, "spacing") == 64 && field(o, "spacing") == 16 && field(ours, "radius") == field(o, "radius")
                    && field(ours, "dX") == field(o, "dX") && field(ours, "dZ") == field(o, "dZ") && field(ours, "cardinal") == field(o, "cardinal"),
                    "扫描 " + focus + " r=" + radius);
        }

        // 7. 云中小屋云层：替换后的坐标代进原式 (x + 8) >> 4，得到的正好是 64 区块网格编号
        for (int i = 0; i < 200_000; i++) {
            int cx = r.nextInt(400_001) - 200_000, cz = r.nextInt(400_001) - 200_000;
            ChunkPos pos = new ChunkPos(cx, cz);
            check(((int) cloudX.invoke(null, pos) + 8 >> 4) == TwilightGrid.region(cx, 64)
                    && ((int) cloudZ.invoke(null, pos) + 8 >> 4) == TwilightGrid.region(cz, 64), "云层编号 " + cx + "," + cz);
        }

        // 8. 终焉城堡的原版写法（读暮色 jar 字节码）。mixin 和第 10 条的推算依据这些，暮色一改就在这里报出来
        String bb = "net/minecraft/world/level/levelgen/structure/BoundingBox";
        String st = "twilightforest/world/components/structures/";
        //    起点：x = 起点区块 * 16 + 7（城堡这一支没覆盖 dontCenter），原样传给 getFirstPiece，getFirstPiece 原样传给主楼
        List<String> gen = insns(method(classNode(st + "util/LandmarkStructure"), "m_214086_", null));
        check(find(gen, "ALOAD 2", "GETFIELD net/minecraft/world/level/ChunkPos.f_45578_", "ICONST_4", "ISHL", "ILOAD 3", "IFEQ", "ICONST_0", "GOTO", "BIPUSH 7", "IADD", "ISTORE 4") >= 0
                && find(gen, "ALOAD 2", "GETFIELD net/minecraft/world/level/ChunkPos.f_45579_", "ICONST_4", "ISHL", "ILOAD 3", "IFEQ", "ICONST_0", "GOTO", "BIPUSH 7", "IADD", "ISTORE 5") >= 0
                && find(gen, "ALOAD 2", "ILOAD 4", "ILOAD 6", "ILOAD 5", "INVOKEVIRTUAL " + st + "util/LandmarkStructure.getFirstPiece (Lnet/minecraft/world/level/levelgen/structure/Structure$GenerationContext;Lnet/minecraft/util/RandomSource;Lnet/minecraft/world/level/ChunkPos;III)Lnet/minecraft/world/level/levelgen/structure/StructurePiece;") >= 0,
                "结构起点的写法变了");
        check(insns(method(classNode(st + "util/LandmarkStructure"), "dontCenter", "()Z")).equals(List.of("ICONST_0", "IRETURN"))
                && method(classNode(st + "type/FinalCastleStructure"), "dontCenter", null) == null
                && method(classNode(st + "util/ConquerableStructure"), "dontCenter", null) == null
                && method(classNode(st + "util/ProgressionStructure"), "dontCenter", null) == null, "城堡的 dontCenter 变了");
        check(insns(method(classNode(st + "type/FinalCastleStructure"), "getFirstPiece", null)).equals(List.of(
                "NEW " + MAIN, "DUP", "ICONST_0", "ILOAD 4", "ILOAD 5", "ILOAD 6", "INVOKESPECIAL " + MAIN + ".<init> (IIII)V", "ARETURN")), "getFirstPiece 变了");
        //    主楼：x、z 各吸到 256 格网格点，包围盒是吸附点 ±24，构造函数里只设这一次包围盒
        List<String> ctor = insns(method(classNode(MAIN), "<init>", "(IIII)V"));
        check(find(ctor, "ILOAD 2", "BIPUSH 127", "IADD", "BIPUSH 8", "ISHR", "BIPUSH 8", "ISHL", "ISTORE 2") >= 0
                && find(ctor, "ILOAD 4", "BIPUSH 127", "IADD", "BIPUSH 8", "ISHR", "BIPUSH 8", "ISHL", "ISTORE 4") >= 0, "主楼吸附 256 格的写法变了");
        check(find(ctor, "ALOAD 0", "ILOAD 2", "ILOAD 3", "ILOAD 4", "BIPUSH -24", "BIPUSH 120", "BIPUSH -24", "BIPUSH 48", "BIPUSH 40", "BIPUSH 48",
                "GETSTATIC net/minecraft/core/Direction.SOUTH", "ICONST_0",
                "INVOKESTATIC twilightforest/init/TFLandmark.getComponentToAddBoundingBox (IIIIIIIIILnet/minecraft/core/Direction;Z)L" + bb + ";",
                "PUTFIELD " + MAIN + ".f_73383_") >= 0
                && ctor.stream().filter(i -> i.endsWith(".f_73383_")).count() == 1, "主楼包围盒的写法变了");
        //    迷宫：buildContinueTowerTowards 第一个参数是 StructurePieceAccessor（mixin 捕获），isWithinRange 调两次，第 2 次的中心是 pieces[0] 的 minX、minZ 各 + 128 >> 8 << 8
        MethodNode cont = method(classNode(MAZE), "buildContinueTowerTowards", null);
        List<String> mz = insns(cont);
        String within = "INVOKEVIRTUAL " + MAZE + ".isWithinRange (IIIII)Z";
        String bbOf = "INVOKEVIRTUAL net/minecraft/world/level/levelgen/structure/StructurePiece.m_73547_ ()L" + bb + ";";
        int castleRange = find(mz, "ALOAD 9", "GETFIELD net/minecraft/world/level/levelgen/structure/pieces/StructurePiecesBuilder.f_192778_", "ICONST_0",
                "INVOKEINTERFACE java/util/List.get (I)Ljava/lang/Object;", "CHECKCAST net/minecraft/world/level/levelgen/structure/StructurePiece", "ASTORE 10",
                "ALOAD 10", bbOf, "INVOKEVIRTUAL " + bb + ".m_162395_ ()I", "SIPUSH 128", "IADD", "BIPUSH 8", "ISHR", "BIPUSH 8", "ISHL", "ISTORE 11",
                "ALOAD 10", bbOf, "INVOKEVIRTUAL " + bb + ".m_162398_ ()I", "SIPUSH 128", "IADD", "BIPUSH 8", "ISHR", "BIPUSH 8", "ISHL", "ISTORE 12",
                "ALOAD 0", "ILOAD 11", "ILOAD 12", "ALOAD 8", "INVOKEVIRTUAL net/minecraft/core/BlockPos.m_123341_ ()I",
                "ALOAD 8", "INVOKEVIRTUAL net/minecraft/core/BlockPos.m_123343_ ()I", "SIPUSH 128", within);
        check(cont.desc.startsWith("(Lnet/minecraft/world/level/levelgen/structure/StructurePieceAccessor;")
                && mz.stream().filter(within::equals).count() == 2 && castleRange > mz.indexOf(within), "迷宫城堡中心的写法变了");

        // 9. isWithinRange：TwilightGrid 的照抄和暮色原方法逐值相同；迷宫 mixin 开关关着时就是原方法
        Object origWr = originalWithinRange();
        Method origWithin = origWr.getClass().getMethod("isWithinRange", int.class, int.class, int.class, int.class, int.class);
        ClassLoader cl = TwilightGridTest.class.getClassLoader();
        Method near = handler("mcai.mixin.FinalCastleMazeTower13ComponentMixin", "mcai$nearCastleCenter",
                Class.forName(MAZE.replace('/', '.'), false, cl), int.class, int.class, int.class, int.class, int.class,
                Class.forName("net.minecraft.world.level.levelgen.structure.StructurePieceAccessor", false, cl));
        Object mazeMixin = near.getDeclaringClass().getDeclaredConstructor().newInstance();
        TwilightGrid.enabled = false;
        for (int i = 0; i < 300_000; i++) {
            int cx = r.nextInt(400_001) - 200_000, cz = r.nextInt(400_001) - 200_000, range = 1 + r.nextInt(300);
            int px = i % 2 == 0 ? r.nextInt(400_001) - 200_000 : cx + r.nextInt(2 * range + 3) - range - 1;   // 一半落在边界附近
            int pz = i % 2 == 0 ? r.nextInt(400_001) - 200_000 : cz + r.nextInt(2 * range + 3) - range - 1;
            boolean want = (boolean) origWithin.invoke(origWr, cx, cz, px, pz, range);
            check(TwilightGrid.withinRange(cx, cz, px, pz, range) == want && (boolean) near.invoke(mazeMixin, null, cx, cz, px, pz, range, null) == want,
                    "isWithinRange " + cx + "," + cz + " " + px + "," + pz + " " + range);
        }

        // 10. 主楼和迷宫的落点。主楼 mixin 要动真的结构件，离线造不出来，这里用同样的 BoundingBox 操作算；mixin 本身只核对什么时候不动手
        Method centerOn = handler("mcai.mixin.FinalCastleStructureMixin", "mcai$centerOnLandmark",
                Class.forName("net.minecraft.world.level.levelgen.structure.Structure$GenerationContext", false, cl),
                Class.forName("net.minecraft.util.RandomSource", false, cl), ChunkPos.class, int.class, int.class, int.class, CallbackInfoReturnable.class);
        Object structMixin = centerOn.getDeclaringClass().getDeclaredConstructor().newInstance();
        TreeMap<Integer, Integer> snapOffsets = new TreeMap<>();
        int cut = 0, mazeOff = 0;
        TwilightGrid.enabled = true;
        for (int i = 0; i < 200_000; i++) {
            int rx = r.nextInt(6001) - 3000, rz = r.nextInt(6001) - 3000;
            BlockPos c = TwilightGrid.nearestCenter(rx * 64, rz * 64, 0, 64);
            int sx = c.m_123341_() >> 4, sz = c.m_123343_() >> 4;   // 起点区块就是地标中心所在区块
            check(c.equals(TwilightGrid.castleCenter(sx, sz)), "城堡落点 " + rx + "," + rz);
            // 不改的话：主楼吸到 256 格网格点，相对起点区块偏出去，有的超出 8 区块引用半径
            BoundingBox box = vanillaMainBox(sx, sz);
            BlockPos snapped = box.m_162394_();
            snapOffsets.merge(snapped.m_123341_() - (sx * 16 + 7), 1, Integer::sum);
            snapOffsets.merge(snapped.m_123343_() - (sz * 16 + 7), 1, Integer::sum);
            if ((box.m_162399_() >> 4) - sx > 8 || sx - (box.m_162395_() >> 4) > 8 || (box.m_162401_() >> 4) - sz > 8 || sz - (box.m_162398_() >> 4) > 8) cut++;
            // FinalCastleStructureMixin：平移到地标中心
            box.m_162367_(c.m_123341_() - snapped.m_123341_(), 0, c.m_123343_() - snapped.m_123343_());
            BlockPos now = box.m_162394_();
            check(now.m_123341_() == c.m_123341_() && now.m_123343_() == c.m_123343_() && box.m_162399_() - box.m_162395_() == 48 && box.m_162401_() - box.m_162398_() == 48
                    && Math.abs((box.m_162395_() >> 4) - sx) <= 2 && Math.abs((box.m_162399_() >> 4) - sx) <= 2
                    && Math.abs((box.m_162398_() >> 4) - sz) <= 2 && Math.abs((box.m_162401_() >> 4) - sz) <= 2, "主楼没落到地标中心 " + rx + "," + rz);
            // FinalCastleMazeTower13ComponentMixin：城堡中心取主楼中心，离它不到 128 格的迷宫塔（13×13）都在起点区块 ±8 个区块里
            check(((c.m_123341_() + 127 + 6) >> 4) - sx <= 8 && sx - ((c.m_123341_() - 127 - 6) >> 4) <= 8
                    && ((c.m_123343_() + 127 + 6) >> 4) - sz <= 8 && sz - ((c.m_123343_() - 127 - 6) >> 4) <= 8, "迷宫塔超出引用半径 " + rx + "," + rz);
            // 不改的话：迷宫的原式算出的城堡中心和主楼中心差多少
            mazeOff = Math.max(mazeOff, Math.max(Math.abs(vanillaCastleCenter(box.m_162395_()) - c.m_123341_()), Math.abs(vanillaCastleCenter(box.m_162398_()) - c.m_123343_())));
        }
        check(snapOffsets.keySet().equals(new java.util.TreeSet<>(List.of(-71, -7, 57, 121))) && cut > 0, "64 区块网格下原版吸附的偏移和预想的不一样 " + snapOffsets);
        System.out.println("不改的话：主楼相对起点区块的偏移（格→次数，x、z 各算一次）" + snapOffsets + "，" + cut + "/200000 座城堡主楼超出 8 区块引用半径；"
                + "迷宫原式算的城堡中心和主楼中心最多差 " + mazeOff + " 格");
        //    原版 16 区块网格：主楼正好吸在网格点上，迷宫原式算出的就是主楼中心，所以「城堡中心 = 主楼中心」和原版一致；主楼不挪时迷宫 mixin 结果就是原式结果
        for (int i = 0; i < 200_000; i++) {
            int rx = r.nextInt(24001) - 12000, rz = r.nextInt(24001) - 12000;
            BlockPos o = origCenter(rx * 16, rz * 16, 0);
            BoundingBox box = vanillaMainBox(x(o) >> 4, z(o) >> 4);
            BlockPos m = box.m_162394_();
            check(x(m) == rx * 256 && z(m) == rz * 256 && vanillaCastleCenter(box.m_162395_()) == x(m) && vanillaCastleCenter(box.m_162398_()) == z(m),
                    "原版城堡中心 " + rx + "," + rz);
        }
        for (int i = 0; i < 200_000; i++) {
            int sx = r.nextInt(400_001) - 200_000, sz = r.nextInt(400_001) - 200_000;
            int cx = sx * 16 + 7, cz = sz * 16 + 7;
            BoundingBox box = vanillaMainBox(sx, sz);
            check(vanillaCastleCenter(box.m_162395_()) == box.m_162394_().m_123341_() && vanillaCastleCenter(box.m_162398_()) == box.m_162394_().m_123343_(), "原版主楼中心 " + sx + "," + sz);
        }
        //    castleCenter 只认 64 区块网格的地标中心区块；主楼 mixin 开关关着、或不是中心区块时不碰结构件（返回值给 null 也不出错）
        for (int i = 0; i < 200_000; i++) {
            int cx = r.nextInt(400_001) - 200_000, cz = r.nextInt(400_001) - 200_000;
            BlockPos n = TwilightGrid.nearestCenter(cx, cz, 0, 64);
            boolean isCenter = x(n) >> 4 == cx && z(n) >> 4 == cz;
            BlockPos got = TwilightGrid.castleCenter(cx, cz);
            check(isCenter ? n.equals(got) : got == null, "castleCenter " + cx + "," + cz);
            TwilightGrid.enabled = false;
            centerOn.invoke(structMixin, null, null, new ChunkPos(x(n) >> 4, z(n) >> 4), 0, 0, 0, new CallbackInfoReturnable<>("getFirstPiece", false));
            TwilightGrid.enabled = true;
            if (!isCenter) centerOn.invoke(structMixin, null, null, new ChunkPos(cx, cz), 0, 0, 0, new CallbackInfoReturnable<>("getFirstPiece", false));
        }

        // 11. 外围的塔不许伸出起点区块 ±8 个区块的引用半径（`castleTowerFits` 和两个 mixin 处理函数）。先核对依据：残塔碰撞框外扩 6 格并交给 findCollisionPiece；荆棘外扩 5 格；屋顶外扩 2 格
        List<String> dmg = insns(method(classNode(MAZE), "buildDamagedTower", null));
        check(find(dmg, "ALOAD 7", "INVOKEVIRTUAL " + MAZE + ".m_73547_ ()L" + bb + ";", "BIPUSH -6", "ICONST_0", "BIPUSH -6", "BIPUSH 6", "ICONST_0", "BIPUSH 6",
                "INVOKESTATIC twilightforest/util/BoundingBoxUtils.cloneWithAdjustments (L" + bb + ";IIIIII)L" + bb + ";", "ASTORE 8", "ALOAD 1", "ALOAD 8",
                "INVOKEINTERFACE net/minecraft/world/level/levelgen/structure/StructurePieceAccessor.m_141921_ (L" + bb + ";)Lnet/minecraft/world/level/levelgen/structure/StructurePiece;") >= 0
                && dmg.stream().filter(i -> i.contains(".m_141921_ ")).count() == 1, "残塔碰撞框的写法变了");
        check(expands(FC + "FinalCastleFoundation13ComponentThorns", 5), "荆棘的范围变了");
        check(expands(FC + "FinalCastleRoof13CrenellatedComponent", 2) && expands(FC + "FinalCastleRoof13ConicalComponent", 2), "迷宫塔屋顶的范围变了");
        //     castleTowerFits 对照直接按区块算的结果；主楼不在地标中心时一律放行
        int[] mazeCut = new int[2];
        for (int i = 0; i < 300_000; i++) {
            int rx = r.nextInt(6001) - 3000, rz = r.nextInt(6001) - 3000;
            BlockPos c = TwilightGrid.nearestCenter(rx * 64, rz * 64, 0, 64);
            int sx = x(c) >> 4, sz = z(c) >> 4;
            int minX = x(c) + r.nextInt(401) - 200, minZ = z(c) + r.nextInt(401) - 200, maxX = minX + r.nextInt(41), maxZ = minZ + r.nextInt(41);
            boolean want = Math.floorDiv(minX, 16) >= sx - 8 && Math.floorDiv(maxX, 16) <= sx + 8 && Math.floorDiv(minZ, 16) >= sz - 8 && Math.floorDiv(maxZ, 16) <= sz + 8;
            check(TwilightGrid.castleTowerFits(x(c), z(c), minX, minZ, maxX, maxZ) == want, "castleTowerFits " + c + " " + minX + "," + minZ + "～" + maxX + "," + maxZ);
            int ox = r.nextInt(3) - 1, oz = ox == 0 ? 1 : r.nextInt(3) - 1;   // 主楼不在地标中心（差几格）
            check(TwilightGrid.castleTowerFits(x(c) + ox, z(c) + oz, minX - 99_999, minZ, maxX, maxZ + 99_999), "主楼不在地标中心也拦了 " + c);
            //   迷宫塔（中心离城堡中心不到 128 格，连屋顶 ±8）只有中心在区块第 9 格（负半轴）、往正方向离 127 格的那一排放不下
            int t = r.nextInt(255) - 127;
            boolean fits = TwilightGrid.castleTowerFits(x(c), z(c), x(c) + t - 8, z(c) - 8, x(c) + t + 8, z(c) + 8);
            check(fits == !(t == 127 && (x(c) & 15) == 9), "迷宫塔 " + c + " 偏 " + t);
            if (!fits) mazeCut[(x(c) & 15) - 8]++;
        }
        check(mazeCut[0] == 0 && mazeCut[1] > 0, "迷宫塔放不下的情形和预想的不一样");
        //     两个处理函数要真的结构件（StructurePiece 一加载就要整套方块注册表），离线调不了；织没织对看 MixinApplyTest

        System.out.println((fails == 0 ? "全部通过" : "失败 " + fails + " 项") + "，共核对 " + checks + " 项");
        System.exit(fails == 0 ? 0 : 1);
    }
}
