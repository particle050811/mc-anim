package mcai.record;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.VertexConsumer;
import mcai.mixin.AbstractSoundInstanceAccessor;
import mcai.mixin.MinecraftInvoker;
import mcai.mixin.ParticleAccessor;
import mcai.mixin.SingleQuadParticleAccessor;
import mcai.mixin.TextureSheetParticleAccessor;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.client.event.sound.PlaySoundEvent;
import net.minecraftforge.client.event.sound.PlaySoundSourceEvent;
import net.minecraftforge.client.event.sound.PlayStreamingSourceEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.Event;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import org.slf4j.Logger;
import com.mojang.logging.LogUtils;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 录制（record 动作）：从开始到停，逐刻记下客户端看到的粒子、实体、声音，给画面里回放（docs/决策/0016-法术录制.md）。
 * 只在客户端线程上读写（粒子引擎、声音引擎、客户端刻都在这个线程）；服务端那边只有两样：实体首次出现时取一份存档 NBT、模组法术事件打点。
 *
 * 钟：「刻号」= 已经记完的客户端刻数。客户端刻开头处理服务端发来的包（runAllTasks），然后 tick()；
 * 两刻之间发生的事（包里撒的粒子、放的声音）都记成下一个要记的刻号，刻末（ClientTickEvent END）记一次全部活着的粒子和实体，刻号 +1。
 * 粒子在刻号 s 出生，第 s 刻末的快照就是它刚构造完的样子（引擎把新粒子攒到刻末才收进去，出生那刻不 tick）。
 * 游戏画第 k 刻和 k+1 刻之间时，位置是 (第 k−1 刻快照, 第 k 刻快照) 按分刻插值，回放照这个来。
 */
public final class Recorder {
    private static final Logger LOG = LogUtils.getLogger();

    /** 一刻一行的粒子快照：x, y, z, 画的半边长 getQuadSize(0), r, g, b, a, roll, 贴图序号（-1 = 不是贴图粒子） */
    private static final class PRec {
        int idx;
        String type;
        String options;
        String cls;
        String renderType;
        boolean selfDrawn;
        int born;
        int died = -1;
        double[] raw; // createParticle 收到的位置和速度；没走 createParticle 的为 null
        JsonObject init;
        final List<double[]> track = new ArrayList<>();
        /** 改写了 render 的：每刻替它画一遍（分刻 0）接到的顶点。只有一个方片的照方片记（drawnQuads 计数），别的整份记下 */
        int drawnQuads;
        final List<double[]> mesh = new ArrayList<>();
    }

    private static final class ERec {
        UUID uuid;
        int id;
        String type;
        String cls;
        int born;
        int died = -1;
        float bbW, bbH;
        volatile String nbt;
        final List<double[]> track = new ArrayList<>();
    }

    public static final class Params {
        public double radius = 32;
        public Vec3 target;
        public int pre = 5;
        public boolean use;
        public int hold = -1;
        public String note;
    }

    private static volatile boolean active;
    private static volatile int tick;
    private static Params params;
    private static Vec3 origin;
    private static Vec3 eye;
    private static float yaw, pitch;
    private static long startGameTime;
    private static final List<PRec> particles = new ArrayList<>();
    private static final IdentityHashMap<Particle, PRec> live = new IdentityHashMap<>();
    private static final Map<UUID, ERec> entities = new LinkedHashMap<>();
    private static final List<JsonObject> sounds = new ArrayList<>();
    private static final IdentityHashMap<SoundInstance, JsonObject> soundOf = new IdentityHashMap<>();
    private static final ConcurrentLinkedQueue<JsonObject> markers = new ConcurrentLinkedQueue<>();
    private static final List<double[]> casterTrack = new ArrayList<>();
    private static final List<String> sprites = new ArrayList<>();
    private static final Map<String, Integer> spriteIndex = new LinkedHashMap<>();
    private static final Map<Class<?>, Boolean> selfDrawnCache = new ConcurrentHashMap<>();
    private static final Map<String, Integer> droppedOutside = new LinkedHashMap<>();

    // createParticle 开头记下的类型和参数，add 时用；createParticle 里面又造粒子（极少）时按层数配对
    private static ParticleOptions pendingOptions;
    private static double[] pendingRaw;
    private static int createDepth;

    // 右键：useAt 刻号时按一下；之后按住到 holdUntil（不含）或者玩家不再「正在使用」
    private static int useAt = -1;
    private static int holdUntil = -1;
    private static int usedAt = -1;

    private static boolean registered;

    private Recorder() {
    }

    /** 模组事件（诡厄的施法事件）要按类名反射挂上，没装诡厄就不挂；只挂一次 */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private static void registerOnce() {
        if (registered) return;
        registered = true;
        MinecraftForge.EVENT_BUS.register(Recorder.class);
        String[] goety = {
                "com.Polarice3.Goety.common.events.spell.StartMagicEvent",
                "com.Polarice3.Goety.common.events.spell.CastMagicEvent",
                "com.Polarice3.Goety.common.events.spell.StopMagicEvent",
        };
        for (String name : goety) {
            try {
                Class cls = Class.forName(name);
                MinecraftForge.EVENT_BUS.addListener(EventPriority.LOWEST, true, cls, (java.util.function.Consumer<Event>) e -> onModEvent(name, e));
            } catch (ClassNotFoundException ignored) {
            } catch (Throwable t) {
                LOG.warn("mcai 录制：挂 {} 失败", name, t);
            }
        }
    }

    // ---- 开始、停 ----

    /** 客户端线程上调：以当前玩家（施法者）的位置和朝向为准，清空上一次的记录 */
    public static JsonObject start(Params p) {
        registerOnce();
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) throw new mcai.ActionException("还没进入世界");
        params = p;
        particles.clear();
        live.clear();
        entities.clear();
        synchronized (sounds) {
            sounds.clear();
            soundOf.clear();
        }
        markers.clear();
        casterTrack.clear();
        sprites.clear();
        spriteIndex.clear();
        droppedOutside.clear();
        pendingOptions = null;
        pendingRaw = null;
        createDepth = 0;
        origin = mc.player.position();
        eye = mc.player.getEyePosition();
        yaw = mc.player.getYRot();
        pitch = mc.player.getXRot();
        startGameTime = mc.level.getGameTime();
        tick = 0;
        useAt = p.use ? p.pre : -1;
        holdUntil = -1;
        usedAt = -1;
        active = true;
        JsonObject o = new JsonObject();
        o.add("施法者脚", vec(origin));
        return o;
    }

    /** 停止记新东西（stop 之前，等服务端异步的活做完） */
    public static void pause() {
        active = false;
    }

    public static int tick() {
        return tick;
    }

    public static boolean active() {
        return active;
    }

    /** 客户端线程上调：停下，整理成一份 JSON（格式见 docs/决策/0016-法术录制.md「原始录制」） */
    public static JsonObject stop() {
        active = false;
        Minecraft mc = Minecraft.getInstance();
        if (holdUntil >= 0) mc.options.keyUse.setDown(false);
        for (PRec r : live.values()) if (r.died < 0) r.died = tick;
        live.clear();
        JsonObject o = new JsonObject();
        o.addProperty("格式", "mcai-录制-原始/1");
        o.addProperty("刻数", tick);
        o.addProperty("开始游戏时间", startGameTime);
        if (params.note != null) o.addProperty("说明", params.note);
        JsonObject caster = new JsonObject();
        caster.add("脚", vec(origin));
        caster.add("眼", vec(eye));
        caster.addProperty("yaw", yaw);
        caster.addProperty("pitch", pitch);
        caster.add("轨", rows(casterTrack));
        o.add("施法者", caster);
        if (params.target != null) o.add("目标", vec(params.target));
        o.addProperty("半径", params.radius);
        o.addProperty("按下刻", usedAt);
        o.addProperty("粒子设置", mc.options.particles().get().name());
        JsonArray sp = new JsonArray();
        sprites.forEach(sp::add);
        o.add("贴图名", sp);
        JsonArray ps = new JsonArray();
        for (PRec r : particles) {
            JsonObject j = new JsonObject();
            j.addProperty("号", r.idx);
            j.addProperty("类型", r.type);
            if (r.options != null) j.addProperty("参数", r.options);
            j.addProperty("类", r.cls);
            j.addProperty("画法", r.renderType);
            j.addProperty("自画网格", r.selfDrawn);
            j.addProperty("生", r.born);
            j.addProperty("灭", r.died);
            if (r.raw != null) {
                j.add("造位", arr(r.raw[0], r.raw[1], r.raw[2]));
                j.add("造速", arr(r.raw[3], r.raw[4], r.raw[5]));
            }
            j.add("实例", r.init);
            j.add("轨", rows(r.track));
            if (r.drawnQuads > 0) j.addProperty("改写render仍是方片", r.drawnQuads);
            if (!r.mesh.isEmpty()) j.add("网格轨", rows(r.mesh));
            ps.add(j);
        }
        o.add("粒子", ps);
        JsonArray es = new JsonArray();
        for (ERec r : entities.values()) {
            JsonObject j = new JsonObject();
            j.addProperty("uuid", r.uuid.toString());
            j.addProperty("类型", r.type);
            j.addProperty("类", r.cls);
            j.addProperty("生", r.born);
            j.addProperty("灭", r.died);
            j.addProperty("宽", r.bbW);
            j.addProperty("高", r.bbH);
            if (r.nbt != null) j.addProperty("nbt", r.nbt);
            j.add("轨", rows(r.track));
            es.add(j);
        }
        o.add("实体", es);
        JsonArray ss = new JsonArray();
        synchronized (sounds) {
            sounds.forEach(ss::add);
        }
        o.add("声音", ss);
        JsonArray ms = new JsonArray();
        markers.forEach(ms::add);
        o.add("事件", ms);
        JsonObject drop = new JsonObject();
        droppedOutside.forEach(drop::addProperty);
        o.add("半径外没记的粒子", drop);
        return o;
    }

    // ---- 粒子 ----

    public static void beforeCreate(ParticleOptions options, double x, double y, double z, double xd, double yd, double zd) {
        if (!active) return;
        if (createDepth++ == 0) {
            pendingOptions = options;
            pendingRaw = new double[]{x, y, z, xd, yd, zd};
        }
    }

    public static void afterCreate() {
        if (!active) return;
        if (createDepth > 0 && --createDepth == 0) {
            pendingOptions = null;
            pendingRaw = null;
        }
    }

    public static void onAdd(Particle p) {
        if (!active || live.containsKey(p)) return;
        ParticleAccessor a = (ParticleAccessor) p;
        ParticleOptions opt = createDepth > 0 ? pendingOptions : null;
        String type = opt == null ? "?" : String.valueOf(BuiltInRegistries.PARTICLE_TYPE.getKey(opt.getType()));
        double dx = a.mcai$getX() - origin.x, dy = a.mcai$getY() - origin.y, dz = a.mcai$getZ() - origin.z;
        if (dx * dx + dy * dy + dz * dz > params.radius * params.radius) {
            droppedOutside.merge(type, 1, Integer::sum);
            return;
        }
        PRec r = new PRec();
        r.idx = particles.size();
        r.type = type;
        if (opt != null) {
            try {
                r.options = opt.writeToString();
            } catch (Throwable t) {
                r.options = "（writeToString 出错：" + t + "）";
            }
            r.raw = pendingRaw;
        }
        r.cls = p.getClass().getName();
        r.renderType = renderTypeName(p.getRenderType());
        r.selfDrawn = selfDrawn(p.getClass());
        r.born = tick;
        JsonObject init = new JsonObject();
        init.add("位", arr(a.mcai$getX(), a.mcai$getY(), a.mcai$getZ()));
        init.add("速", arr(a.mcai$getXd(), a.mcai$getYd(), a.mcai$getZd()));
        init.addProperty("寿命", p.getLifetime());
        init.addProperty("年龄", a.mcai$getAge());
        init.addProperty("重力", a.mcai$getGravity());
        init.addProperty("摩擦", a.mcai$getFriction());
        init.addProperty("碰撞", a.mcai$getHasPhysics());
        init.addProperty("竖直受阻加速", a.mcai$getSpeedUp());
        init.add("色", arr(a.mcai$getR(), a.mcai$getG(), a.mcai$getB(), a.mcai$getAlpha()));
        init.addProperty("转角", a.mcai$getRoll());
        init.add("碰撞盒", arr(a.mcai$getBbWidth(), a.mcai$getBbHeight()));
        if (p instanceof SingleQuadParticle) init.addProperty("半边长", ((SingleQuadParticleAccessor) p).mcai$getQuadSize());
        r.init = init;
        particles.add(r);
        live.put(p, r);
    }

    private static String renderTypeName(ParticleRenderType t) {
        if (t == ParticleRenderType.PARTICLE_SHEET_OPAQUE) return "PARTICLE_SHEET_OPAQUE";
        if (t == ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT) return "PARTICLE_SHEET_TRANSLUCENT";
        if (t == ParticleRenderType.PARTICLE_SHEET_LIT) return "PARTICLE_SHEET_LIT";
        if (t == ParticleRenderType.TERRAIN_SHEET) return "TERRAIN_SHEET";
        if (t == ParticleRenderType.CUSTOM) return "CUSTOM";
        if (t == ParticleRenderType.NO_RENDER) return "NO_RENDER";
        return t + "（" + t.getClass().getName() + "）";
    }

    /** 自己画网格：不是方片粒子，或者方片粒子的子类自己重写了 render(VertexConsumer, Camera, float)（按参数类型认，运行时方法名是 SRG） */
    private static boolean selfDrawn(Class<?> c) {
        return selfDrawnCache.computeIfAbsent(c, k -> {
            if (!SingleQuadParticle.class.isAssignableFrom(k)) return true;
            for (Class<?> x = k; x != null && x != SingleQuadParticle.class && x != TextureSheetParticle.class; x = x.getSuperclass()) {
                for (Method m : x.getDeclaredMethods()) {
                    Class<?>[] ps = m.getParameterTypes();
                    if (ps.length == 3 && ps[0] == VertexConsumer.class && ps[1] == Camera.class && ps[2] == float.class) return true;
                }
            }
            return false;
        });
    }

    private static int sprite(Particle p) {
        if (!(p instanceof TextureSheetParticle)) return -1;
        TextureAtlasSprite s = ((TextureSheetParticleAccessor) p).mcai$getSprite();
        if (s == null) return -1;
        String name = s.contents().name().toString();
        Integer i = spriteIndex.get(name);
        if (i == null) {
            i = sprites.size();
            sprites.add(name);
            spriteIndex.put(name, i);
        }
        return i;
    }

    // ---- 声音 ----
    // PlaySoundEvent 在客户端线程、SoundEngine.play 开头发，刻号准，但还没选变体；
    // PlaySoundSourceEvent 在声音线程上、真开始放时发，这时才知道放的是哪个文件，按实例配回去补上。

    @SubscribeEvent
    public static void onPlay(PlaySoundEvent e) {
        SoundInstance s = e.getSound();
        if (!active || s == null) return;
        JsonObject j = new JsonObject();
        j.addProperty("刻", tick);
        j.addProperty("事件", String.valueOf(s.getLocation()));
        j.addProperty("类别", s.getSource().getName());
        j.add("位", arr(s.getX(), s.getY(), s.getZ()));
        j.addProperty("相对", s.isRelative());
        if (s instanceof AbstractSoundInstanceAccessor a) {
            j.addProperty("音量", a.mcai$getVolume());
            j.addProperty("音高", a.mcai$getPitch());
        }
        if (s.isLooping()) j.addProperty("循环", true);
        if (s.getDelay() > 0) j.addProperty("延迟", s.getDelay());
        synchronized (sounds) {
            sounds.add(j);
            soundOf.put(s, j);
        }
    }

    @SubscribeEvent
    public static void onSource(PlaySoundSourceEvent e) {
        played(e.getSound(), false);
    }

    @SubscribeEvent
    public static void onStream(PlayStreamingSourceEvent e) {
        played(e.getSound(), true);
    }

    private static void played(SoundInstance s, boolean stream) {
        if (s == null) return;
        synchronized (sounds) {
            JsonObject j = soundOf.remove(s);
            if (j == null) return;
            if (s.getSound() != null) j.addProperty("文件", String.valueOf(s.getSound().getLocation()));
            j.addProperty("实际音量", s.getVolume());
            j.addProperty("实际音高", s.getPitch());
            if (stream) j.addProperty("流", true);
        }
    }

    // ---- 模组事件（服务端线程） ----

    private static void onModEvent(String name, Event e) {
        if (!active) return;
        JsonObject j = new JsonObject();
        j.addProperty("刻", tick);
        j.addProperty("名", name.substring(name.lastIndexOf('.') + 1));
        try {
            Object spell = e.getClass().getMethod("getSpell").invoke(e);
            if (spell != null) j.addProperty("法术", spell.getClass().getName());
        } catch (Throwable ignored) {
        }
        if (e instanceof net.minecraftforge.event.entity.living.LivingEvent le && le.getEntity() != null) {
            j.addProperty("施法者", le.getEntity().getStringUUID());
            j.addProperty("服务端", !le.getEntity().level().isClientSide());
        }
        markers.add(j);
    }

    // ---- 每刻 ----

    @SubscribeEvent
    public static void onClientTick(TickEvent.ClientTickEvent e) {
        if (!active) return;
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;
        if (e.phase == TickEvent.Phase.START) {
            if (tick == useAt) {
                ((MinecraftInvoker) mc).mcai$startUseItem();
                usedAt = tick;
                int hold = params.hold < 0 ? Integer.MAX_VALUE / 2 : params.hold;
                holdUntil = hold > 0 ? tick + hold : -1;
                if (holdUntil >= 0) mc.options.keyUse.setDown(true);
            } else if (holdUntil >= 0) {
                // 按住：蓄力、引导的法术是服务端开始「使用」再同步给本机玩家，晚一两刻；过了 3 刻还不在使用中（瞬发的）就松开，
                // 赶在右键 4 刻后自动再按一次之前
                if (tick >= holdUntil || (tick >= usedAt + 3 && !mc.player.isUsingItem())) {
                    mc.options.keyUse.setDown(false);
                    holdUntil = -1;
                } else {
                    mc.options.keyUse.setDown(true);
                }
            }
            return;
        }
        snapshot(mc);
        tick++;
    }

    private static void snapshot(Minecraft mc) {
        for (Iterator<Map.Entry<Particle, PRec>> it = live.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<Particle, PRec> en = it.next();
            Particle p = en.getKey();
            PRec r = en.getValue();
            if (!p.isAlive()) {
                r.died = tick;
                it.remove();
                continue;
            }
            ParticleAccessor a = (ParticleAccessor) p;
            double size = p instanceof SingleQuadParticle q ? q.getQuadSize(0f) : 0;
            double[] row = {a.mcai$getX(), a.mcai$getY(), a.mcai$getZ(), size, a.mcai$getR(), a.mcai$getG(), a.mcai$getB(), a.mcai$getAlpha(), a.mcai$getRoll(), sprite(p)};
            if (r.selfDrawn) drawn(p, r, row);
            r.track.add(row);
        }
        casterTrack.add(pose(mc.player));
        java.util.Set<UUID> seen = new java.util.HashSet<>();
        for (Entity en : mc.level.entitiesForRendering()) {
            if (en == mc.player) continue;
            if (en.position().distanceToSqr(origin) > params.radius * params.radius) continue;
            UUID id = en.getUUID();
            seen.add(id);
            ERec r = entities.get(id);
            if (r == null || r.died >= 0) {
                if (r != null) continue; // 出了半径又回来的：只记第一段
                r = new ERec();
                r.uuid = id;
                r.id = en.getId();
                r.type = String.valueOf(BuiltInRegistries.ENTITY_TYPE.getKey(en.getType()));
                r.cls = en.getClass().getName();
                r.born = tick;
                r.bbW = en.getBbWidth();
                r.bbH = en.getBbHeight();
                entities.put(id, r);
                fetchNbt(r);
            }
            r.track.add(pose(en));
        }
        for (ERec r : entities.values()) if (r.died < 0 && !seen.contains(r.uuid)) r.died = tick;
    }

    private static final VertexCapture CAPTURE = new VertexCapture();

    /**
     * 改写了 render 的粒子（有的只是在里面改透明度再调父类，有的自己画环、球）：替它画一遍，顶点接到 VertexCapture。
     * 正好一个方片（4 个顶点）：半边长、颜色、透明度改用画出来的（render 里改的不一定写回字段），半边长按对角线量（转角不影响）；
     * 别的：这一刻的整份顶点（世界坐标、贴图格内的 uv、颜色）记进网格轨，一刻一行：刻号, 顶点数, 然后每个顶点 9 个数。
     * 分刻取 0：和快照里的位置一样是「上一刻到这一刻」区间的起点。
     */
    private static void drawn(Particle p, PRec r, double[] track) {
        Camera cam = Minecraft.getInstance().gameRenderer.getMainCamera();
        if (!cam.isInitialized()) return;
        CAPTURE.clear();
        try {
            p.render(CAPTURE, cam, 0f);
        } catch (Throwable t) {
            return;
        }
        List<float[]> v = CAPTURE.verts;
        if (v.size() == 4) {
            r.drawnQuads++;
            float[] a = v.get(0), c = v.get(2);
            double dx = a[0] - c[0], dy = a[1] - c[1], dz = a[2] - c[2];
            track[3] = Math.sqrt(dx * dx + dy * dy + dz * dz) / (2 * Math.sqrt(2));
            System.arraycopy(new double[]{a[5], a[6], a[7], a[8]}, 0, track, 4, 4);
            return;
        }
        Vec3 cp = cam.getPosition();
        TextureAtlasSprite s = p instanceof TextureSheetParticle ? ((TextureSheetParticleAccessor) p).mcai$getSprite() : null;
        double[] row = new double[2 + v.size() * 9];
        row[0] = tick;
        row[1] = v.size();
        for (int i = 0; i < v.size(); i++) {
            float[] x = v.get(i);
            int o = 2 + i * 9;
            row[o] = x[0] + cp.x;
            row[o + 1] = x[1] + cp.y;
            row[o + 2] = x[2] + cp.z;
            // uv 换成贴图格内的 0～1（图集坐标换了图集就不对）
            row[o + 3] = s == null ? x[3] : (x[3] - s.getU0()) / Math.max(1e-9, s.getU1() - s.getU0());
            row[o + 4] = s == null ? x[4] : (x[4] - s.getV0()) / Math.max(1e-9, s.getV1() - s.getV0());
            System.arraycopy(new double[]{x[5], x[6], x[7], x[8]}, 0, row, o + 5, 4);
        }
        r.mesh.add(row);
    }

    /** 一刻的位姿：x, y, z, yRot, xRot, 头 yRot, 身 yRot（不是生物的后两个照 yRot） */
    private static double[] pose(Entity en) {
        float head = en.getYHeadRot();
        float body = en instanceof LivingEntity le ? le.yBodyRot : en.getYRot();
        return new double[]{en.getX(), en.getY(), en.getZ(), en.getYRot(), en.getXRot(), head, body};
    }

    /** 实体首次出现：到服务端取一份存档 NBT（客户端实体缺很多字段）；单人世界才有 */
    private static void fetchNbt(ERec r) {
        var server = Minecraft.getInstance().getSingleplayerServer();
        if (server == null) return;
        server.execute(() -> {
            for (ServerLevel lv : server.getAllLevels()) {
                Entity se = lv.getEntity(r.uuid);
                if (se == null) continue;
                try {
                    r.nbt = se.saveWithoutId(new CompoundTag()).toString();
                } catch (Throwable t) {
                    r.nbt = "（存 NBT 出错：" + t + "）";
                }
                return;
            }
        });
    }

    // ---- 小工具 ----

    private static JsonArray vec(Vec3 v) {
        return arr(v.x, v.y, v.z);
    }

    private static JsonArray arr(double... xs) {
        JsonArray a = new JsonArray();
        for (double x : xs) a.add(round(x));
        return a;
    }

    private static JsonArray rows(List<double[]> rows) {
        JsonArray a = new JsonArray();
        for (double[] r : rows) a.add(arr(r));
        return a;
    }

    /** 6 位小数：位置到微米级，回放用不着更细；文件小一半 */
    static double round(double x) {
        if (Double.isNaN(x) || Double.isInfinite(x)) return 0;
        return Math.round(x * 1e6) / 1e6;
    }
}
