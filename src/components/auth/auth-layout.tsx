import { KeyRound, ShieldCheck, Workflow } from "lucide-react"
import { ArcelliteMark } from "@/components/brand"

function Brand() {
  return (
    <div className="auth-brand">
      <ArcelliteMark />
      <strong>Arcellite</strong>
      <span>Deploy</span>
    </div>
  )
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-rail">
        <Brand />
        <div>
          <h2>The control plane for infrastructure you own.</h2>
          <p>Projects, settings, and encrypted environment variables are stored on this server, in its own database.</p>
        </div>
        <ul className="auth-facts">
          <li><ShieldCheck aria-hidden />Passwords are hashed with Argon2id. Sessions are revocable and expire.</li>
          <li><KeyRound aria-hidden />Every environment value is encrypted at rest. Secrets need your password to show again.</li>
          <li><Workflow aria-hidden />Deployments, servers, and domains are not connected yet.</li>
        </ul>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <Brand />
          {children}
        </div>
      </main>
    </div>
  )
}
