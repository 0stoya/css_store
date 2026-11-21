import Image from "next/image";
import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Set your password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function safeParam(value: string | string[] | undefined, maxLength: number) {
  return typeof value === "string" && value.length <= maxLength ? value : "";
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[]; token?: string | string[] }>;
}) {
  const params = await searchParams;
  const email = safeParam(params.email, 254);
  const token = safeParam(params.token, 255);

  return <main className="login-page">
    <section className="login-shell" aria-labelledby="password-setup-heading">
      <div className="login-brand-panel">
        <Image className="login-logo" src="/css-logo.png" alt="Chelmsford Safety Supplies" width={420} height={112} priority />
        <div className="login-welcome"><h2>Welcome to your account</h2></div>
      </div>
      <div className="login-form-panel">
        <div className="login-form-content">
          <header className="login-form-header">
            <p className="eyebrow">Account access</p>
            <h1 id="password-setup-heading">Set your password</h1>
            <p>Use the secure link in your invitation to complete your account setup.</p>
          </header>
          {token
            ? <ResetPasswordForm email={email} token={token} />
            : <div className="stack">
                <p className="error" role="alert">Your password setup link is missing or incomplete. Ask your company administrator to send a new invitation.</p>
                <Link href="/login">Back to sign in</Link>
              </div>}
        </div>
      </div>
    </section>
  </main>;
}
