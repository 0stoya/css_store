"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setPasswordAction, INITIAL_PASSWORD_SETUP_RESULT } from "./actions";

export function ResetPasswordForm({ email, token }: { email: string; token: string }) {
  const [state, action, pending] = useActionState(setPasswordAction, INITIAL_PASSWORD_SETUP_RESULT);

  if (state.success) {
    return <div className="stack" role="status">
      <p>Your password has been set. You can now sign in with your email address.</p>
      <Link className="button" href="/login">Sign in</Link>
    </div>;
  }

  return <form action={action} className="stack login-form" autoComplete="on">
    <input type="hidden" name="resetPasswordToken" value={token} />
    <label className="field" htmlFor="setupEmail">
      <span>Email address</span>
      <input id="setupEmail" name="email" type="email" defaultValue={email} maxLength={254} autoComplete="email" autoCapitalize="none" required />
    </label>
    <label className="field" htmlFor="setupPassword">
      <span>New password</span>
      <input id="setupPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={256} required />
    </label>
    <label className="field" htmlFor="setupConfirmPassword">
      <span>Confirm password</span>
      <input id="setupConfirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={256} required />
    </label>
    {state.error ? <p className="error" role="alert">{state.error}</p> : null}
    <button className="button" type="submit" disabled={pending}>{pending ? "Setting password…" : "Set password"}</button>
  </form>;
}
