import { getPublicHardwareState } from '@/lib/hardwareState';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const sendEvent = (data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Immediate payload on connect
      sendEvent(getPublicHardwareState());

      // Periodic stream interval every 600ms
      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        sendEvent(getPublicHardwareState());
      }, 600);

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}
