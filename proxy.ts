import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE } from './src/lib/admin-auth';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = pathname.startsWith('/api/admin/');
  const isLoginPage = pathname === '/admin/login';
  const isLoginApi = pathname === '/api/admin/login';
  const isLogoutApi = pathname === '/api/admin/logout';

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (isLoginPage || isLoginApi || isLogoutApi) {
    return NextResponse.next();
  }

  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const isAuthed = session === '1';

  if (isAuthed) {
    return NextResponse.next();
  }

  if (isAdminApi) {
    return NextResponse.json(
      { success: false, message: 'Admin authentication required' },
      { status: 401 }
    );
  }

  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
