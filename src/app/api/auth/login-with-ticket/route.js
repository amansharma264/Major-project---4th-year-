import { NextResponse } from 'next/server';
import { consumeUnlockTicket } from '@/lib/hardwareState';
import { generateSessionToken, getSessionCookieOptions } from '@/lib/auth';

export async function POST(request) {
  try {
    const body = await request.json();
    const { ticket } = body;

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'Ticket is required' }, { status: 400 });
    }

    const isValid = consumeUnlockTicket(ticket);
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid, expired, or previously used unlock ticket' }, { status: 401 });
    }

    // Generate authenticated signed session token
    const sessionToken = generateSessionToken({ source: 'esp32_hardware_keypad' });
    const cookieOpts = getSessionCookieOptions(false);

    const response = NextResponse.json({
      success: true,
      message: 'Vault session successfully authenticated'
    });

    response.cookies.set(cookieOpts.name, sessionToken, cookieOpts);

    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
