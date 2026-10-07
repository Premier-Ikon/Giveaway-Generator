import { getDrawing } from '../../../lib/drawing'

export const dynamic = 'force-dynamic'

function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

export async function GET() {
  const drawing = await getDrawing()
  const encoder = new TextEncoder()
  let runIndex = 0
  let offset = 0
  let line = 1
  let header = true

  const stream = new ReadableStream({
    pull(controller) {
      if (header) {
        controller.enqueue(encoder.encode('Line,Email,Name,Phone\n'))
        header = false
        return
      }
      if (runIndex >= drawing.runs.length) {
        controller.close()
        return
      }
      let chunk = ''
      const budget = 256 * 1024
      while (runIndex < drawing.runs.length && chunk.length < budget) {
        const run = drawing.runs[runIndex]
        const email = csvCell(run.email)
        const name = csvCell(run.name)
        const phone = csvCell(run.phone)
        const rowLength = String(line).length + email.length + name.length + phone.length + 4
        const remaining = run.entries - offset
        const room = Math.max(1, Math.floor((budget - chunk.length) / rowLength))
        const take = Math.min(remaining, room)
        for (let index = 0; index < take; index += 1) {
          chunk += `${line},${email},${name},${phone}\n`
          line += 1
        }
        offset += take
        if (offset >= run.entries) {
          runIndex += 1
          offset = 0
        }
      }
      controller.enqueue(encoder.encode(chunk))
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="fly-a-fan-sep-2026-entries.csv"',
    },
  })
}
