import { NextRequest, NextResponse } from 'next/server';

/**
 * Sessions API Route Handler
 * Proxies session list requests to backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || 'dev-admin-key-change-in-production';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const queryParams = url.searchParams.toString();
    const endpoint = queryParams ? `${API_URL}/admin/sessions?${queryParams}` : `${API_URL}/admin/sessions`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Sessions API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch sessions', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Sessions API] Request failed:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}