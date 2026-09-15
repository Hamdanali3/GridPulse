import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import AuthShell from './AuthShell';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { ErrorNote, Field } from '../components/ui';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Form = z.infer<typeof schema>;

const demo = [
  { role: 'Admin', email: 'admin@gridpulse.io', password: 'Admin12345' },
  { role: 'Engineer', email: 'engineer@gridpulse.io', password: 'Engineer12345' },
  { role: 'Viewer', email: 'viewer@gridpulse.io', password: 'Viewer12345' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Form) => {
    setServerError(null);
    try {
      const user = await login(values.email, values.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`);
      navigate((location.state as { from?: string })?.from ?? '/', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Use your GridPulse account to open the control room." footer={<>New here? <Link to="/register" className="font-medium text-teal underline-offset-2 hover:underline">Create an account</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && <ErrorNote message={serverError} />}
        <Field label="Email" error={errors.email?.message}>
          <input className="field" type="email" autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input className="field" type="password" autoComplete="current-password" placeholder="••••••••" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <button className="btn btn-primary w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-8 rounded-panel border border-line bg-paper p-4">
        <p className="text-[13px] font-medium text-pine">Demo accounts</p>
        <p className="mb-3 text-[12.5px] text-ink-muted">Click one to fill the form. Each role sees a different set of controls.</p>
        <div className="flex flex-wrap gap-2">
          {demo.map((d) => (
            <button key={d.email} type="button" className="btn btn-secondary btn-sm" onClick={() => { setValue('email', d.email); setValue('password', d.password); }}>
              {d.role}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
