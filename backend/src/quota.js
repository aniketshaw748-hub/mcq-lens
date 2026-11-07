import { DurableObject } from 'cloudflare:workers';

// Each student and each provider/model has its own object. This is shared,
// persistent accounting, rather than an isolate-local Map that loses limits.
export class Quota extends DurableObject {
  async visit(source) {
    return this.ctx.storage.transaction(async storage => {
      const totals = await storage.get('visits') || {};
      totals[source] = (totals[source] || 0) + 1;
      await storage.put('visits', totals);
      return totals[source];
    });
  }
  async reserve({ limits, tokens = 0, ttl = 90000, clock = 'utc', category, replace = false }) {
    return this.ctx.storage.transaction(async storage => {
      const now = Date.now();
      const date = clock === 'pacific' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now) : new Date(now).toISOString().slice(0, 10);
      const state = await storage.get('state') || {};
      if (state.day !== date) { state.day = date; state.requests = 0; state.tokens = 0; }
      state.recent = (state.recent || []).filter(x => x.time > now - 60000);
      state.leases = (state.leases || []).filter(x => x.expires > now);
      if (replace) {
        const replaced = state.leases.filter(x => x.category !== 'study');
        for (const lease of replaced) {
          if (state.day === lease.day) { state.requests = Math.max(0, state.requests - 1); state.tokens = Math.max(0, state.tokens - lease.tokens); }
        }
        state.leases = state.leases.filter(x => x.category === 'study');
      }
      if ((state.cooldown || 0) > now) return { retryMs: state.cooldown - now };
      if (state.requests >= limits.rpd || state.tokens + tokens > limits.tpd) { await storage.put('state', state); return { retryMs: 60000, exhausted: true, reason: 'daily' }; }
      if (state.recent.length >= limits.rpm || state.recent.reduce((n, x) => n + x.tokens, 0) + tokens > limits.tpm) {
        await storage.put('state', state);
        return { retryMs: Math.max(1000, (state.recent[0]?.time || now) + 60000 - now), reason: 'rate' };
      }
      if (state.leases.length >= limits.concurrent) { await storage.put('state', state); return { retryMs: 2000, reason: 'busy' }; }
      const id = crypto.randomUUID();
      state.requests++; state.tokens += tokens;
      state.recent.push({ id, time: now, tokens });
      state.leases.push({ id, expires: now + ttl, tokens, day: date, category });
      await storage.put('state', state);
      return { id, remaining: limits.rpd - state.requests };
    });
  }
  async active(id) {
    const state = await this.ctx.storage.get('state');
    return Boolean(state?.leases?.some(x => x.id === id && x.expires > Date.now()));
  }
  async release({ id, actualTokens, refund = false, cooldownMs = 0 }) {
    return this.ctx.storage.transaction(async storage => {
      const state = await storage.get('state');
      if (!state) return;
      const lease = state.leases?.find(x => x.id === id);
      if (lease) {
        state.leases = state.leases.filter(x => x.id !== id);
        if (state.day === lease.day) {
          if (refund) { state.requests = Math.max(0, state.requests - 1); state.tokens = Math.max(0, state.tokens - lease.tokens); }
          else if (Number.isFinite(actualTokens)) state.tokens = Math.max(0, state.tokens + actualTokens - lease.tokens);
        }
        state.recent = (state.recent || []).map(x => x.id === id && Number.isFinite(actualTokens) ? { ...x, tokens: actualTokens } : x);
      }
      state.cooldown = Math.max(state.cooldown || 0, Date.now() + cooldownMs);
      await storage.put('state', state);
    });
  }
  async usage() {
    const state = await this.ctx.storage.get('state');
    return { requests: state?.day === new Date().toISOString().slice(0, 10) ? state.requests : 0 };
  }
  async status(limits, clock = 'utc') {
    const state = await this.ctx.storage.get('state') || {};
    const now = Date.now();
    const day = clock === 'pacific' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now) : new Date(now).toISOString().slice(0, 10);
    const requests = state.day === day ? state.requests || 0 : 0;
    const tokens = state.day === day ? state.tokens || 0 : 0;
    const recent = (state.recent || []).filter(x => x.time > now - 60000);
    return { requestsToday: requests, dailyRequestCap: limits.rpd, dailyRequestsRemaining: Math.max(0, limits.rpd - requests), tokensToday: tokens, dailyTokenCap: limits.tpd, minuteRequests: recent.length, minuteTokenEstimate: recent.reduce((sum, x) => sum + x.tokens, 0), minuteTokenCap: limits.tpm, activeRequests: (state.leases || []).filter(x => x.expires > now).length, cooldownMs: Math.max(0, (state.cooldown || 0) - now) };
  }
}
