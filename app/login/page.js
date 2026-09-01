"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-navy py-3 font-semibold text-white transition hover:bg-navy-light disabled:opacity-60"
    >
      {pending ? "Connexion..." : "Se connecter"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(signIn, { error: null });

  return (
    <main className="flex min-h-screen items-center justify-center bg-sand px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-cardinal" aria-hidden />
          <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
            Sport Famille
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            Calendriers, résultats et diplômes de Candice, Amandine et Julia.
          </p>
        </div>

        <form action={formAction} className="space-y-4 rounded-card bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-semibold text-ink">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-ink/15 px-3 py-2 outline-none focus:border-navy"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-semibold text-ink">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-ink/15 px-3 py-2 outline-none focus:border-navy"
            />
          </div>

          {state?.error && (
            <p className="rounded-lg bg-cardinal-light px-3 py-2 text-sm text-cardinal-dark">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>

        <p className="mt-6 text-center text-xs text-ink/40">
          Accès réservé à la famille. Compte créé depuis Supabase.
        </p>
      </div>
    </main>
  );
}
