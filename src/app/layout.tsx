import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google"
import { headers } from "next/headers"
import { connection } from "next/server"
import { themeBootScript } from "@/lib/theme-script"
import { Providers } from "@/components/providers"
import { providerMode } from "@/server/config"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" })
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
})
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" })

export const metadata: Metadata = {
  title: { default: "Arcellite Deploy", template: "%s · Arcellite Deploy" },
  description: "Deploy applications to infrastructure you control.",
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request so the CSP nonce from src/proxy.ts applies.
  await connection()
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${display.variable} ${mono.variable} h-full`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full font-sans antialiased">
        <Providers mode={providerMode()}>{children}</Providers>
      </body>
    </html>
  )
}
