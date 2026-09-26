import { permanentRedirect } from "next/navigation"

/** Jobs was renamed to Pipelines; keep old links working. */
export default function Page() {
  permanentRedirect("/pipelines")
}
