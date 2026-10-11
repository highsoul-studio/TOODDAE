// 生の HTTP を送る (Host / Origin / パスを加工しない)。fetch やブラウザは URL を整えたり Host を自分で決めたりするので、守りの検査には向かない。
import http from 'node:http';
import net from 'node:net';

export function rawRequest(base, { method = 'GET', path = '/', headers = {}, body } = {}) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: hostname, port, method, path, headers: { connection: 'close', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

// TCP で繋がるかどうか。'connected' か、エラーコード (ECONNREFUSED など) か、'timeout' を返す
export function tryConnect(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    s.setTimeout(timeoutMs, () => (s.destroy(), resolve('timeout')));
    s.on('connect', () => (s.destroy(), resolve('connected')));
    s.on('error', (e) => resolve(e.code ?? e.message));
  });
}
