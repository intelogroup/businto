import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

const IS_PERF = process.env.NODE_ENV !== 'production' || process.env.ENABLE_PERF_TRACE === '1';

export async function middleware(request: NextRequest) {
    if (!IS_PERF) return await updateSession(request);

    const t0 = Date.now();
    const result = await updateSession(request);
    const ms = Date.now() - t0;

    // Only log slow middleware (>50ms) or all if VERBOSE_PERF is set
    if (ms > 50 || process.env.VERBOSE_PERF === '1') {
        const { pathname } = request.nextUrl;
        const category = pathname.startsWith('/api/') ? 'api'
            : pathname.startsWith('/dashboard') ? 'dashboard'
            : pathname.startsWith('/master/admin') ? 'admin'
            : 'page';
        console.log(`[middleware-perf] ${ms}ms  ${category}  ${pathname}`);
    }

    return result;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
