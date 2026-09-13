// Vercel Routing Middleware, with two jobs:
//
// 1. Homepage content negotiation ("/"): serves homepage.md instead of
//    index.html when the request's Accept header prefers text/markdown, per
//    https://acceptmarkdown.com (RFC 7763 media type, RFC 9110 negotiation).
//
// 2. Agent-friendly 404s (any other extensionless path): this is a flat,
//    single-page site, so the only real extensionless routes are "/", "/about",
//    "/contact", and "/privacy" (each backed by a static file - see KNOWN_PATHS
//    below). Anything else extensionless is genuinely not found. Rather than
//    letting Vercel's static-file 404 fallback answer with a fixed HTML body
//    no matter what the client asked for, this negotiates the SAME way the
//    homepage does: a short Markdown body with recovery links for agents that
//    send `Accept: text/markdown`, or the real 404.html for everyone else -
//    always with a genuine 404 status.
//
// Static assets (anything with a file extension: images, PDF, video, the
// stylesheet/script, sitemap.xml, llms.txt, homepage.md, 404.html itself,
// favicons, ...) never reach this file at all; the matcher below excludes
// them, so their own real-file 404 handling is untouched.
//
// Every response this middleware touches carries `Vary: Accept,
// Accept-Encoding` so CDNs/browsers cache the different representations
// separately instead of leaking one to the other's requests.
//
// See parseAccept()/negotiate() below for the exact algorithm and the
// acceptmarkdown.com test vectors it is written to satisfy (also covered
// by tests/middleware.test.mjs).

import { next } from '@vercel/functions';

export const config = {
  // "/" needs an explicit entry: a negative-lookahead pattern like the second
  // one here does not, by itself, match the root route (see
  // https://vercel.com/docs/routing-middleware/api and the equivalent
  // Next.js middleware docs on matching root alongside a negative lookahead).
  matcher: ['/', '/((?!.*\\.).*)'],
};

const VARY_VALUE = 'Accept, Accept-Encoding';

// Extensionless paths that are real pages on this site, backed by an actual
// file (see about/index.html, contact/index.html, privacy/index.html). Every
// other extensionless path the matcher above sees is a genuine 404.
const KNOWN_PATHS = new Set([
  '/about', '/about/',
  '/contact', '/contact/',
  '/privacy', '/privacy/',
]);

const NOT_FOUND_MARKDOWN = `# 404 \u2014 Page Not Found

That page doesn't exist on this site. It may have moved, or the link is wrong.

Where to look next:

- [Home](https://www.lizibuilds.tech/) \u2014 Lizi Zivzivadze's engineering portfolio
- [About](https://www.lizibuilds.tech/about)
- [Contact](https://www.lizibuilds.tech/contact)
- [Sitemap](https://www.lizibuilds.tech/sitemap.xml)
- [Agent instructions (llms.txt)](https://www.lizibuilds.tech/llms.txt)
`;

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

function notAcceptable() {
  return new Response('406 Not Acceptable: this URL serves text/html or text/markdown.', {
    status: 406,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      vary: VARY_VALUE,
    },
  });
}

async function serveNotFound(request, decision) {
  if (decision === 'markdown') {
    return new Response(NOT_FOUND_MARKDOWN, {
      status: 404,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        vary: VARY_VALUE,
      },
    });
  }

  // 'html': reuse the real, styled 404.html body, but make sure the response
  // actually carries a 404 status (fetching a static file from middleware
  // otherwise returns whatever status that fetch produced).
  const htmlUrl = new URL('/404.html', request.url);
  const htmlResponse = await fetch(htmlUrl);
  const body = await htmlResponse.text();
  return new Response(body, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      vary: VARY_VALUE,
    },
  });
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  const accept = request.headers.get('accept') || '';
  const decision = negotiate(accept);

  // Any extensionless path other than "/" and the known real pages is a
  // genuine 404 - answer it directly (real status, negotiated body) instead
  // of falling through to a fixed static file.
  if (pathname !== '/' && !KNOWN_PATHS.has(pathname)) {
    if (decision === null) return notAcceptable();
    return serveNotFound(request, decision);
  }

  if (pathname === '/') {
    if (decision === null) return notAcceptable();

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
  }

  // Default: continue to the static file (index.html, or one of the known
  // real pages above), stamping Vary onto it so caches know the response
  // also depends on Accept.
  return next({
    headers: {
      vary: VARY_VALUE,
    },
  });
}
