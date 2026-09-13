type WaitlistPayload = {
    email?: unknown;
    consent?: unknown;
    website?: unknown;
};

type UpstreamResponse = {
    ok?: unknown;
    code?: unknown;
};

const MAX_BODY_BYTES = 4096;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const runtimeEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};

function jsonResponse(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
        },
    });
}

function successfulResponse() {
    return jsonResponse({ ok: true }, 201);
}

function isValidEmail(email: string) {
    return email.length <= 254 && EMAIL_PATTERN.test(email);
}

function isRateLimited(request: Request) {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || request.headers.get('x-real-ip')?.trim();

    // Local requests and platforms without a forwarded IP are still protected
    // by the honeypot and payload validation, but are not grouped together.
    if (!clientIp) {
        return false;
    }

    const now = Date.now();
    const bucket = rateLimitBuckets.get(clientIp);

    if (!bucket || bucket.resetAt <= now) {
        rateLimitBuckets.set(clientIp, {
            count: 1,
            resetAt: now + RATE_LIMIT_WINDOW_MS,
        });
        return false;
    }

    bucket.count += 1;
    return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

async function handler(request: Request) {
    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
    }

    if (isRateLimited(request)) {
        return jsonResponse({ ok: false, error: 'rate_limited' }, 429);
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ ok: false, error: 'payload_too_large' }, 413);
    }

    let payload: WaitlistPayload;

    try {
        const contentType = request.headers.get('content-type') ?? '';

        if (contentType.includes('application/json')) {
            payload = await request.json() as WaitlistPayload;
        } else {
            const formData = await request.formData();
            const consentValue = formData.get('consent');

            payload = {
                email: formData.get('email'),
                consent: consentValue === 'on' || consentValue === 'true',
                website: formData.get('website'),
            };
        }
    } catch {
        return jsonResponse({ ok: false, error: 'invalid_payload' }, 400);
    }

    // Bots filling the hidden field receive a neutral success response without
    // reaching the Google Apps Script endpoint.
    if (typeof payload.website === 'string' && payload.website.trim() !== '') {
        return successfulResponse();
    }

    if (payload.consent !== true || typeof payload.email !== 'string') {
        return jsonResponse({ ok: false, error: 'invalid_payload' }, 400);
    }

    const email = payload.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
        return jsonResponse({ ok: false, error: 'invalid_email' }, 400);
    }

    const scriptUrl = runtimeEnv.GOOGLE_APPS_SCRIPT_URL;
    const sharedSecret = runtimeEnv.GOOGLE_SHEETS_SHARED_SECRET;

    if (!scriptUrl || !sharedSecret) {
        return jsonResponse({ ok: false, error: 'waitlist_not_configured' }, 503);
    }

    try {
        const upstream = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                consent: true,
                secret: sharedSecret,
                source: 'atlas-landing-page',
            }),
        });

        const rawResponse = await upstream.text();
        let upstreamData: UpstreamResponse = {};

        try {
            upstreamData = JSON.parse(rawResponse) as UpstreamResponse;
        } catch {
            // The Apps Script response must be JSON. Treat any other body as
            // an unavailable integration instead of exposing it to visitors.
        }

        if (upstreamData.code === 'duplicate') {
            return jsonResponse({ ok: false, error: 'duplicate' }, 409);
        }

        if (!upstream.ok || upstreamData.ok !== true) {
            return jsonResponse({ ok: false, error: 'upstream_failed' }, 502);
        }

        return successfulResponse();
    } catch {
        return jsonResponse({ ok: false, error: 'upstream_unavailable' }, 502);
    }
}

export default {
    fetch: handler,
};
