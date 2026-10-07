'use client'

import { useEffect, useRef, useState } from 'react'
import Wheel, { landingRotation } from './Wheel'

const PAGE = 1000

function money(value) {
  return Number(value || 0).toLocaleString()
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [at, setAt] = useState(1)
  const [lineRows, setLineRows] = useState([])
  const [lineMeta, setLineMeta] = useState({ total: 0, empty: '' })
  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState('idle')
  const [winner, setWinner] = useState(null)
  const [drawError, setDrawError] = useState('')
  const spinning = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/summary')
      .then((response) => {
        if (!response.ok) throw new Error('The drawing list could not be loaded.')
        return response.json()
      })
      .then((payload) => {
        if (!cancelled) setSummary(payload)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!summary) return undefined
    let cancelled = false
    fetch(`/api/lines?at=${encodeURIComponent(at)}&limit=${PAGE}`)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return
        setLineRows(payload.rows || [])
        setLineMeta({ total: payload.total, empty: payload.rows?.length ? '' : 'No lines in this range.' })
      })
    return () => { cancelled = true }
  }, [summary, at])

  async function draw() {
    if (spinning.current) return
    spinning.current = true
    setPhase('spinning')
    setWinner(null)
    setDrawError('')
    try {
      const response = await fetch('/api/draw', { method: 'POST' })
      if (!response.ok) throw new Error('The draw could not be completed.')
      const payload = await response.json()
      setRotation((current) => landingRotation(current, payload.winner.line, summary.totalLines))
      setWinner(payload.winner)
    } catch (drawFailure) {
      spinning.current = false
      setPhase('idle')
      setDrawError(drawFailure.message)
    }
  }

  const lastLine = lineRows.length ? lineRows[lineRows.length - 1].line : 0
  const displayName = winner?.name || winner?.email || ''

  return (
    <>
    <header className="brand">
      <img src="/bluff-logo.png" alt="Bluff" />
    </header>
    <main>
      <h1>Bluff Fly a Fan</h1>
      {error && <p className="error">{error}</p>}
      <section className="panel">
        <div className="stage">
          <div className="wheel-column">
            <Wheel
              totalLines={summary?.totalLines || 0}
              rotation={rotation}
              lockLine={phase === 'landed' ? winner?.line : null}
              onSettled={() => {
                spinning.current = false
                setPhase((current) => (current === 'spinning' ? 'landed' : current))
              }}
            />
            <button className="draw-button" type="button" onClick={draw} disabled={!summary || phase === 'spinning'}>
              {phase === 'spinning' ? 'Spinning…' : 'Draw winner'}
            </button>
            {summary && <p className="draw-note">Each of the {money(summary.totalLines)} purchase lines has the same chance.</p>}
            {drawError && <p className="error">{drawError}</p>}
          </div>
          {phase === 'landed' && winner ? (
            <article className="winner-card">
              <p className="eyebrow">Winner</p>
              <h2 className="winner-name">{displayName}</h2>
              {winner.email && <p className="winner-email">{winner.email}</p>}
            </article>
          ) : (
            <article className="winner-card waiting">
              Draw one winner from the purchase list. Their name appears when the wheel stops.
            </article>
          )}
        </div>

        <table id="line-table">
          <thead>
            <tr><th className="num">Line</th><th>Email</th><th>Name</th><th>Phone</th></tr>
          </thead>
          <tbody>
            {lineRows.length === 0 && (
              <tr><td className="empty" colSpan="4">{lineMeta.empty || 'Loading lines…'}</td></tr>
            )}
            {lineRows.map((item) => (
              <tr key={item.line}>
                <td className="num">{money(item.line)}</td>
                <td>{item.email}</td>
                <td>{item.name}</td>
                <td>{item.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pager">
          <button className="nav" type="button" disabled={at <= 1} onClick={() => setAt(Math.max(1, at - PAGE))}>Previous</button>
          <span>
            {lineRows.length ? `${money(lineRows[0].line)}–${money(lastLine)} of ${money(lineMeta.total)}` : ''}
          </span>
          <button className="nav" type="button" disabled={!lineRows.length || lastLine >= lineMeta.total} onClick={() => setAt(at + PAGE)}>Next</button>
        </div>
        <p className="note">
          Sheets, Excel, and Numbers stop around one million rows. This page keeps all {summary ? money(summary.totalLines) : ''} purchase lines.
        </p>
      </section>
    </main>
    </>
  )
}
