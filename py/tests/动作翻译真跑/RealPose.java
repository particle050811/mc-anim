// 拿真 jar（原版混淆客户端、Forge 的 SRG 客户端加模组 jar）在 JVM 上跑模型的 setupAnim，给动作翻译做真值对照（py/tests/test_动作翻译真jar.py）。
// 不认名字：类名、成员名都由 Python 那边按映射（client.txt、tsrg）换成 jar 里的名字传进来，这里只按名字和描述符反射。
// 实体用 Unsafe.allocateInstance 造（不跑构造函数，不要世界）；setupAnim 读到的字段由命令逐个设，AnimationState 这类空字段按无参构造补上。
// 命令从标准输入一行一条，浮点一律按 float 位（十六进制）传、按位打出来，免得十进制来回丢位。
// 放在包里：原版客户端 jar 签了名，混淆类都在无名包，同包的未签名类会被 JVM 拒绝。
package mcanim;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class RealPose {
    static Object model;
    static Object entity;
    static Object root;
    static Object state;
    static String childrenField;
    static String resetPose;
    static String[] poseFields;
    static PrintStream out;

    public static void main(String[] args) throws Throwable {
        try {
            run();
        } catch (Throwable e) {
            Throwable c = e instanceof java.lang.reflect.InvocationTargetException ? e.getCause() : e;
            c.printStackTrace(out);
            out.println("ERR " + c);
            System.exit(1);
        }
    }

    static void run() throws Throwable {
        out = new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), true, "UTF-8");
        System.setOut(new PrintStream(new java.io.OutputStream() { public void write(int b) {} })); // 游戏的日志别混进结果
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        String line;
        while ((line = in.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty()) continue;
            String[] t = line.split(" ");
            switch (t[0]) {
                case "boot" -> { // boot <SharedConstants> <tryDetectVersion> <Bootstrap> <bootStrap>
                    call(Class.forName(t[1]), null, t[2], "()V");
                    call(Class.forName(t[3]), null, t[4], "()V");
                }
                case "model" -> { // model <模型类> <createBodyLayer> <描述符> <LayerDefinition.bakeRoot> <描述符> [<所属类>:<静态字段>]（层定义方法的参数，如 1.21 的 CubeDeformation.NONE）
                    Class<?> mc = Class.forName(t[1]);
                    Object def = t.length > 6 ? find(mc, t[2], t[3]).invoke(null, field(t[6]).get(null)) : find(mc, t[2], t[3]).invoke(null);
                    root = call(def.getClass(), def, t[4], t[5]);
                    Constructor<?> ctor = null;
                    for (Constructor<?> c : mc.getDeclaredConstructors())
                        if (c.getParameterCount() == 1 && c.getParameterTypes()[0].isInstance(root)) ctor = c;
                    ctor.setAccessible(true);
                    model = ctor.newInstance(root);
                }
                case "part" -> { // part <ModelPart.children> <resetPose> <x y z xRot yRot zRot xScale yScale zScale visible>
                    childrenField = t[1];
                    resetPose = t[2];
                    poseFields = java.util.Arrays.copyOfRange(t, 3, 13);
                }
                case "entity" -> entity = unsafe().allocateInstance(Class.forName(t[1]));
                case "setf" -> setPath(t[1], t[2], t[3]);
                case "newe" -> { // newe <路径>：字段 = new 字段类型(实体)（SynchedEntityData 这类）
                    Field f = field(t[1]);
                    for (Constructor<?> c : f.getType().getDeclaredConstructors()) {
                        if (c.getParameterCount() == 1 && c.getParameterTypes()[0].isInstance(entity)) {
                            c.setAccessible(true);
                            put(entity, f, c.newInstance(entity));
                        }
                    }
                }
                case "setlist" -> { // setlist <路径> <n>：字段 = n 个实体自己的 ImmutableList（乘客表这类，只看空不空）
                    Field f = field(t[1]);
                    put(entity, f, com.google.common.collect.ImmutableList.copyOf(java.util.Collections.nCopies(Integer.parseInt(t[2]), entity)));
                }
                case "call" -> { // call <方法名> <描述符> <参数…>：在实体上调（defineSynchedData、setFlag 这类）
                    Method m = find(entity.getClass(), t[1], t[2]);
                    m.invoke(entity, parseArgs(m, t, 3));
                }
                case "state" -> state = construct(Class.forName(t[1])); // 1.21.2 起的渲染状态：无参构造
                case "sets" -> { // sets <所属类>:<字段> <值>：设渲染状态的字段（float 给位）
                    Field f = field(t[1]);
                    f.set(state, parse(f.getType(), t[2]));
                }
                case "setups" -> find(model.getClass(), t[1], t[2]).invoke(model, state); // setups <方法名> <描述符>：model.setupAnim(state)
                case "reset" -> reset(root);
                case "query" -> { // query <方法名> <描述符> <参数…>：在实体上调，打出返回值
                    Method m = find(entity.getClass(), t[1], t[2]);
                    Object r = m.invoke(entity, parseArgs(m, t, 3));
                    out.println("Q " + show(r));
                }
                case "setup", "prepare" -> { // setup|prepare <方法名> <描述符> <5|3 个 float 位>：在模型上调 setupAnim / prepareMobModel(实体, …)
                    Method m = find(model.getClass(), t[1], t[2]);
                    Object[] a = new Object[t.length - 2];
                    a[0] = entity;
                    for (int i = 1; i < a.length; i++) a[i] = Float.intBitsToFloat((int) Long.parseLong(t[2 + i], 16));
                    m.invoke(model, a);
                }
                case "dump" -> {
                    StringBuilder sb = new StringBuilder();
                    dump(root, "root", sb);
                    out.print(sb);
                    out.println("END");
                }
                case "tree" -> { // 部件树：名字 父名字
                    StringBuilder sb = new StringBuilder();
                    tree(root, "root", "-", sb);
                    out.print(sb);
                    out.println("END");
                }
                default -> throw new IllegalArgumentException(line);
            }
        }
    }

    static Object construct(Class<?> c) throws Exception {
        Constructor<?> k = c.getDeclaredConstructor();
        k.setAccessible(true);
        return k.newInstance();
    }

    static sun.misc.Unsafe unsafe() throws Exception {
        Field f = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
        f.setAccessible(true);
        return (sun.misc.Unsafe) f.get(null);
    }

    static String desc(Class<?> c) {
        if (c.isArray()) return c.getName().replace('.', '/');
        if (c == int.class) return "I";
        if (c == float.class) return "F";
        if (c == double.class) return "D";
        if (c == long.class) return "J";
        if (c == boolean.class) return "Z";
        if (c == byte.class) return "B";
        if (c == short.class) return "S";
        if (c == char.class) return "C";
        if (c == void.class) return "V";
        return "L" + c.getName().replace('.', '/') + ";";
    }

    static Method find(Class<?> c, String name, String d) {
        for (Class<?> k = c; k != null; k = k.getSuperclass()) {
            for (Method m : k.getDeclaredMethods()) {
                if (!m.getName().equals(name)) continue;
                StringBuilder sb = new StringBuilder("(");
                for (Class<?> p : m.getParameterTypes()) sb.append(desc(p));
                sb.append(")").append(desc(m.getReturnType()));
                if (d == null || sb.toString().equals(d)) {
                    m.setAccessible(true);
                    return m;
                }
            }
        }
        throw new IllegalArgumentException("找不到方法 " + c.getName() + "." + name + d);
    }

    static Object call(Class<?> c, Object recv, String name, String d) throws Exception {
        return find(c, name, d).invoke(recv);
    }

    static Object[] parseArgs(Method m, String[] t, int from) {
        Class<?>[] ps = m.getParameterTypes();
        Object[] a = new Object[ps.length];
        for (int i = 0; i < ps.length; i++) a[i] = parse(ps[i], t[from + i]);
        return a;
    }

    static Object parse(Class<?> c, String v) {
        if (c == float.class) return Float.intBitsToFloat((int) Long.parseLong(v, 16));
        if (c == double.class) return Double.longBitsToDouble(Long.parseUnsignedLong(v, 16));
        if (c == int.class) return Integer.parseInt(v);
        if (c == long.class) return Long.parseLong(v);
        if (c == boolean.class) return !v.equals("0");
        if (c == byte.class) return Byte.parseByte(v);
        if (c == short.class) return Short.parseShort(v);
        throw new IllegalArgumentException("不认识的类型 " + c);
    }

    static String show(Object r) {
        if (r instanceof Float f) return Integer.toHexString(Float.floatToRawIntBits(f));
        if (r instanceof Double d) return Long.toHexString(Double.doubleToRawLongBits(d));
        if (r instanceof Boolean b) return b ? "1" : "0";
        return String.valueOf(r);
    }

    // 路径段写成 <所属类>:<字段>，用 / 隔开，从实体出发；中间是 null 的按无参构造补
    static void setPath(String path, String type, String v) throws Exception {
        String[] segs = path.split("/");
        Object o = entity;
        for (int i = 0; i < segs.length; i++) {
            String[] cf = segs[i].split(":");
            Field f = Class.forName(cf[0]).getDeclaredField(cf[1]);
            f.setAccessible(true);
            if (i == segs.length - 1) {
                if (Modifier.isFinal(f.getModifiers())) throw new IllegalArgumentException("final 字段 " + segs[i]);
                f.set(o, parse(f.getType(), v));
                return;
            }
            Object next = f.get(o);
            if (next == null) {
                Constructor<?> c = f.getType().getDeclaredConstructor();
                c.setAccessible(true);
                next = c.newInstance();
                put(o, f, next);
            }
            o = next;
        }
    }

    // 只给实体自己的字段用：<所属类>:<字段>
    static Field field(String seg) throws Exception {
        String[] cf = seg.split(":");
        Field f = Class.forName(cf[0]).getDeclaredField(cf[1]);
        f.setAccessible(true);
        return f;
    }

    static void put(Object o, Field f, Object v) throws Exception {
        if (Modifier.isFinal(f.getModifiers())) unsafePut(o, f, v);
        else f.set(o, v);
    }

    static void unsafePut(Object o, Field f, Object v) throws Exception {
        sun.misc.Unsafe u = unsafe();
        u.putObject(o, u.objectFieldOffset(f), v);
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> children(Object part) throws Exception {
        Field f = part.getClass().getDeclaredField(childrenField);
        f.setAccessible(true);
        return (Map<String, Object>) f.get(part);
    }

    static void reset(Object part) throws Exception {
        call(part.getClass(), part, resetPose, "()V");
        for (Object c : children(part).values()) reset(c);
    }

    static void dump(Object part, String name, StringBuilder sb) throws Exception {
        sb.append("P ").append(name);
        for (String pf : poseFields) {
            Field f = part.getClass().getDeclaredField(pf);
            f.setAccessible(true);
            Object v = f.get(part);
            sb.append(' ').append(show(v));
        }
        sb.append('\n');
        List<String> names = new ArrayList<>(children(part).keySet());
        java.util.Collections.sort(names);
        for (String n : names) dump(children(part).get(n), n, sb);
    }

    static void tree(Object part, String name, String parent, StringBuilder sb) throws Exception {
        sb.append("T ").append(name).append(' ').append(parent).append('\n');
        List<String> names = new ArrayList<>(children(part).keySet());
        java.util.Collections.sort(names);
        for (String n : names) tree(children(part).get(n), n, name, sb);
    }
}
