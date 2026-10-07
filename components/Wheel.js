'use client'

import { useEffect, useRef, useState } from 'react'

const TICKS = 1440

export function landingRotation(currentRotation, line, totalLines) {
  const angle = ((line - 0.5) / totalLines) * 360
  const turns = Math.floor(currentRotation / 360) + 8
  return turns * 360 - angle
}

function lineAtRotation(rotation, totalLines) {
  const turns = ((rotation % 360) + 360) % 360
  const fraction = ((360 - turns) % 360) / 360
  return Math.min(totalLines, Math.max(1, Math.floor(fraction * totalLines) + 1))
}

function degreesFromTransform(transform) {
  if (!transform || transform === 'none') return 0
  const matched = transform.match(/matrix\(([^)]+)\)/)
  if (!matched) return 0
  const [a, b] = matched[1].split(',').map((value) => Number(value))
  return Math.atan2(b, a) * (180 / Math.PI)
}

function formatLine(line) {
  return Number(line || 0).toLocaleString()
}

export default function Wheel({ totalLines, rotation, lockLine, onSettled }) {
  const canvasRef = useRef(null)
  const wheelRef = useRef(null)
  const [shownLine, setShownLine] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const size = 720
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    const center = size / 2
    const outer = size / 2 - 4
    const inner = outer - 78
    for (let index = 0; index < TICKS; index += 1) {
      const start = (index / TICKS) * Math.PI * 2 - Math.PI / 2
      const end = ((index + 1) / TICKS) * Math.PI * 2 - Math.PI / 2
      context.beginPath()
      context.arc(center, center, (outer + inner) / 2, start, end)
      context.lineWidth = outer - inner
      context.strokeStyle = index % 2 === 0 ? '#1d1d1f' : '#ececee'
      context.stroke()
    }
    return undefined
  }, [])

  useEffect(() => {
    if (lockLine) {
      setShownLine(lockLine)
      return undefined
    }
    if (!totalLines || !rotation) {
      setShownLine(1)
      return undefined
    }
    let frame = 0
    const tick = () => {
      const transform = wheelRef.current
        ? getComputedStyle(wheelRef.current).transform
        : 'none'
      setShownLine(lineAtRotation(degreesFromTransform(transform), totalLines))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [lockLine, totalLines, rotation])

  return (
    <div className="wheel-wrap">
      <div className="pointer" />
      <div className="line-readout">{formatLine(shownLine)}</div>
      <div
        ref={wheelRef}
        className="wheel"
        style={{ transform: `rotate(${rotation}deg)` }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform') onSettled()
        }}
      >
        <canvas ref={canvasRef} className="disc" />
        <div className="hub" />
      </div>
    </div>
  )
}
