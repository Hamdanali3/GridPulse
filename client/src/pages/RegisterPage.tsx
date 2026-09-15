import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import AuthShell from './AuthShell';
import { useAuth } from '../lib/auth';
import { errorMessage, fieldErrors } from '../lib/api';
import { ErrorNote, Field } from '../components/ui';

const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters.').max(80),
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters.').regex(/[A-Za-z]/, 'Add at least one letter.').regex(/[0-9]/, 'Add at least one number.'),
    password_confirmation: z.string(),
  })
  .refine((v) => v.password === v.password_confirmation, { message: 'Passwords do not match.', path: ['password_confirmation'] });
type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Form) => {
    setServerError(null);
    try {
      const user = await signUp(values.name, values.email, values.password, values.password_confirmation);
      toast.success(user.role === 'admin' ? 'Workspace created. You are the admin.' : 'Account created. An admin can raise your role.');
      navigate('/', { replace: true });
    } catch (err) {
      const fe = fieldErrors(err);
      for (const [k, v] of Object.entries(fe)) setError(k as keyof Form, { message: v });
      if (Object.keys(fe).length === 0) setServerError(errorMessage(err));
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="The first account becomes the workspace admin. Later accounts start as viewers." footer={<>Already have an account? <Link to="/login" className="font-medium text-teal underline-offset-2 hover:underline">Sign in</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && <ErrorNote message={serverError} />}
        <Field label="Full name" error={errors.name?.message}>
          <input className="field" autoComplete="name" placeholder="Amara Okafor" aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input className="field" type="email" autoComplete="email" placeholder="you@company.com" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters with a letter and a number.">
          <input className="field" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <Field label="Confirm password" error={errors.password_confirmation?.message}>
          <input className="field" type="password" autoComplete="new-password" aria-invalid={!!errors.password_confirmation} {...register('password_confirmation')} />
        </Field>
        <button className="btn btn-primary w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
