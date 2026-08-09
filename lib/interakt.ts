// Server-side Interakt (WhatsApp Business API) client. Uses the secret API key,
// so import only from route handlers — never a client component.
//
// Interakt sends WhatsApp messages using PRE-APPROVED templates (Meta rule:
// you can't send free-form marketing text, only approved templates). It also
// stores users with tags/traits, which powers "Customer Intelligence".

const API_KEY = process.env.INTERAKT_API_KEY;
const BASE = 'https://api.interakt.ai/v1/public';
const PLACEHOLDER = 'your_interakt_api_key';

export function interaktConfigured(): boolean {
  return Boolean(API_KEY && API_KEY !== PLACEHOLDER);
}

async function interaktFetch(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export type SendTemplateInput = {
  phoneNumber: string; // without country code, e.g. "9876543210"
  countryCode?: string; // e.g. "+91"
  templateName: string; // an APPROVED template name in your Interakt account
  languageCode?: string; // e.g. "en"
  bodyValues?: string[]; // fills {{1}}, {{2}} ... placeholders in the template
};

/** Send a WhatsApp template message to one user. */
export async function sendWhatsAppTemplate(input: SendTemplateInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!interaktConfigured()) return { ok: false, error: 'Interakt not configured' };

  const res = await interaktFetch('/message/', {
    countryCode: input.countryCode ?? '+91',
    phoneNumber: input.phoneNumber,
    type: 'Template',
    template: {
      name: input.templateName,
      languageCode: input.languageCode ?? 'en',
      bodyValues: input.bodyValues ?? [],
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.result === false) {
    return { ok: false, error: json?.message || `HTTP ${res.status}` };
  }
  return { ok: true, id: json?.id };
}

/** Create/update a user with tags + traits (used for auto-categorisation). */
export async function tagUser(input: {
  phoneNumber: string;
  countryCode?: string;
  tags?: string[];
  traits?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  if (!interaktConfigured()) return { ok: false, error: 'Interakt not configured' };

  const res = await interaktFetch('/track/users/', {
    countryCode: input.countryCode ?? '+91',
    phoneNumber: input.phoneNumber,
    tags: input.tags ?? [],
    traits: input.traits ?? {},
  });

  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  return { ok: true };
}
