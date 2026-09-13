// Vercel Routing Middleware: serves homepage.md instead of index.html when
// the request's Accept header prefers text/markdown, per
// https://acceptmarkdown.com (RFC 7763 media type, RFC 9110 negotiation).
//
// Only runs on the homepage ("/"), since this is a single-page site.
// Every response this middleware touches carries `Vary: Accept,
// Accept-Encoding` so CDNs/browsers cache the HTML and Markdown variants
// separately instead of leaking one to the other's requests.
//
// See parseAccept()/negotiate() below for the exact algorithm and the
// acceptmarkdown.com test vectors it is written to satisfy (also covered
// by tests/middleware.test.mjs).

import { next } from '@vercel/functions';

export const config = {
  matcher: '/',
};

const VARY_VALUE = 'Accept, Accept-Encoding';

export function parseAccept(acceptHeader) {
  if (!acceptHeader || !acceptHeader.trim()) return [];
  return acceptHeader.split(',').map((part) => {
    const segments = part.trim().split(';').map((s) => s.trim());
    const type = segments[0].toLowerCase();
    let q = 1;
    for (const seg of segments.slice(1)) {
      const [key, value] = seg.split('=').map((s) => s && s.trim());
      if (key === 'q' && value !== undefined) {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed)) q = parsed;
      }
    }
    return { type, q };
  });
}

function bestMatchQ(fullType, entries) {
  const [group] = fullType.split('/');
  const exact = entries.find((e) => e.type === fullType);
  if (exact) return exact.q;
  const subtypeWildcard = entries.find((e) => e.type === `${group}/*`);
  if (subtypeWildcard) return subtypeWildcard.q;
  const anyWildcard = entries.find((e) => e.type === '*/*');
  if (anyWildcard) return anyWildcard.q;
  return undefined;
}

/**
 * Decide which representation to serve.
 * Returns 'markdown' | 'html' | null (null => 406 Not Acceptable).
 */
export function negotiate(acceptHeader) {
  if (!acceptHeader || !acceptHeader.trim()) return 'html';

  const entries = parseAccept(acceptHeader);
  const mdScore = bestMatchQ('text/markdown', entries);
  const htmlScore = bestMatchQ('text/html', entries);

  const mdForbidden = mdScore === 0;
  const htmlForbidden = htmlScore === 0;

  if (mdForbidden && htmlForbidden) return null; // both explicitly excluded -> 406
  if (mdForbidden) return 'html';
  if (htmlForbidden) return mdScore ? 'markdown' : 'html';

  if (mdScore !== undefined && (htmlScore === undefined || mdScore > htmlScore)) {
    return mdScore > 0 ? 'markdown' : 'html';
  }
  return 'html';
}

export default async function middleware(request) {
  const accept = request.headers.get('accept') || '';
  const decision = negotiate(accept);

  if (decision === null) {
    return new Response('406 Not Acceptable: this URL serves text/html or text/markdown.', {
      status: 406,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        vary: VARY_VALUE,
      },
    });
  }

  if (decision === 'markdown') {
    const mdUrl = new URL('/homepage.md', request.url);
    const mdResponse = await fetch(mdUrl);
    const body = await mdResponse.text();
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        vary: VARY_VALUE,
        'cache-control': 'public, max-age=0, must-revalidate',
      },
    });
  }

  // Default: continue to the static index.html, but stamp Vary onto it too,
  // so caches know the HTML response also depends on Accept.
  return next({
    headers: {
      vary: VARY_VALUE,
    },
  });
}
