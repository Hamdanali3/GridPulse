import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { errorMessage, fieldErrors, patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { Field, PageHeader, Panel } from '../components/ui';

const profileSchema = z.object({ name: z.string().min(2, 'Name must be at least 2 characters.').max(80) });
const passwordSchema = z.object({
  current_password: z.string().min(1, 'Enter your current password.'),
  password: z.string().min(8, 'At least 8 characters.').regex(/[A-Za-z]/, 'Add a letter.').regex(/[0-9]/, 'Add a number.'),
  password_confirmation: z.string(),
}).refine((v) => v.password === v.password_confirmation, { message: 'Passwords do not match.', path: ['password_confirmation'] });

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const profile = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), values: { name: user?.name ?? '' } });
  const password = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });

  const saveProfile = profile.handleSubmit(async (v) => {
    try { const u = await patch<User>('/auth/me', v); setUser(u); toast.success('Profile updated.'); } catch (e) { toast.error(errorMessage(e)); }
  });
  const savePassword = password.handleSubmit(async (v) => {
    try { await patch('/auth/me/password', v); password.reset(); toast.success('Password changed. Other devices were signed out.'); } catch (e) { const fe = fieldErrors(e); for (const [k, m] of Object.entries(fe)) password.setError(k as 'current_password', { message: m }); if (!Object.keys(fe).length) toast.error(errorMessage(e)); }
  });

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Your account details. Roles are managed by an admin on the Team page." />
      <div className="space-y-4">
        <Panel title="Profile">
          <form onSubmit={saveProfile} className="space-y-4" noValidate>
            <Field label="Full name" error={profile.formState.errors.name?.message}><input className="field" {...profile.register('name')} /></Field>
            <Field label="Email" hint="Email cannot be changed here."><input className="field" value={user?.email ?? ''} disabled /></Field>
            <Field label="Role"><input className="field capitalize" value={user?.role ?? ''} disabled /></Field>
            <div className="flex justify-end"><button className="btn btn-primary" type="submit" disabled={profile.formState.isSubmitting}>Save changes</button></div>
          </form>
        </Panel>
        <Panel title="Password">
          <form onSubmit={savePassword} className="space-y-4" noValidate>
            <Field label="Current password" error={password.formState.errors.current_password?.message}><input className="field" type="password" autoComplete="current-password" {...password.register('current_password')} /></Field>
            <Field label="New password" error={password.formState.errors.password?.message} hint="At least 8 characters with a letter and a number."><input className="field" type="password" autoComplete="new-password" {...password.register('password')} /></Field>
            <Field label="Confirm new password" error={password.formState.errors.password_confirmation?.message}><input className="field" type="password" autoComplete="new-password" {...password.register('password_confirmation')} /></Field>
            <div className="flex justify-end"><button className="btn btn-primary" type="submit" disabled={password.formState.isSubmitting}>Change password</button></div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
