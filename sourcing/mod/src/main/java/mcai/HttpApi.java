package mcai;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.logging.LogUtils;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.slf4j.Logger;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Executors;
import java.util.concurrent.locks.ReentrantLock;

import net.minecraftforge.fml.loading.FMLPaths;

/**
 * 本机 HTTP 接口：POST /动作名，请求体 {"args": {...}, "cwd": "调用方工作目录"}，
 * 返回 {"ok": true, "result": ...} 或 {"ok": false, "error": "..."}。
 */
public final class HttpApi {
    /** 默认端口。实例的 config/mcai.port 里写了别的数就用那个：多个 Agent 各开一个实例同时取材时，每个实例一个端口（mcai game newinstance 分配）。 */
    public static final int DEFAULT_PORT = 25590;
    public static volatile int port = DEFAULT_PORT;
    /**
     * 同一个游戏只有一个镜头、一个世界：会动镜头、改世界、截图的动作一次只放一个进来，先到先做。
     * batch 整个算一个动作，所以几个 Agent 共用一个实例时，把 cam 和 shoot 写进同一个 batch 就不会被别人的 cam 插进来。
     */
    private static final ReentrantLock EXCLUSIVE = new ReentrantLock(true);
    private static final Logger LOG = LogUtils.getLogger();
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();

    private HttpApi() {
    }

    public static void start() {
        Path portFile = FMLPaths.CONFIGDIR.get().resolve("mcai.port");
        try {
            if (Files.isRegularFile(portFile)) port = Integer.parseInt(Files.readString(portFile).trim());
        } catch (IOException | NumberFormatException e) {
            LOG.error("[mcai] {} 读不出端口号，用默认的 {}", portFile, DEFAULT_PORT, e);
        }
        try {
            // 只绑回环地址：接口能以最高权限执行任意命令，不能暴露给局域网
            HttpServer http = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
            http.createContext("/", HttpApi::handle);
            // 每个请求一个线程：shoot 会等上几秒，不能堵住同时发来的 state
            http.setExecutor(Executors.newCachedThreadPool(r -> {
                Thread t = new Thread(r, "mcai-http");
                t.setDaemon(true);
                return t;
            }));
            http.start();
            LOG.info("[mcai] HTTP 接口已监听 127.0.0.1:{}", port);
        } catch (IOException e) {
            LOG.error("[mcai] HTTP 接口启动失败（端口 {} 被占用？）", port, e);
        }
    }

    private static void handle(HttpExchange exchange) throws IOException {
        IdleQuit.begin();
        try {
            respond(exchange);
        } finally {
            IdleQuit.end();
        }
    }

    private static void respond(HttpExchange exchange) throws IOException {
        JsonObject reply = new JsonObject();
        String name = exchange.getRequestURI().getPath().substring(1);
        try {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            JsonObject request = body.isBlank() ? new JsonObject() : JsonParser.parseString(body).getAsJsonObject();
            JsonObject args = request.has("args") ? request.getAsJsonObject("args") : new JsonObject();
            String cwd = request.has("cwd") ? request.get("cwd").getAsString() : null;
            boolean exclusive = Actions.exclusive(name);
            if (exclusive) EXCLUSIVE.lock();
            try {
                reply.add("result", Actions.call(name, new Args(args, cwd)));
            } finally {
                if (exclusive) EXCLUSIVE.unlock();
            }
            reply.addProperty("ok", true);
        } catch (ActionException e) {
            reply.addProperty("ok", false);
            reply.addProperty("error", e.getMessage());
        } catch (Exception e) {
            LOG.error("[mcai] 动作 {} 出错", name, e);
            reply.addProperty("ok", false);
            reply.addProperty("error", e.toString());
        }
        byte[] bytes = GSON.toJson(reply).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
