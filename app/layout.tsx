import type React from "react"
import type { Metadata } from "next"
import "./globals.css"

// Update the title in the metadata
export const metadata: Metadata = {
  title: "Road Map",
  description: "Created with v0",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
