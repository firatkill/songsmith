import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from './env';
import { isLocale, preferredLocale, localizedPath } from './lib/locale';
export async function proxy(request: NextRequest) {
  const env = publicEnv();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const origins = [
    env.NEXT_PUBLIC_API_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
  ].flatMap((value) => {
    const url = new URL(value);
    const origin = url.origin;
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return [origin, url.origin];
  });
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `connect-src 'self' ${origins.join(' ')}${dev ? ' ws://localhost:3000 ws://127.0.0.1:3000' : ''}`,
    `img-src 'self' data:`,
    `font-src 'self'`,
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  let response = NextResponse.next({ request: { headers } });
  const auth = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          headers.set('cookie', request.cookies.toString());
          response = NextResponse.next({ request: { headers } });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  ).auth;
  await auth.getClaims();
  if (!isLocale(request.nextUrl.pathname.split('/')[1])) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(
      url.pathname,
      preferredLocale(
        request.cookies.get('locale')?.value,
        request.headers.get('accept-language') ?? undefined,
      ),
    );
    const redirected = NextResponse.redirect(url);
    response.cookies
      .getAll()
      .forEach((cookie) => redirected.cookies.set(cookie));
    response = redirected;
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  if (!dev && process.env.NODE_ENV === 'production')
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  return response;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
