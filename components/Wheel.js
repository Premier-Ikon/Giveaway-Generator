'use client'

import { useEffect, useRef } from 'react'

const SLICES = 100
const COLORS = [
  '#ef3b2d',
  '#f26b1d',
  '#f5a623',
  '#f8d400',
  '#c6e000',
  '#6cc644',
  '#2fbf4f',
  '#1ec8b8',
  '#2aa7e0',
  '#2f6fed',
  '#5b4cdb',
  '#9b3fd4',
  '#d63aa8',
  '#ef3b6a',
]

export function landingRotation(currentRotation, line, totalLines) {
  const angle = ((line - 0.5) / totalLines) * 360
  const turns = Math.floor(currentRotation / 360) + 12
  return turns * 360 - angle
}

export default function Wheel({ rotation, onSettled }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const size = 960
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    const center = size / 2
    const outer = size / 2 - 8
    for (let index = 0; index < SLICES; index += 1) {
      const start = (index / SLICES) * Math.PI * 2 - Math.PI / 2
      const end = ((index + 1) / SLICES) * Math.PI * 2 - Math.PI / 2
      context.beginPath()
      context.moveTo(center, center)
      context.arc(center, center, outer, start, end)
      context.closePath()
      context.fillStyle = COLORS[index % COLORS.length]
      context.fill()
      context.beginPath()
      context.moveTo(center, center)
      context.lineTo(center + Math.cos(start) * outer, center + Math.sin(start) * outer)
      context.lineWidth = 3
      context.strokeStyle = '#ffffff'
      context.stroke()
    }
    context.beginPath()
    context.arc(center, center, outer, 0, Math.PI * 2)
    context.lineWidth = 10
    context.strokeStyle = '#1d1d1f'
    context.stroke()
    return undefined
  }, [])

  return (
    <div className="wheel-wrap">
      <div className="pointer" />
      <div
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
