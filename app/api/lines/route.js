import { NextResponse } from 'next/server'
import { getDrawing } from '../../../lib/drawing'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const drawing = await getDrawing()
  const params = request.nextUrl.searchParams
  let at = Number(params.get('at') || 1)
  const limit = Number(params.get('limit') || 1000)
  const query = params.get('q') || ''
  if (query) {
    const found = drawing.find(query)
    if (found == null) {
      return NextResponse.json({ at, total: drawing.summary.totalLines, rows: [] })
    }
    at = found
  }
  return NextResponse.json({
    at,
    total: drawing.summary.totalLines,
    rows: drawing.lines(at, limit),
  })
}
