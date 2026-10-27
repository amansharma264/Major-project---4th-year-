import { NextResponse } from 'next/server';
import { verifyHardwarePin } from '@/lib/hardwareState';

export async function POST(request) {
  try {
    const token = request.headers.get('x-esp32-token') || request.headers.get('authorization')?.replace('Bearer ', '');
    const body = await request.json();
    const { pin } = body;

    if (!pin) {
      return NextResponse.json({ success: false, error: 'PIN is required' }, { status: 400 });
    }

    const result = verifyHardwarePin(pin, token);

    if (result.error === 'UNAUTHORIZED_DEVICE') {
      return NextResponse.json(result, { status: 401 });
    }

    if (result.locked) {
      return NextResponse.json(result, { status: 429 });
    }

    return NextResponse.json(result, { status: result.success ? 200 : 403 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
