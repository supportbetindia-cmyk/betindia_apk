'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useMasterFilter } from '@/components/MasterFilterProvider';
import { Button } from '@/components/ui/button';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { backendRequest } from '@/lib/backend-api';

type Conversation = {
  mobile: string;
  customerId: string | null;
  name: string | null;
  lastText: string | null;
  lastDirection: 'in' | 'out';
  lastAt: string | null;
  unread: number;
  windowOpen: boolean;
};

type ThreadMessage = { id: string; direction: 'in' | 'out'; text: string; kind: string | null; status: string | null; at: string };
type Thread = {
  customer: { id: string; name: string | null; phone: string | null; optOut: boolean };
  windowOpen: boolean;
  messages: ThreadMessage[];
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function InboxPage() {
  const { tenantId } = useMasterFilter();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const qc = useQueryClient();
  const threadEndRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({
    queryKey: ['inbox', tenantId],
    queryFn: ({ signal }) => backendRequest<Conversation[]>('/inbox', { tenantId, signal }),
    enabled: Boolean(tenantId),
    refetchInterval: 20_000, // light polling so new replies appear without a manual refresh
  });

  const thread = useQuery({
    queryKey: ['inbox-thread', tenantId, selected],
    queryFn: ({ signal }) => backendRequest<Thread>(`/inbox/${selected}`, { tenantId, signal }),
    enabled: Boolean(tenantId && selected),
    refetchInterval: 15_000,
  });

  const send = useMutation({
    mutationFn: (text: string) => backendRequest<{ ok: boolean }>(`/inbox/${selected}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
    onSuccess: () => {
      setDraft('');
      thread.refetch();
      qc.invalidateQueries({ queryKey: ['inbox', tenantId] });
    },
  });

  useAuthRedirect(conversations.error);
  // Keep the newest message in view when the thread loads or grows.
  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.data?.messages.length, selected]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (text) send.mutate(text);
  }

  const windowOpen = thread.data?.windowOpen ?? false;

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar2">
          <div>
            <h1 className="page-title">Inbox</h1>
            <p className="page-sub">WhatsApp replies from your players. Reply within 24 hours of their last message.</p>
          </div>
        </header>

        {!tenantId ? <div className="banner2">Select a company first.</div> : null}

        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 560 }}>
            {/* Conversation list */}
            <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', maxHeight: 640, overflowY: 'auto' }}>
              {conversations.isLoading ? <div className="empty2">Loading…</div> : null}
              {conversations.data?.length === 0 ? <div className="empty2"><MessageSquare size={20} /><div>No conversations yet. They appear when a player replies on WhatsApp.</div></div> : null}
              {conversations.data?.map((c) => {
                const active = selected === c.customerId;
                return (
                  <button
                    key={c.mobile}
                    onClick={() => c.customerId && setSelected(c.customerId)}
                    disabled={!c.customerId}
                    style={{
                      textAlign: 'left', border: 0, borderBottom: '1px solid var(--border-soft)', cursor: c.customerId ? 'pointer' : 'default',
                      background: active ? '#fff3e8' : 'transparent', padding: '12px 14px', display: 'grid', gap: 3,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <b style={{ fontSize: 13, color: '#1a1f36', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.mobile || 'Unknown'}</b>
                      <span style={{ fontSize: 10.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>{when(c.lastAt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#697386', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.lastDirection === 'out' ? '↩ ' : ''}{c.lastText || '—'}
                      </span>
                      {c.unread > 0 ? <span style={{ background: '#ff6b00', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>{c.unread}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Thread */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {!selected ? (
                <div className="empty2" style={{ margin: 'auto' }}><MessageSquare size={22} /><div>Pick a conversation to read and reply.</div></div>
              ) : (
                <>
                  <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                      <b style={{ fontSize: 14, color: '#1a1f36' }}>{thread.data?.customer.name || thread.data?.customer.phone || '…'}</b>
                      <div style={{ fontSize: 11.5, color: '#697386' }}>{thread.data?.customer.phone}</div>
                    </div>
                    {thread.data ? (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: windowOpen ? '#ecfdf3' : '#fef2f2', color: windowOpen ? '#15803d' : '#b91c1c' }}>
                        {windowOpen ? 'Session open' : '24h window closed'}
                      </span>
                    ) : null}
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, background: '#f6f9fc', minHeight: 320, maxHeight: 480 }}>
                    {thread.isLoading ? <div className="empty2">Loading…</div> : null}
                    {thread.data?.messages.map((m) => (
                      <div key={m.id} style={{ alignSelf: m.direction === 'in' ? 'flex-start' : 'flex-end', maxWidth: '72%' }}>
                        <div style={{
                          padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          background: m.direction === 'in' ? '#fff' : '#ff6b00', color: m.direction === 'in' ? '#1a1f36' : '#fff',
                          border: m.direction === 'in' ? '1px solid var(--border)' : 'none',
                        }}>{m.text}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textAlign: m.direction === 'in' ? 'left' : 'right' }}>
                          {when(m.at)}{m.direction === 'out' && m.status ? ` · ${m.status}` : ''}{m.kind && m.kind !== 'inbound' && m.kind !== 'reply' ? ` · ${m.kind}` : ''}
                        </div>
                      </div>
                    ))}
                    <div ref={threadEndRef} />
                  </div>

                  <form onSubmit={submit} style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }}
                      placeholder={windowOpen ? 'Type a reply… (Enter to send, Shift+Enter for newline)' : 'Window closed — you can only send an approved template now.'}
                      disabled={!windowOpen || thread.data?.customer.optOut}
                      rows={2}
                      style={{ flex: 1, resize: 'none', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', font: 'inherit', fontSize: 13, outline: 'none', background: windowOpen ? '#fff' : '#f6f8fb' }}
                    />
                    <Button type="submit" disabled={!windowOpen || !draft.trim() || send.isPending}>
                      <Send size={15} style={{ marginRight: 6 }} />{send.isPending ? 'Sending…' : 'Send'}
                    </Button>
                  </form>
                  {thread.data?.customer.optOut ? <div style={{ padding: '0 14px 12px', fontSize: 12, color: '#b91c1c' }}>This player has opted out of messages.</div> : null}
                  {send.error ? <div style={{ padding: '0 14px 12px', fontSize: 12, color: '#b91c1c' }}>{send.error instanceof Error ? send.error.message : 'Failed to send'}</div> : null}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
