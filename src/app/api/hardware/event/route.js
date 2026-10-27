import { NextResponse } from 'next/server';
import { recordKeypadEvent, getDeviceToken } from '@/lib/hardwareState';

export async function POST(request) {
  try {
    const token = request.headers.get('x-esp32-token') || request.headers.get('authorization')?.replace('Bearer ', '');
    const expectedToken = getDeviceToken();

    if (!token || token !== expectedToken) {
      return NextResponse.json({ success: false, error: 'Unauthorized hardware' }, { status: 401 });
    }

    const body = await request.json();
    const { event, count } = body;

    if (event === 'digit') {
      recordKeypadEvent('digit', count);
      return NextResponse.json({ success: true, event: 'digit', count });
    } else if (event === 'clear') {
      recordKeypadEvent('clear');
      return NextResponse.json({ success: true, event: 'clear' });
    }

    return NextResponse.json({ success: false, error: 'Unknown event' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
