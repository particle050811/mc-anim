// 测试用的假渲染后端（后端.ts）：不打包、不开浏览器、不过真闸、材质包只有一组。每张票（渲染闸、放行闸、批项）和每次开会话都记下来给测试核对；
// 要出东西的几样（renderMedia、renderFrames 等）由测试传进来，没传就报错，免得测试悄悄走了没想到的路。
import type { TaskDecl } from '../闸/任务.ts';
import type { RenderBackend } from './后端.ts';
import type { RenderSession, SessionOpts } from './会话.ts';
import type { HeadlessBrowser } from './渲染器.ts';

export type FakeTicket = { gate: 'render' | 'pass' | 'batch'; decl: TaskDecl };

const notGiven = (name: string) => () => {
  throw new Error(`假后端没给 ${name}`);
};

export const fakeBackend = (o: Partial<RenderBackend> & { session?: Partial<RenderSession> } = {}) => {
  const tickets: FakeTicket[] = [];
  const sessions: { level: string; opts: SessionOpts }[] = [];
  const { session, ...overrides } = o;
  const backend: RenderBackend = {
    openSession: (async (level, fn, _runRecord, opts = {}) => {
      sessions.push({ level, opts });
      return fn({
        serveUrl: '假包',
        browser: {} as HeadlessBrowser,
        params: {} as RenderSession['params'],
        compositions: [],
        seconds: { bundle: 0, browser: 0, compositions: 0 },
        solveCache: { 新写: 0 },
        readCompositions: async () => [],
        ...session,
      });
    }) as RenderBackend['openSession'],
    launchBrowser: notGiven('launchBrowser'),
    readCompositions: notGiven('readCompositions'),
    renderMedia: notGiven('renderMedia'),
    renderStill: notGiven('renderStill'),
    renderFrames: notGiven('renderFrames'),
    passRenderGate: (async (fn: () => Promise<unknown>, _hint?: unknown, _env?: unknown, decl: TaskDecl = {}) => {
      tickets.push({ gate: 'render', decl });
      return fn();
    }) as RenderBackend['passRenderGate'],
    passGate: (async (fn: () => Promise<unknown>, _hint?: unknown, _env?: unknown, decl: TaskDecl = {}) => {
      tickets.push({ gate: 'pass', decl });
      return fn();
    }) as RenderBackend['passGate'],
    openGateBatch: ((decl: TaskDecl) => ({
      runTask: async (item: TaskDecl, fn: () => Promise<unknown>) => {
        tickets.push({ gate: 'batch', decl: { ...decl, ...item } });
        return fn();
      },
      endedAt: () => {},
    })) as unknown as RenderBackend['openGateBatch'],
    gateHeartbeat: () => {},
    perResourcePackGroup: (async (_root: string, items: readonly unknown[], _key: unknown, fn: (g: unknown[]) => Promise<unknown>) => [await fn([...items])]) as RenderBackend['perResourcePackGroup'],
    withSegResourcePack: ((_root: string, _key: string, fn: () => unknown) => fn()) as RenderBackend['withSegResourcePack'],
    ...overrides,
  };
  return { backend, tickets, sessions };
};
