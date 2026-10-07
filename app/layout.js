import { Newsreader } from 'next/font/google'
import './globals.css'

const display = Newsreader({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-display',
})

export const metadata = {
  title: 'Bluff Fly a Fan · Sep 2026',
  description: 'Drawing list and winner draw for the Fly a Fan sweepstakes.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  )
}
