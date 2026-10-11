import http from 'node:http';

// Local OpenAI-compatible endpoint only. Never reaches a live provider.
export async function startMockAi({ text = '## Organized\n\n- Mock proposal' } = {}) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString('utf8') });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }));
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}/v1`, calls, close: () => new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())) };
}
