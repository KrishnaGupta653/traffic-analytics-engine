import { NextRequest, NextResponse } from 'next/server';

/**
 * Session Actions API Route Handler
 * Proxies session action requests (upspin, downspin, terminate, notify, redirect)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || 'dev-admin-key-change-in-production';

type RouteParams = {
  params: {
    sessionHash: string;
    action: string;
  };
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionHash, action } = params;

    // Validate action
    const validActions = ['upspin', 'downspin', 'terminate', 'notify', 'redirect'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action', validActions },
        { status: 400 }
      );
    }

    // Parse request body
    let body = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is okay for some actions
    }

    const endpoint = `${API_URL}/admin/sessions/${sessionHash}/${action}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Session Action API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: `Failed to execute ${action}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Session Action API] Request failed:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionHash, action } = params;

    // Only allow GET for specific actions
    if (action !== 'details') {
      return NextResponse.json(
        { error: 'GET method not supported for this action' },
        { status: 405 }
      );
    }

    const endpoint = `${API_URL}/admin/sessions/${sessionHash}`;

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
      console.error('[Session Details API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch session details', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Session Details API] Request failed:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}