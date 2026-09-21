import { NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, text, key } = body;

    if (action === 'hash') {
      const hash = CryptoJS.SHA256(text).toString();
      return NextResponse.json({ success: true, hash });
    }

    return NextResponse.json({ success: false, error: 'Invalid Action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}