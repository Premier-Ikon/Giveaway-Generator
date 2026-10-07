import { NextResponse } from 'next/server'
import { getDrawing } from '../../../lib/drawing'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const drawing = await getDrawing()
  const params = request.nextUrl.searchParams
  const query = (params.get('q') || '').trim().toLowerCase()
  const page = Math.max(1, Number(params.get('page') || 1))
  const size = 50
  let people = drawing.people
  if (query) {
    people = people.filter((person) => (
      person.email.toLowerCase().includes(query) || person.name.toLowerCase().includes(query)
    ))
  }
  const start = (page - 1) * size
  return NextResponse.json({
    page,
    pages: Math.max(1, Math.ceil(people.length / size)),
    total: people.length,
    rows: people.slice(start, start + size),
  })
}
