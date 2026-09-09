import { redirect } from "next/navigation";
import { getCustomerToken } from "@/lib/session";
import { loginAction } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCustomerToken()) redirect("/");
  const { error } = await searchParams;
  return <main className="login-wrap"><section className="panel login-card stack"><div><p className="eyebrow">Customer account</p><h1 style={{fontSize:"2.3rem"}}>Sign in</h1><p className="muted">Use your Magento customer account. Your company, catalogue and pricing are loaded from Fluid GraphQL after sign in.</p></div>{error ? <div className="error">{error}</div> : null}<form action={loginAction} className="stack"><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div><button className="button" type="submit">Sign in</button></form></section></main>;
}
