// engine 里 import 的 JSON 没写 with { type: 'json' }（打包器不要这个），Node 直接跑要补上
export const load = (url: string, context: { importAttributes?: Record<string, string> }, nextLoad: (u: string, c: unknown) => unknown) => nextLoad(url, url.endsWith('.json') ? { ...context, importAttributes: { ...context.importAttributes, type: 'json' } } : context);
