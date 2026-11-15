// 冻结旧轮询算法，验证活旧进程和新票共存；不要随实现一起改。
import fs from 'node:fs';
import path from 'node:path';
import {processAlive} from './旧锁.ts';
const ticketExpiryMs = 60_000;
const hostSlug = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
type Ticket = {文件: string; 名: string};
const parseTicket = (ticketName: string) => {
  const m = /^(\d+)-(.+)-(\d+)$/.exec(ticketName);
  return m ? { 时间: Number(m[1]), 主机: m[2]!, pid: Number(m[3]) } : null;
};

const ticketAlive = (dir: string, ticketName: string, localHost: string) => {
  const t = parseTicket(ticketName);
  if (!t) return false;
  if (t.主机 === hostSlug(localHost)) return processAlive(t.pid);
  try {
    return Date.now() - fs.statSync(path.join(dir, ticketName)).mtimeMs < ticketExpiryMs;
  } catch {
    return false;
  }
};

/** 排在最前面的活票是不是我的；顺手删掉死票 */
export const isMyTurn = (dir: string, ticket: Ticket, localHost: string) => {
  const now = new Date();
  fs.utimesSync(ticket.文件, now, now); // 别的机器按修改时间判活
  for (const ticketName of fs.readdirSync(dir).sort()) {
    if (ticketName === ticket.名) return true;
    if (ticketAlive(dir, ticketName, localHost)) return false;
    fs.rmSync(path.join(dir, ticketName), { force: true });
  }
  return true;
};

