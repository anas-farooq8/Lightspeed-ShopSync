import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Lightspeed Sync Tool',
  description: 'Monitor product variant synchronization across regions',
  icons: {
    icon: [
      {
        url: 'https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=32',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: 'https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=64',
        sizes: '64x64',
        type: 'image/png',
      },
    ],
    apple: {
      url: 'https://www.google.com/s2/favicons?domain=lightspeedhq.com&sz=180',
      sizes: '180x180',
      type: 'image/png',
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
