"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

/** Why a sign-in didn't work, in the organiser's words. */
function reason(error: { status?: number; code?: string; message: string }): string {
  if (error.code === "invalid_credentials" || error.status === 400) return "That email and password don’t match.";
  if (error.status === 429) return "Too many tries. Wait a minute, then try again.";
  return "Couldn’t sign in. Check your connection and try again.";
}

export function SignInForm() {
  const id = useId();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setProblem(reason(error));
        setBusy(false);
        return;
      }
      // The planner, with the new session.
      router.replace("/plan");
      router.refresh();
    } catch {
      setProblem("Couldn’t sign in. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={signIn} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-email`} className="text-xs text-muted-foreground">
          Email
        </label>
        <Input
          id={`${id}-email`}
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-password`} className="text-xs text-muted-foreground">
          Password
        </label>
        <Input
          id={`${id}-password`}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {problem ? (
        <p id={`${id}-problem`} role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <Button type="submit" className="mt-1" disabled={busy || email.trim() === "" || password === ""}>
        {busy ? "Signing in…" : "Sign in"} {busy ? null : <ArrowRightIcon weight="bold" />}
      </Button>
    </form>
  );
}
