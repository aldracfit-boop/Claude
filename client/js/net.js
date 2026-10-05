// Client WebSocket minimaliste avec abonnement par type de message.

export function serverAvailable() {
  return location.protocol === 'http:' || location.protocol === 'https:';
}

export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export class Net {
  constructor(url = wsUrl()) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.open = false;
  }

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let done = false;
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          ws.close();
          reject(new Error('Délai de connexion dépassé'));
        }
      }, timeoutMs);
      ws.onopen = () => {
        this.open = true;
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve();
        }
      };
      ws.onerror = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(new Error('Connexion impossible au serveur'));
        }
      };
      ws.onclose = () => {
        this.open = false;
        this.emit('close', {});
      };
      ws.onmessage = (m) => {
        let msg;
        try {
          msg = JSON.parse(m.data);
        } catch {
          return;
        }
        if (msg && typeof msg.t === 'string') this.emit(msg.t, msg);
      };
    });
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, msg) {
    const set = this.handlers.get(type);
    if (set) for (const fn of [...set]) fn(msg);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.handlers.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.open = false;
  }
}
