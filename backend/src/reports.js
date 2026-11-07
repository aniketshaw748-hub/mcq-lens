import { DurableObject } from 'cloudflare:workers';

// Bug reports from the extension. They hold what the extension did and what failed,
// never question text or page content; a screenshot only when the user ticked it.
const KEEP_REPORTS = 2000, KEEP_SCREENSHOTS = 50;
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';

// Same failure, different numbers or ids → same group.
export function signature(report) {
  const message = report.message.toLowerCase().replace(/https?:\/\/\S+/g, '<url>').replace(/[0-9a-f]{8,}/g, '<id>').replace(/\d+/g, '<n>').slice(0, 160);
  return `${report.kind}|${report.stage || '-'}|${report.reason || '-'}|${message}`;
}

export function validateReport(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid report.');
  const kind = input.kind === 'user' ? 'user' : 'auto';
  const events = Array.isArray(input.events) ? input.events.slice(-40).map(event => ({ t: Number.isFinite(event?.t) ? Math.round(event.t) : 0, type: text(event?.type, 40), detail: text(event?.detail, 200) })) : [];
  const screenshot = typeof input.screenshot === 'string' && /^[A-Za-z0-9+/]+=*$/.test(input.screenshot) && input.screenshot.length <= 1500000 ? input.screenshot : '';
  const report = {
    kind, version: text(input.version, 20), browser: text(input.browser, 80), site: text(input.site, 120).toLowerCase(),
    stage: text(input.stage, 40), reason: text(input.reason, 40), message: text(input.message, 500) || (kind === 'user' ? 'User report' : 'Unknown error'),
    note: kind === 'user' ? text(input.note, 2000) : '', ownKeys: input.ownKeys === true, events, screenshot
  };
  if (kind === 'user' && !report.note && !report.screenshot) throw new Error('Describe the problem or include a screenshot.');
  return report;
}

export class Reports extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER, signature TEXT, client TEXT, body TEXT, screenshot TEXT)`);
    ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS reports_signature ON reports (signature)`);
  }
  async add(report, client) {
    const { screenshot, ...body } = report;
    const sql = this.ctx.storage.sql;
    const id = sql.exec('INSERT INTO reports (time, signature, client, body, screenshot) VALUES (?, ?, ?, ?, ?) RETURNING id', Date.now(), signature(report), client, JSON.stringify(body), screenshot || null).one().id;
    sql.exec('DELETE FROM reports WHERE id <= ?', id - KEEP_REPORTS);
    sql.exec('UPDATE reports SET screenshot = NULL WHERE screenshot IS NOT NULL AND id NOT IN (SELECT id FROM reports WHERE screenshot IS NOT NULL ORDER BY id DESC LIMIT ?)', KEEP_SCREENSHOTS);
    return id;
  }
  async summary() {
    return this.ctx.storage.sql.exec(`SELECT signature, COUNT(*) AS count, COUNT(DISTINCT client) AS users, MIN(time) AS first, MAX(time) AS last, MAX(id) AS latest FROM reports GROUP BY signature ORDER BY last DESC LIMIT 200`).toArray();
  }
  async list(signatureFilter, limit = 20) {
    const rows = signatureFilter
      ? this.ctx.storage.sql.exec('SELECT id, time, body, screenshot IS NOT NULL AS hasScreenshot FROM reports WHERE signature = ? ORDER BY id DESC LIMIT ?', signatureFilter, limit).toArray()
      : this.ctx.storage.sql.exec('SELECT id, time, body, screenshot IS NOT NULL AS hasScreenshot FROM reports ORDER BY id DESC LIMIT ?', limit).toArray();
    return rows.map(row => ({ id: row.id, time: row.time, hasScreenshot: Boolean(row.hasScreenshot), ...JSON.parse(row.body) }));
  }
  async get(id) {
    const row = this.ctx.storage.sql.exec('SELECT id, time, body, screenshot FROM reports WHERE id = ?', id).toArray()[0];
    return row ? { id: row.id, time: row.time, screenshot: row.screenshot, ...JSON.parse(row.body) } : null;
  }
}
