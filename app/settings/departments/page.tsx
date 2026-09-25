'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowDown, ArrowUp, Building2, Check, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { backendRequest, getSelectedTenantId } from '@/lib/backend-api';

type Department = { id: string; name: string; sortOrder: number; archivedAt: string | null };

export default function DepartmentsPage() {
  const tenantId = getSelectedTenantId();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const query = useQuery({ queryKey: ['departments', tenantId], queryFn: () => backendRequest<Department[]>('/departments'), enabled: Boolean(tenantId) });
  useAuthRedirect(query.error);
  const refresh = () => qc.invalidateQueries({ queryKey: ['departments', tenantId] });

  const create = useMutation({
    mutationFn: (value: string) => backendRequest('/departments', { method: 'POST', body: JSON.stringify({ name: value }) }),
    onSuccess: () => { setName(''); refresh(); },
  });
  const rename = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => backendRequest(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify({ name: value }) }),
    onSuccess: () => { setEditingId(null); refresh(); },
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => backendRequest(`/departments/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) }),
    onSuccess: refresh,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => backendRequest('/departments/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    onSuccess: refresh,
  });

  const error = query.error || create.error || rename.error || archive.error || reorder.error;
  const active = query.data?.filter((item) => !item.archivedAt) ?? [];
  const archived = query.data?.filter((item) => item.archivedAt) ?? [];

  function add(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...active];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((item) => item.id));
  }

  function startRename(item: Department) {
    setEditingId(item.id);
    setEditingName(item.name);
  }

  return <div className="shell">
    <Sidebar />
    <main className="main">
      <header className="topbar2"><div><h1 className="page-title">Departments</h1><p className="page-sub">Organize the teams used for profit distribution and budgets.</p></div></header>
      {!tenantId ? <div className="banner2">Select a company on the SaaS console first.</div> : null}
      {error ? <div className="banner2" role="alert">{error instanceof Error ? error.message : 'Could not update departments'}</div> : null}

      {tenantId ? <div className="department-layout">
        <section className="panel department-create">
          <div className="webhook-heading"><span><Plus size={20} /></span><div><h2>Add department</h2><p>Create the operating teams used in company planning.</p></div></div>
          <form onSubmit={add}>
            <label htmlFor="department-name">Department name</label>
            <input id="department-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Marketing" maxLength={100} required />
            <button className="btn-primary" disabled={create.isPending || !name.trim()}><Plus size={15} />{create.isPending ? 'Adding…' : 'Add department'}</button>
          </form>
        </section>

        <section className="panel department-list">
          <div className="webhook-heading"><span><Building2 size={20} /></span><div><h2>Active departments</h2><p>Use the arrows to control display order.</p></div></div>
          {query.isLoading ? <div className="empty2">Loading…</div> : null}
          {active.map((item, index) => <div className="department-row" key={item.id}>
            <span className="department-order">{index + 1}</span>
            {editingId === item.id ? <input className="department-edit" value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus maxLength={100} /> : <b>{item.name}</b>}
            <div className="department-actions">
              {editingId === item.id ? <>
                <button title="Save" disabled={!editingName.trim() || rename.isPending} onClick={() => rename.mutate({ id: item.id, value: editingName.trim() })}><Check size={15} /></button>
                <button title="Cancel" onClick={() => setEditingId(null)}><X size={15} /></button>
              </> : <button title="Rename" onClick={() => startRename(item)}><Pencil size={15} /></button>}
              <button title="Move up" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
              <button title="Move down" disabled={index === active.length - 1 || reorder.isPending} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
              <button className="danger" title="Archive" disabled={archive.isPending} onClick={() => archive.mutate({ id: item.id, archived: true })}><Archive size={15} /></button>
            </div>
          </div>)}
          {!query.isLoading && active.length === 0 ? <div className="empty2">No departments yet. Add your first department.</div> : null}
        </section>

        {archived.length ? <section className="panel department-archived">
          <div className="panel-head"><h3>Archived departments</h3><span className="panel-tag">{archived.length}</span></div>
          {archived.map((item) => <div className="department-row archived" key={item.id}><Archive size={16} /><b>{item.name}</b><button className="btn-ghost" disabled={archive.isPending} onClick={() => archive.mutate({ id: item.id, archived: false })}><RotateCcw size={14} /> Restore</button></div>)}
        </section> : null}
      </div> : null}
    </main>
  </div>;
}
