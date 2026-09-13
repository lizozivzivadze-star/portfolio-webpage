import test from 'node:test';
import assert from 'node:assert/strict';
import middleware, { negotiate, parseAccept, config } from '../middleware.js';

test('config: matcher covers the homepage plus every extensionless path', () => {
  // "/" must be listed explicitly: a negative-lookahead-for-extension pattern
  // does not, by itself, match the root route.
  assert.deepEqual(config.matcher, ['/', '/((?!.*\\.).*)']);
});

test('middleware: Accept: text/markdown returns text/markdown with Vary: Accept', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.ok(String(url).endsWith('/homepage.md'));
    return new Response('# Lizi Zivzivadze\n\nHello.');
  };
  try {
    const req = new Request('https://www.lizibuilds.tech/', {
      headers: { accept: 'text/markdown' },
    });
    const res = await middleware(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8');
    assert.ok(res.headers.get('vary').includes('Accept'));
    const body = await res.text();
    assert.match(body, /^# Lizi Zivzivadze/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('middleware: Accept: text/markdown;q=0, text/html;q=0 returns 406', async () => {
  const req = new Request('https://www.lizibuilds.tech/', {
    headers: { accept: 'text/markdown;q=0, text/html;q=0' },
  });
  const res = await middleware(req);
  assert.equal(res.status, 406);
  assert.ok(res.headers.get('vary').includes('Accept'));
});

test('middleware: normal browser request continues the chain with Vary set', async () => {
  const req = new Request('https://www.lizibuilds.tech/', {
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
  const res = await middleware(req);
  // next() from @vercel/functions returns a Response instructing continuation;
  // it should not be the 406 or the markdown branch.
  assert.notEqual(res.status, 406);
  assert.ok(res.headers.get('vary').includes('Accept'));
});

// Test vectors from https://acceptmarkdown.com/guides/accept-parsing
// (server produces both markdown and html in every case here)
test('negotiate: "text/markdown" -> markdown', () => {
  assert.equal(negotiate('text/markdown'), 'markdown');
});

test('negotiate: "text/markdown, text/html;q=0.8" -> markdown', () => {
  assert.equal(negotiate('text/markdown, text/html;q=0.8'), 'markdown');
});

test('negotiate: "text/html" -> html', () => {
  assert.equal(negotiate('text/html'), 'html');
});

test('negotiate: "text/markdown;q=0, text/html" -> html (q=0 excludes, does not 406)', () => {
  assert.equal(negotiate('text/markdown;q=0, text/html'), 'html');
});

test('negotiate: "text/markdown;q=0" alone -> html (unmentioned type still servable)', () => {
  assert.equal(negotiate('text/markdown;q=0'), 'html');
});

test('negotiate: no Accept header -> html (missing = no constraint, serve default)', () => {
  assert.equal(negotiate(''), 'html');
  assert.equal(negotiate(undefined), 'html');
});

test('negotiate: "*/*" -> html (wildcard = anything fine, serve default)', () => {
  assert.equal(negotiate('*/*'), 'html');
});

// Additional real-world-shaped headers
test('negotiate: real Chrome navigate header -> html, never mismatches to markdown', () => {
  const chrome =
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
  assert.equal(negotiate(chrome), 'html');
});

test('negotiate: "text/markdown;q=0, text/html;q=0" -> 406 (both explicitly excluded)', () => {
  assert.equal(negotiate('text/markdown;q=0, text/html;q=0'), null);
});

test('negotiate: "text/plain" only -> html (neither representation named, fall back safely)', () => {
  assert.equal(negotiate('text/plain'), 'html');
});

test('parseAccept: parses q-values and defaults to q=1 when absent', () => {
  const parsed = parseAccept('text/markdown, text/html;q=0.8, */*;q=0.1');
  assert.deepEqual(parsed, [
    { type: 'text/markdown', q: 1 },
    { type: 'text/html', q: 0.8 },
    { type: '*/*', q: 0.1 },
  ]);
});

test('parseAccept: is case-insensitive on the type', () => {
  const parsed = parseAccept('Text/Markdown');
  assert.equal(parsed[0].type, 'text/markdown');
});

// --- Agent-friendly 404 handling for unknown extensionless paths ---------

test('middleware: unknown path with Accept: text/markdown returns a real 404 with a Markdown body and links', async () => {
  const req = new Request('https://www.lizibuilds.tech/this-does-not-exist', {
    headers: { accept: 'text/markdown' },
  });
  const res = await middleware(req);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.ok(res.headers.get('vary').includes('Accept'));
  const body = await res.text();
  assert.match(body, /^# 404/);
  assert.match(body, /\[Home\]\(https:\/\/www\.lizibuilds\.tech\/\)/);
  assert.match(body, /\[Sitemap\]/);
  assert.match(body, /\[Agent instructions \(llms\.txt\)\]/);
});

test('middleware: unknown path with a normal browser Accept header returns a real 404 with the styled HTML body', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.ok(String(url).endsWith('/404.html'));
    return new Response('<html><body>styled 404</body></html>', { status: 200 });
  };
  try {
    const req = new Request('https://www.lizibuilds.tech/some/nested/nonsense', {
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    const res = await middleware(req);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.ok(res.headers.get('vary').includes('Accept'));
    const body = await res.text();
    assert.match(body, /styled 404/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('middleware: unknown path with no Accept header defaults to the HTML 404 (not markdown)', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('<html>404</html>', { status: 200 });
  try {
    const req = new Request('https://www.lizibuilds.tech/nope');
    const res = await middleware(req);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  } finally {
    global.fetch = originalFetch;
  }
});

test('middleware: unknown path with both representations excluded (q=0, q=0) still 406s, never 404s wrongly', async () => {
  const req = new Request('https://www.lizibuilds.tech/whatever', {
    headers: { accept: 'text/markdown;q=0, text/html;q=0' },
  });
  const res = await middleware(req);
  assert.equal(res.status, 406);
  assert.ok(res.headers.get('vary').includes('Accept'));
});

test('middleware: known real pages (/about, /contact, /privacy) pass through instead of 404ing', async () => {
  for (const path of ['/about', '/about/', '/contact', '/contact/', '/privacy', '/privacy/']) {
    const req = new Request(`https://www.lizibuilds.tech${path}`, {
      headers: { accept: 'text/html' },
    });
    const res = await middleware(req);
    assert.notEqual(res.status, 404, `${path} should not 404`);
    assert.equal(res.headers.get('x-middleware-next'), '1', `${path} should continue to the static file`);
    assert.ok(res.headers.get('vary').includes('Accept'));
  }
});

test('middleware: root path is unaffected by the 404 branch and still passes through for a normal request', async () => {
  const req = new Request('https://www.lizibuilds.tech/', {
    headers: { accept: 'text/html' },
  });
  const res = await middleware(req);
  assert.equal(res.headers.get('x-middleware-next'), '1');
});
