import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { del, errorMessage, getPaged, patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtAgo, fmtDate } from '../lib/format';
import type { Role, User } from '../lib/types';
import { ConfirmDialog, EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui';

export default function TeamPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<User | null>(null);
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => getPaged<User>('/users', { limit: 100, sort: 'name' }) });

  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<Pick<User, 'role' | 'is_active'>> }) => patch<User>(`/users/${id}`, body), onSuccess: (u) => { toast.success(`${u.name} updated.`); void qc.invalidateQueries({ queryKey: ['users'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({ mutationFn: (id: number) => del(`/users/${id}`), onSuccess: () => { toast.success('Account deleted.'); setDeleting(null); void qc.invalidateQueries({ queryKey: ['users'] }); }, onError: (e) => toast.error(errorMessage(e)) });

  return (
    <div>
      <PageHeader title="Team" description="Who can sign in and what they can do. Admins manage everything, engineers operate the fleet, viewers read only." />
      <div className="panel overflow-hidden">
        {users.isLoading ? <Spinner /> : users.isError ? <div className="p-5"><ErrorNote message={errorMessage(users.error)} /></div> : users.data!.data.length === 0 ? <EmptyState title="No accounts yet" /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Last sign-in</th><th>Joined</th><th /></tr></thead>
            <tbody>{users.data!.data.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td className="font-medium text-pine">{u.name}{self && <span className="ml-2 chip bg-moss text-pine">You</span>}</td>
                  <td className="text-ink-muted">{u.email}</td>
                  <td><select className="field w-auto py-1.5" value={u.role} disabled={self || update.isPending} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })} aria-label={`Role for ${u.name}`}><option value="admin">Admin</option><option value="engineer">Engineer</option><option value="viewer">Viewer</option></select></td>
                  <td><label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-pine" checked={u.is_active} disabled={self || update.isPending} onChange={(e) => update.mutate({ id: u.id, body: { is_active: e.target.checked } })} aria-label={`Active for ${u.name}`} /><span className="text-[13px] text-ink-muted">{u.is_active ? 'Active' : 'Deactivated'}</span></label></td>
                  <td className="text-ink-muted">{u.last_login_at ? fmtAgo(u.last_login_at) : 'Never'}</td>
                  <td className="tabular text-ink-muted">{fmtDate(u.created_at)}</td>
                  <td className="text-right">{!self && <button className="btn btn-ghost btn-sm text-ember" onClick={() => setDeleting(u)}>Delete</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
      <ConfirmDialog open={!!deleting} title={`Delete ${deleting?.name}'s account?`} message="They will be signed out everywhere and their work orders become unassigned." onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} busy={remove.isPending} />
    </div>
  );
}
