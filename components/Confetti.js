'use client'

import { useEffect, useRef } from 'react'

const COLORS = ['#1d1d1f', '#ffffff', '#c8102e', '#f4f4f5', '#8d8d92']

export default function Confetti() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return undefined
    const context = canvas.getContext('2d')
    const parent = canvas.parentElement
    let frame = 0
    const pieces = []

    function resize() {
      const width = parent.clientWidth
      const height = parent.clientHeight
      canvas.width = width
      canvas.height = height
      return { width, height }
    }

    function seed(width, height) {
      pieces.length = 0
      for (let index = 0; index < 180; index += 1) {
        const angle = Math.random() * Math.PI * 2
        const speed = 7 + Math.random() * 12
        pieces.push({
          x: width / 2 + (Math.random() - 0.5) * 80,
          y: height / 2 - 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4,
          w: 7 + Math.random() * 8,
          h: 10 + Math.random() * 10,
          rot: Math.random() * Math.PI,
          vr: -0.18 + Math.random() * 0.36,
          color: COLORS[index % COLORS.length],
        })
      }
    }

    function tick() {
      const { width, height } = resize()
      if (!pieces.length) {
        if (width > 0 && height > 0) seed(width, height)
        else {
          frame = requestAnimationFrame(tick)
          return
        }
      }
      context.clearRect(0, 0, width, height)
      let alive = 0
      for (const piece of pieces) {
        piece.vy += 0.08
        piece.vx *= 0.992
        piece.x += piece.vx
        piece.y += piece.vy
        piece.rot += piece.vr
        if (piece.y < height + 40) alive += 1
        context.save()
        context.translate(piece.x, piece.y)
        context.rotate(piece.rot)
        context.fillStyle = piece.color
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h)
        context.restore()
      }
      if (alive > 0) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvasRef} className="confetti" aria-hidden="true" />
}
