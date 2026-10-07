import { NextResponse } from 'next/server'
import { getDrawing } from '../../../lib/drawing'

export const dynamic = 'force-dynamic'

export async function GET() {
  const drawing = await getDrawing()
  return NextResponse.json(drawing.summary)
}
