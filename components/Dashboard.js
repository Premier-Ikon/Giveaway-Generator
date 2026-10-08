'use client'

import { useEffect, useRef, useState } from 'react'
import Confetti from './Confetti'
import Wheel, { landingRotation } from './Wheel'
import { DRAWING_API } from '../lib/drawingApi'

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
  const [count, setCount] = useState(3)
  const spinning = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${DRAWING_API}/summary`)
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
    if (phase !== 'countdown' && phase !== 'landed') return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [phase])

  useEffect(() => {
    if (phase !== 'countdown') return undefined
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 900
    const timer = setTimeout(() => {
      setCount((value) => {
        if (value <= 1) {
          setPhase('landed')
          return 3
        }
        return value - 1
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [phase, count])

  useEffect(() => {
    if (!summary) return undefined
    let cancelled = false
    fetch(`${DRAWING_API}/lines?at=${encodeURIComponent(at)}&limit=${PAGE}`)
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
      const response = await fetch(`${DRAWING_API}/draw`, { method: 'POST' })
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
  const displayName = winner?.name || winner?.id || ''

  return (
    <>
    <header className="brand">
      <img src="/bluff-logo.png" alt="Bluff" />
    </header>
    <main>
      <div className="total">
        <strong>{summary ? money(summary.totalLines) : '—'}</strong>
        <span>Total entries</span>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="panel">
        <div className="stage">
          <div className="wheel-column">
            <Wheel
              rotation={rotation}
              onSettled={() => {
                spinning.current = false
                setPhase((current) => {
                  if (current !== 'spinning') return current
                  setCount(3)
                  return 'countdown'
                })
              }}
            />
            <button className="draw-button" type="button" onClick={draw} disabled={!summary || phase === 'spinning' || phase === 'countdown'}>
              {phase === 'spinning' || phase === 'countdown' ? 'Drawing…' : 'Draw winner'}
            </button>
            {drawError && <p className="error">{drawError}</p>}
          </div>
        </div>

        <table id="line-table">
          <thead>
            <tr><th className="num">Line</th><th>Name</th><th>Source</th></tr>
          </thead>
          <tbody>
            {lineRows.length === 0 && (
              <tr><td className="empty" colSpan="3">{lineMeta.empty || 'Loading lines…'}</td></tr>
            )}
            {lineRows.map((item) => (
              <tr key={item.line}>
                <td className="num">{money(item.line)}</td>
                <td>{item.name || item.id}</td>
                <td>{item.source}</td>
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
          This page keeps all {summary ? money(summary.totalLines) : ''} entry lines, shuffled so both sources are mixed through the list. Gotbluff shows the Shopify customer name. Spin quest shows the entry id.
        </p>
      </section>
    </main>
    {phase === 'countdown' && (
      <div className="reveal" role="dialog" aria-modal="true" aria-label="Countdown">
        <p className="countdown">{count}</p>
      </div>
    )}
    {phase === 'landed' && winner && (
      <div className="reveal" role="dialog" aria-modal="true" aria-label="Winner" onClick={() => setPhase('idle')}>
        <Confetti />
        <article className="reveal-card" onClick={(event) => event.stopPropagation()}>
          <p className="reveal-kicker">Congrats</p>
          <h2 className="reveal-name">{displayName.includes('@') ? <>{displayName.split('@')[0]}<wbr />@{displayName.split('@').slice(1).join('@')}</> : displayName}</h2>
          {winner.source && <p className="reveal-source">{winner.source}</p>}
          <button className="reveal-close" type="button" onClick={() => setPhase('idle')}>Close</button>
        </article>
      </div>
    )}
    </>
  )
}
