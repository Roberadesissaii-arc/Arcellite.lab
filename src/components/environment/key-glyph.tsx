import { Braces, Hash, KeyRound, Link2 } from "lucide-react"

/** A small glyph that hints at what a variable holds: a credential, an address, a number, or plain config. */
export function KeyGlyph({ name, secret }: { name: string; secret: boolean }) {
  const kind = secret ? "secret" : /URL|HOST|DOMAIN|ENDPOINT|ORIGIN/.test(name) ? "url" : /PORT|COUNT|SIZE|LIMIT|TIMEOUT|MAX|MIN/.test(name) ? "number" : "config"
  return (
    <span className="env-glyph" data-kind={kind} aria-hidden>
      {kind === "secret" ? <KeyRound /> : kind === "url" ? <Link2 /> : kind === "number" ? <Hash /> : <Braces />}
    </span>
  )
}
