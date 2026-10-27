import { NextResponse } from 'next/server';
import { recordHeartbeat, isLocked, getRemainingLockoutSeconds, getDeviceToken } from '@/lib/hardwareState';

export async function POST(request) {
  try {
    const token = request.headers.get('x-esp32-token') || request.headers.get('authorization')?.replace('Bearer ', '');
    const expectedToken = getDeviceToken();

    if (!token || token !== expectedToken) {
      return NextResponse.json({ success: false, error: 'Unauthorized hardware' }, { status: 401 });
    }

    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    recordHeartbeat(ip);

    return NextResponse.json({
      success: true,
      status: 'online',
      locked: isLocked(),
      remainingSeconds: getRemainingLockoutSeconds()
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
