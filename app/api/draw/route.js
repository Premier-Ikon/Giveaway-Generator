import { NextResponse } from 'next/server'
import { getDrawing } from '../../../lib/drawing'

export const dynamic = 'force-dynamic'

export async function POST() {
  const drawing = await getDrawing()
  return NextResponse.json(drawing.draw())
}
