'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, RotateCw, Webhook } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { BackendApiError, backendRequest, getBackendBaseUrl, getSelectedTenantId } from '@/lib/backend-api';

type WebhookSettings = {
  webhookKey: string;
  enabled: boolean;
  configured: boolean;
  depositPath: string;
  withdrawalPath: string;
  updatePath: string;
};

type RotatedSecret = Pick<WebhookSettings, 'depositPath' | 'withdrawalPath' | 'updatePath'> & { secret: string };

export default function WebhooksPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenantId = getSelectedTenantId();
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState('');

  const settings = useQuery({
    queryKey: ['webhook-settings', tenantId],
    queryFn: () => backendRequest<WebhookSettings>('/tenants/current/webhooks'),
    enabled: Boolean(tenantId),
  });

  const rotate = useMutation({
    mutationFn: () => backendRequest<RotatedSecret>('/tenants/current/webhooks/rotate', { method: 'POST' }),
    onSuccess: (data) => {
      setSecret(data.secret);
      queryClient.invalidateQueries({ queryKey: ['webhook-settings', tenantId] });
    },
  });

  const error = settings.error || rotate.error;
  useEffect(() => {
    if (error instanceof BackendApiError && error.status === 401) router.replace('/saas-login');
  }, [error, router]);

  async function copy(value: string, name: string) {
    await navigator.clipboard.writeText(value);
    setCopied(name);
    window.setTimeout(() => setCopied(''), 1600);
  }

  function rotateSecret() {
    if (settings.data?.configured && !window.confirm('Rotate the secret? Your current webhook will stop working until you update it.')) return;
    setSecret('');
    rotate.mutate();
  }

  const base = getBackendBaseUrl();
  const depositUrl = settings.data ? `${base}${settings.data.depositPath}` : '';
  const withdrawalUrl = settings.data ? `${base}${settings.data.withdrawalPath}` : '';
  const updateUrl = settings.data ? `${base}${settings.data.updatePath}` : '';
  // Full URLs with the just-generated secret as ?token= — ready to paste into a provider
  // that only supports a URL (e.g. Get-ID). Only available right after generating.
  const withToken = (url: string) => (secret ? `${url}?token=${secret}` : '');
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Webhooks</h1>
            <p className="page-sub">Connect your payment provider to this company.</p>
          </div>
          {settings.data ? <span className={`webhook-status ${settings.data.configured ? 'ready' : ''}`}>
            {settings.data.configured ? 'Configured' : 'Setup required'}
          </span> : null}
        </header>

        {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}
        {error ? <div className="banner2">{error instanceof Error ? error.message : 'Could not load webhook settings'}</div> : null}
        {settings.isLoading ? <div className="panel"><div className="empty2">Loading…</div></div> : null}

        {settings.data ? <div className="webhook-layout">
          <section className="panel webhook-panel">
            <div className="webhook-heading">
              <span><Webhook size={20} /></span>
              <div><h2>Webhook URLs</h2><p>Use the matching URL for each transaction type.</p></div>
            </div>
            <UrlRow label="Deposits" value={depositUrl} copied={copied === 'deposit'} onCopy={() => copy(depositUrl, 'deposit')} />
            <UrlRow label="Withdrawals" value={withdrawalUrl} copied={copied === 'withdrawal'} onCopy={() => copy(withdrawalUrl, 'withdrawal')} />
            <UrlRow label="Transaction updates" value={updateUrl} copied={copied === 'update'} onCopy={() => copy(updateUrl, 'update')} />
            <p className="webhook-note">Send the secret in the <code>X-Webhook-Secret</code> header, <b>or</b> add <code>?token=YOUR_SECRET</code> to the URL if your provider only supports a URL. Generate the secret on the right to get the full ready-to-paste links.</p>
          </section>

          <section className="panel webhook-panel">
            <div className="webhook-heading">
              <span><KeyRound size={20} /></span>
              <div><h2>Webhook secret</h2><p>It is shown once. Store it in your provider settings.</p></div>
            </div>
            {secret ? <div className="webhook-secret">
              <code>{secret}</code>
              <button className="btn-ghost" onClick={() => copy(secret, 'secret')}>
                {copied === 'secret' ? <Check size={15} /> : <Copy size={15} />}{copied === 'secret' ? 'Copied' : 'Copy'}
              </button>
            </div> : <div className="webhook-secret-empty">For security, the saved secret cannot be displayed again.</div>}
            <button className="btn-primary" disabled={rotate.isPending} onClick={rotateSecret}>
              <RotateCw size={15} className={rotate.isPending ? 'spin' : ''} />
              {rotate.isPending ? 'Generating…' : settings.data.configured ? 'Rotate secret' : 'Generate secret'}
            </button>

            {secret ? (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eef2f7' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Ready-to-paste URLs (secret included)</div>
                <p className="webhook-note" style={{ marginTop: 0 }}>Copy these straight into your provider. Shown only now — they include the secret.</p>
                <UrlRow label="Deposit" value={withToken(depositUrl)} copied={copied === 'tdep'} onCopy={() => copy(withToken(depositUrl), 'tdep')} />
                <UrlRow label="Withdrawal" value={withToken(withdrawalUrl)} copied={copied === 'twd'} onCopy={() => copy(withToken(withdrawalUrl), 'twd')} />
                <UrlRow label="Transaction update" value={withToken(updateUrl)} copied={copied === 'tupd'} onCopy={() => copy(withToken(updateUrl), 'tupd')} />
              </div>
            ) : null}
          </section>

          <section className="panel webhook-panel webhook-example">
            <div className="webhook-heading"><div><h2>Example request</h2><p>Send JSON with the company secret in a header.</p></div></div>
            <pre>{`curl -X POST "${depositUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: YOUR_SECRET" \\
  -d '{
  "User_id": "player-101",
  "Transaction_id": "transaction-001",
  "Amount": "500",
  "Payment_status": "Approved",
  "User_name": "Example Player"
}'`}</pre>
          </section>
        </div> : null}
      </main>
    </div>
  );
}

function UrlRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return <div className="webhook-url-row">
    <label>{label}</label>
    <div><code>{value}</code><button className="btn-ghost" onClick={onCopy} aria-label={`Copy ${label} webhook URL`}>
      {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}
    </button></div>
  </div>;
}
