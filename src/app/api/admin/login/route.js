import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, isAdminTokenValid, createAdminCookieValue } from '../../../../lib/admin-auth';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();

    if (!isAdminTokenValid(token)) {
      return NextResponse.json(
        { success: false, message: 'Invalid admin token' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true, message: 'Admin session created' });
    response.cookies.set(ADMIN_SESSION_COOKIE, createAdminCookieValue(), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Failed to authenticate admin', error: error.message },
      { status: 500 }
    );
  }
}
