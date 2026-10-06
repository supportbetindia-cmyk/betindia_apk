'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, Trash2, UsersRound } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { BackendApiError, backendRequest, getSelectedTenantId } from '@/lib/backend-api';

const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'] as const;
type Role = typeof ROLES[number];
type Member = {
  id: string;
  role: Role;
  status: 'ACTIVE' | 'INVITED';
  masterIds: string[];
  createdAt: string;
  user: { id: string; email: string; name: string | null };
};

export default function TeamPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenantId = getSelectedTenantId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('VIEWER');
  const [masterIds, setMasterIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');

  const masters = useQuery({
    queryKey: ['masters', tenantId],
    queryFn: () => backendRequest<string[] | { masters: string[] }>('/customers/masters'),
    enabled: Boolean(tenantId),
    select: (data) => (Array.isArray(data) ? data : data.masters),
  });

  const team = useQuery({
    queryKey: ['team', tenantId],
    queryFn: () => backendRequest<Member[]>('/team'),
    enabled: Boolean(tenantId),
  });

  const invite = useMutation({
    mutationFn: () => backendRequest<Member & { emailSent: boolean }>('/team/invite', {
      method: 'POST', body: JSON.stringify({ email: email.trim(), role, masterIds }),
    }),
    onSuccess: (member) => {
      setEmail('');
      setRole('VIEWER');
      setMasterIds([]);
      setNotice(member.emailSent ? 'Invitation email sent.' : member.status === 'ACTIVE' ? 'Existing user added to the team.' : 'Invitation saved. Configure the Supabase service-role key to send invitation emails.');
      queryClient.invalidateQueries({ queryKey: ['team', tenantId] });
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ id, nextRole }: { id: string; nextRole: Role }) => backendRequest(`/team/${id}/role`, {
      method: 'PATCH', body: JSON.stringify({ role: nextRole }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', tenantId] }),
  });

  const changeMasters = useMutation({
    mutationFn: ({ id, ids }: { id: string; ids: string[] }) => backendRequest(`/team/${id}/masters`, {
      method: 'PATCH', body: JSON.stringify({ masterIds: ids }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', tenantId] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => backendRequest(`/team/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', tenantId] }),
  });

  const error = team.error || invite.error || changeRole.error || changeMasters.error || remove.error;
  useEffect(() => {
    if (error instanceof BackendApiError && error.status === 401) router.replace('/saas-login');
  }, [error, router]);

  function removeMember(member: Member) {
    if (window.confirm(`Remove ${member.user.email} from this company?`)) remove.mutate(member.id);
  }

  return <div className="shell">
    <Sidebar />
    <main className="main">
      <header className="topbar2"><div><h1 className="page-title">Team</h1><p className="page-sub">Invite people and control what they can do in this company.</p></div></header>
      {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}
      {error ? <div className="banner2" role="alert">{error instanceof Error ? error.message : 'Could not update the team'}</div> : null}
      {notice ? <div className="banner2 banner-ok">{notice}</div> : null}

      {tenantId ? <div className="team-layout">
        <section className="panel team-invite">
          <div className="webhook-heading"><span><MailPlus size={20} /></span><div><h2>Invite a team member</h2><p>They will join only this company.</p></div></div>
          <form onSubmit={(event) => { event.preventDefault(); setNotice(''); invite.mutate(); }}>
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" required /></label>
            <label>Role<select value={role} onChange={(event) => setRole(event.target.value as Role)}>{ROLES.map((value) => <option key={value} value={value}>{roleName(value)}</option>)}</select></label>
            {role !== 'OWNER' ? <div className="team-field">Master access<MasterPicker options={masters.data ?? []} value={masterIds} onChange={setMasterIds} /></div> : null}
            <button className="btn-primary" disabled={invite.isPending || !email.trim()}>{invite.isPending ? 'Inviting…' : 'Send invitation'}</button>
          </form>
          <div className="team-role-help"><b>Owner</b> full control · <b>Admin</b> manages operations and users · <b>Manager</b> manages customers and transactions · <b>Viewer</b> read-only<br />Members limited to specific masters see only the players and numbers of those masters. Owners always see everything.</div>
        </section>

        <section className="panel team-list">
          <div className="webhook-heading"><span><UsersRound size={20} /></span><div><h2>Company members</h2><p>{team.data?.length ?? 0} people and pending invitations</p></div></div>
          {team.isLoading ? <div className="empty2">Loading…</div> : null}
          {team.data?.map((member) => <div className="team-row" key={member.id}>
            <div className="team-avatar">{member.user.email.slice(0, 1).toUpperCase()}</div>
            <div className="team-person"><b>{member.user.name || member.user.email}</b>{member.user.name ? <span>{member.user.email}</span> : null}</div>
            <span className={`team-status ${member.status.toLowerCase()}`}>{member.status === 'ACTIVE' ? 'Active' : 'Invited'}</span>
            {member.role === 'OWNER' ? <span className="team-masters-all">All masters</span>
              : <MasterPicker options={masters.data ?? []} value={member.masterIds} disabled={changeMasters.isPending} onChange={(ids) => changeMasters.mutate({ id: member.id, ids })} />}
            <select aria-label={`Role for ${member.user.email}`} value={member.role} disabled={changeRole.isPending} onChange={(event) => changeRole.mutate({ id: member.id, nextRole: event.target.value as Role })}>
              {ROLES.map((value) => <option key={value} value={value}>{roleName(value)}</option>)}
            </select>
            <button className="team-remove" onClick={() => removeMember(member)} disabled={remove.isPending} aria-label={`Remove ${member.user.email}`}><Trash2 size={16} /></button>
          </div>)}
          {team.data?.length === 0 ? <div className="empty2">No team members yet.</div> : null}
        </section>
      </div> : null}
    </main>
  </div>;
}

// Native <details> dropdown of master checkboxes. Nothing ticked = all masters.
function MasterPicker({ options, value, onChange, disabled }: { options: string[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const all = [...new Set([...options, ...value])];
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return <details className="master-picker">
    <summary>{value.length ? value.join(', ') : 'All masters'}</summary>
    <div>
      {all.length === 0 ? <small>No masters found yet.</small> : null}
      {all.map((id) => <label key={id}><input type="checkbox" checked={value.includes(id)} disabled={disabled} onChange={() => toggle(id)} />{id}</label>)}
      {value.length ? <button type="button" disabled={disabled} onClick={() => onChange([])}>Allow all masters</button> : null}
    </div>
  </details>;
}

function roleName(role: Role) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
