package mcai;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.world.phys.Vec3;

import java.nio.file.Path;

/** 一次调用的参数。mcai 传来的值都是字符串，这里按需要解析。 */
public class Args {
    private final JsonObject json;
    /** 调用方（mcai）的工作目录，相对路径按它解析；游戏进程自己的工作目录是 .minecraft，不能用。 */
    private final String cwd;

    public Args(JsonObject json, String cwd) {
        this.json = json;
        this.cwd = cwd;
    }

    public boolean has(String name) {
        return json.has(name) && !json.get(name).isJsonNull();
    }

    public JsonElement raw(String name) {
        return json.get(name);
    }

    public String cwd() {
        return cwd;
    }

    public String str(String name) {
        if (!has(name)) throw new ActionException("缺少参数 " + name);
        return json.get(name).getAsString();
    }

    public String str(String name, String fallback) {
        return has(name) ? str(name) : fallback;
    }

    public double num(String name) {
        try {
            return Double.parseDouble(str(name));
        } catch (NumberFormatException e) {
            throw new ActionException("参数 " + name + " 要是数字，收到的是 " + str(name));
        }
    }

    public double num(String name, double fallback) {
        return has(name) ? num(name) : fallback;
    }

    /** "x,y,z" */
    public Vec3 vec(String name) {
        String[] parts = str(name).split(",");
        try {
            if (parts.length == 3) {
                return new Vec3(Double.parseDouble(parts[0].trim()), Double.parseDouble(parts[1].trim()), Double.parseDouble(parts[2].trim()));
            }
        } catch (NumberFormatException ignored) {
        }
        throw new ActionException("参数 " + name + " 要写成 x,y,z，收到的是 " + str(name));
    }

    public Path path(String name) {
        Path p = Path.of(str(name));
        if (p.isAbsolute()) return p;
        if (cwd == null) throw new ActionException("参数 " + name + " 是相对路径，但请求里没带 cwd");
        return Path.of(cwd).resolve(p).normalize();
    }
}
