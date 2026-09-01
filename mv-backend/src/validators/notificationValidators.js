import { z } from "zod";

/**
 * Push subscription validation.
 *
 * This is not cosmetic. The endpoint a browser hands us is a URL the SERVER
 * later makes an HTTP request to, every time an alert fires — so an
 * unvalidated endpoint is a server-side request forgery hole: anyone with an
 * account could point it at a cloud metadata service, an internal admin port
 * or a machine behind the firewall, and have the poller fetch it on their
 * behalf, from inside the network.
 *
 * So: https only, no IP literals, no internal hostnames, and a length cap.
 * Real push endpoints are https URLs at public hostnames belonging to Google,
 * Apple, Mozilla or Microsoft, and every one of them satisfies this.
 *
 * Deliberately NOT an allowlist of those four. New browsers ship new push
 * services, and a list like that fails closed on someone's perfectly good
 * browser without anyone noticing why.
 */

const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|.*\.internal|.*\.local)$/i;

// An IPv4 literal, or anything bracketed, which is how IPv6 appears in a URL.
const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[.*\])$/;

const pushEndpoint = z.string({ required_error: 'A push endpoint is required' })
    .trim()
    .max(2000, 'That push endpoint is implausibly long')
    .refine((value) => {
        let url;
        try { url = new URL(value); } catch { return false; }
        if (url.protocol !== 'https:') return false;
        if (IP_LITERAL.test(url.hostname)) return false;
        if (PRIVATE_HOST.test(url.hostname)) return false;
        // A hostname with no dot is a bare internal name.
        return url.hostname.includes('.');
    }, 'That is not a valid push endpoint');

// Base64url, which is what the Web Push API produces for both keys.
const pushKey = (label, max) =>
    z.string({ required_error: `A ${label} key is required` })
        .trim()
        .min(1, `A ${label} key is required`)
        .max(max, `That ${label} key is too long`)
        .regex(/^[A-Za-z0-9_-]+=*$/, `That ${label} key is not valid base64url`);

export const pushSubscriptionSchema = z.object({
    endpoint: pushEndpoint,
    keys: z.object({
        p256dh: pushKey('p256dh', 200),
        auth: pushKey('auth', 100),
    }),
});

export const markReadSchema = z.object({
    // Optional: no id means "mark everything read".
    id: z.string().uuid('That is not a valid notification id').optional(),
});
