import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPublicHardwareState } from '@/lib/hardwareState';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(sessionCookie);

    const hardwareState = getPublicHardwareState();

    return NextResponse.json({
      success: true,
      authenticated: Boolean(session),
      session: session ? { issuedAt: session.issuedAt, expiresAt: session.expiresAt } : null,
      hardware: hardwareState
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
