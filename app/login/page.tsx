import Image from "next/image";
import { redirect } from "next/navigation";
import { getCustomerToken } from "@/lib/session";
import { loginAction } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCustomerToken()) redirect("/");
  const { error } = await searchParams;

  return <main className="login-page">
    <section className="login-shell" aria-labelledby="login-heading">
      <div className="login-brand-panel">
        <Image
          className="login-logo"
          src="/css-logo.png"
          alt="Chelmsford Safety Supplies"
          width={420}
          height={112}
          priority
        />
        <div className="login-welcome">
          <h2>Welcome to your account</h2>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-form-content">
          <header className="login-form-header">
            <p className="eyebrow">Account access</p>
            <h1 id="login-heading">Sign in</h1>
            <p>Use your email address and password.</p>
          </header>

          {error ? <div className="error" role="alert">{error}</div> : null}

          <form action={loginAction} className="stack login-form">
            <label className="field" htmlFor="email">
              <span>Email address</span>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                inputMode="email"
                required
              />
            </label>
            <label className="field" htmlFor="password">
              <span>Password</span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="button" type="submit">Sign in</button>
          </form>
        </div>
      </div>
    </section>
  </main>;
}
