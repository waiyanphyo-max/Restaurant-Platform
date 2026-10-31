import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="shell">
      <div className="eyebrow">Restaurant Platform</div>
      <h1>Platform Admin sign-in</h1>
      <p>Sign in with your existing Supabase Auth account. Spring Boot verifies platform access.</p>
      <LoginForm />
    </main>
  );
}
