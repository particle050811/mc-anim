// B 站创作中心取数：在用户已登录的浏览器里跑（Playwright MCP 扩展模式 browser_run_code_unsafe 的 filename），
// 页面要先打开 member.bilibili.com。cookie 只由浏览器带（credentials:'include'），脚本不读、不存、不返回它。
// 只发 GET、只取自己的稿件；请求间隔 ≥1.1 秒，遇到 -412/-352 或 HTTP 412 立刻停。
// 结果打包成 bili-数据-<UTC 月日-时分>.json 经 a.download 存进浏览器的下载目录，再用 anim platform import 收进数据根。
// 接口和字段含义见同目录 数据.ts 的类型注释（比率是万分制；留存曲线 viewer_quit 是 20 秒一档的留存万分比）。
async (page) => {
  const pageVisibility = await page.evaluate(() => document.visibilityState);
  if (pageVisibility !== 'visible') return { 停: '标签页不可见（hidden），请把被控标签页单独放一个 Edge 窗口' };
  return await page.evaluate(async () => {
    const intervalMs = 1100;
    const danmakuMaxPages = 30;
    const commentMaxPages = 20;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let attempts = 0;
    const errors = [];
    class RiskControlError extends Error {}
    const fetchJson = async (url) => {
      if (attempts > 0) await sleep(intervalMs);
      attempts++;
      const r = await fetch(url, { credentials: 'include' });
      if (r.status === 412) throw new RiskControlError(`HTTP 412：${url.split('?')[0]}`);
      const j = await r.json();
      if (j.code === -412 || j.code === -352) throw new RiskControlError(`code ${j.code}：${url.split('?')[0]}`);
      return j;
    };
    // 出错只记下、不中断；风控照样往外抛
    const tryFetch = async (fetchName, url) => {
      try {
        const j = await fetchJson(url);
        if (j.code !== 0) {
          errors.push({ name: fetchName, code: j.code, message: j.message });
          return null;
        }
        return j.data;
      } catch (e) {
        if (e instanceof RiskControlError) throw e;
        errors.push({ name: fetchName, message: String(e) });
        return null;
      }
    };
    const M = 'https://member.bilibili.com/x/web/data';
    const A = 'https://api.bilibili.com/x';
    const rawPack = { version: 1, fetchedAt: new Date().toISOString(), account: {}, submissions: [], errors: errors, requestCount: 0, stoppedByRiskControl: null };
    try {
      // 账号层：近 7 天概况（tab 0 播放类、1 互动类、2 粉丝类）和播放趋势
      for (const tab of [0, 1, 2]) rawPack.account[`overview${tab}`] = await tryFetch(`概况${tab}`, `${M}/v2/overview/stat/num?period=0&tab=${tab}`);
      rawPack.account.playTrend = await tryFetch('播放趋势', `${M}/v2/overview/stat/graph?period=0&type=play`);
      // 稿件列表（分页）和各稿件指标对比
      const items = [];
      for (let pn = 1; pn <= 20; pn++) {
        const d = await tryFetch('稿件列表', `${M}/archive/index?pn=${pn}&ps=20&scene=archive_compare&order=0`);
        if (!d?.list?.length) break;
        items.push(...d.list);
        if (items.length >= (d.pager?.total ?? 0) || d.list.length < 20) break;
      }
      rawPack.account.comparison = await tryFetch('稿件对比', `${M}/archive_diagnose/compare?size=50`);
      const compareMap = new Map((rawPack.account.comparison?.list ?? []).map((x) => [x.bvid, x]));
      for (const a of items) {
        const b = a.bvid;
        const submission = { bvid: b, aid: a.aid, title: a.title, duration: a.duration, release: a.pubtime, listItem: a, comparison: compareMap.get(b) ?? null };
        submission.details = await tryFetch(`详情 ${b}`, `${M}/v3/archive/view?bvid=${b}`);
        submission.playAnalysis = await tryFetch(`播放分析 ${b}`, `${M}/archive_diagnose/play_analyze?bvid=${b}`);
        submission.overview = await tryFetch(`总览 ${b}`, `${M}/archive_diagnose/overview?bvid=${b}`);
        submission.fanConversion = await tryFetch(`转粉 ${b}`, `${M}/archive_diagnose/trans_fans_analyze?bvid=${b}`);
        if (submission.fanConversion) delete submission.fanConversion.improve_idea; // 推荐的别人的稿件，和本稿无关
        submission.playTrend = await tryFetch(`播放趋势 ${b}`, `${M}/archive_diagnose/trend?type=play&bvid=${b}`);
        submission.followerTrend = await tryFetch(`涨粉趋势 ${b}`, `${M}/archive_diagnose/trend?type=fan&bvid=${b}`);
        submission.parts = [];
        for (const v of submission.details?.videos ?? []) {
          const p = { cid: v.cid, title: v.title, duration: v.duration };
          // 留存（viewer_quit）和弹幕分布（dm），各带同类稿件的 peer_*
          p.retention = await tryFetch(`留存 ${b}`, `${M}/v2/archive/analyze/graph?cid=${v.cid}`);
          p.danmaku = [];
          for (let pn = 1; pn <= danmakuMaxPages; pn++) {
            const d = await tryFetch(`弹幕 ${b}`, `${A}/v2/dm/search?oid=${v.cid}&type=1&pn=${pn}&ps=100&order=ctime&sort=asc`);
            const items = d?.result ?? [];
            // 只留内容和时间轴，不留发送者身份
            for (const x of items) p.danmaku.push({ progress: x.progress, msg: x.msg, ctime: x.ctime, mode: x.mode, like: x.like_count, pool: x.pool });
            if (items.length < 100 || p.danmaku.length >= (d?.page?.total ?? 0)) break;
          }
          submission.parts.push(p);
        }
        submission.commentCount = [];
        for (let pn = 1; pn <= commentMaxPages; pn++) {
          const d = await tryFetch(`评论 ${b}`, `${A}/v2/reply/up/fulllist?order=1&filter=-1&type=1&bvid=${b}&pn=${pn}&ps=50&charge_plus_filter=false`);
          const items = d?.list ?? [];
          for (const x of items) submission.commentCount.push({ msg: x.content?.message ?? x.message, ctime: x.ctime, like: x.like, replyCount: x.count ?? x.rcount, isReply: !!(x.parent && x.parent !== 0) });
          if (items.length < 50 || submission.commentCount.length >= (d?.page?.total ?? 0)) break;
        }
        rawPack.submissions.push(submission);
      }
    } catch (e) {
      rawPack.stoppedByRiskControl = String(e.message ?? e);
    }
    rawPack.requestCount = attempts;
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const downloadName = `bili-数据-${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}-${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}.json`;
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
      requestCount: attempts,
      stoppedByRiskControl: rawPack.stoppedByRiskControl,
      errors: errors.slice(0, 20),
      submissions: rawPack.submissions.map((s) => ({ bvid: s.bvid, title: s.title, duration: s.duration, retentionPointCount: s.parts[0]?.retention?.viewer_quit?.length ?? 0, danmaku: s.parts.reduce((n, p) => n + p.danmaku.length, 0), commentCount: s.commentCount.length })),
    };
  });
}
