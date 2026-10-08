import { Montserrat, Newsreader } from 'next/font/google'
import './globals.css'

const display = Newsreader({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-display',
})

const brand = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-brand',
})

export const metadata = {
  title: 'Bluff Fly a Fan · Sep 2026',
  description: 'Drawing list and winner draw for the Fly a Fan sweepstakes.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${brand.variable}`}>
      <body>{children}</body>
    </html>
  )
}
