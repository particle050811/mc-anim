// 抖音创作者中心取数：在用户已登录的浏览器里跑（Playwright MCP 扩展模式 browser_run_code_unsafe 的 filename），
// 页面要先打开 creator.douyin.com。cookie 只由浏览器带（credentials:'include'），脚本不读、不存、不返回它；
// 只用作品详情页本来就发、不带签名的 janus 接口和 item/mget，只发 GET；请求间隔 ≥1.1 秒，HTTP 4xx 或 status_code 非 0 的风控码立刻停。
// 结果打包成 抖音-数据-<UTC 月日-时分>.json 经 a.download 存进浏览器的下载目录，再用 anim platform import 收进数据根。
// 接口和字段含义见同目录 数据.ts 的类型注释（留存 data_center analysis_type=1 是 3 秒一档的留存比例，7 是各档跳出）。
async (page) => {
  const pageVisibility = await page.evaluate(() => document.visibilityState);
  if (pageVisibility !== 'visible') return { 停: '标签页不可见（hidden），请把被控标签页单独放一个 Edge 窗口' };
  return await page.evaluate(async () => {
    const intervalMs = 1100;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let attempts = 0;
    const errors = [];
    class RiskControlError extends Error {}
    const commonQuery = 'aid=2906&app_name=aweme_creator_platform&device_platform=web';
    const fetchJson = async (url) => {
      if (attempts > 0) await sleep(intervalMs);
      attempts++;
      const r = await fetch(url, { credentials: 'include' });
      if (r.status === 403 || r.status === 429 || r.status === 412) throw new RiskControlError(`HTTP ${r.status}：${url.split('?')[0]}`);
      const t = await r.text();
      if (!t) throw new Error('空响应');
      return JSON.parse(t);
    };
    const tryFetch = async (fetchName, url) => {
      try {
        const j = await fetchJson(url);
        const code = j.status_code ?? j.BaseResp?.StatusCode ?? 0;
        if (code !== 0) {
          errors.push({ 名: fetchName, code, message: j.status_msg ?? j.BaseResp?.StatusMessage });
          if (/频繁|验证|风控|risk|limit/i.test(String(j.status_msg ?? ''))) throw new RiskControlError(`${fetchName}：${j.status_msg}`);
          return null;
        }
        return j;
      } catch (e) {
        if (e instanceof RiskControlError) throw e;
        errors.push({ 名: fetchName, message: String(e) });
        return null;
      }
    };
    const J = 'https://creator.douyin.com/janus/douyin/creator';
    const rawPack = { 版本: 1, 平台: '抖音', 取于: new Date().toISOString(), 作品: [], 错误: errors, 请求数: 0, 停于风控: null };
    try {
      const items = [];
      let cursor = 0;
      for (let pageNo = 0; pageNo < 10; pageNo++) {
        const d = await tryFetch('作品列表', `${J}/pc/work_list?status=0&count=20&max_cursor=${cursor}&scene=star_atlas&${commonQuery}`);
        items.push(...(d?.aweme_list ?? []));
        if (!d?.has_more) break;
        cursor = d.max_cursor;
      }
      // 只取视频（图文没有播放进度）
      for (const a of items.filter((x) => x.duration > 0)) {
        const id = a.aweme_id;
        const work = { id, 标题: a.desc, 时长毫秒: a.duration, 发布: a.create_time, 统计: a.statistics };
        const m = await tryFetch(`指标 ${id}`, `https://creator.douyin.com/web/api/creator/item/mget?ids=${id}&fields=metrics`);
        work.指标 = m?.items?.[0]?.metrics ?? null;
        const fetchTrend = async (keyword, type) => {
          const d = await tryFetch(`${keyword} ${id}`, `${J}/data/realtime/analysis/data_center?user_id=&item_id=${id}&analysis_type=${type}&${commonQuery}`);
          return d ? { 本作: d.analysis_trend?.current_item ?? [], 同类作者: d.analysis_trend?.similar_author ?? [] } : null;
        };
        work.留存 = await fetchTrend('留存', 1);
        work.跳出 = await fetchTrend('跳出', 7);
        const p = await tryFetch(`进度 ${id}`, `${J}/bff/data/progress/analysis/v2?item_id=${id}&${commonQuery}`);
        work.进度 = p ? { 跳过: p.jump_forward ?? [], 回看: p.jump_backward ?? [] } : null; // video_data 里是带签名的播放地址，不留
        const s = await tryFetch(`来源 ${id}`, `${J}/data/item/play/source?item_id=${id}&${commonQuery}`);
        work.来源 = s?.play_source ?? null;
        const k = await tryFetch(`搜索词 ${id}`, `${J}/data/item_analysis/search/keyword?id=${id}&${commonQuery}`);
        work.搜索词 = k ? { 看后搜: k.inspire_search ?? [], 搜到: k.show_from ?? [] } : null;
        const b = await tryFetch(`弹幕 ${id}`, `${J}/bff/data/bullet/analysis/v2?item_id=${id}&${commonQuery}`);
        work.弹幕 = b?.current_item ?? null;
        rawPack.作品.push(work);
      }
    } catch (e) {
      rawPack.停于风控 = String(e.message ?? e);
    }
    rawPack.请求数 = attempts;
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const downloadName = `抖音-数据-${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}-${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}.json`;
    const blob = new Blob([JSON.stringify(rawPack)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return {
      downloadName,
      请求数: attempts,
      停于风控: rawPack.停于风控,
      错误: errors.slice(0, 20),
      作品: rawPack.作品.map((s) => ({ id: s.id, 标题: s.标题.slice(0, 20), 秒: s.时长毫秒 / 1000, retentionPointCount: s.留存?.本作.length ?? 0, hasMetrics: !!s.指标 })),
    };
  });
}
