const { Firestore } = require('@google-cloud/firestore')
const functions = require('@google-cloud/functions-framework')
const { randomInt } = require('node:crypto')

const db = new Firestore({
  projectId: 'premier-ikon',
  databaseId: 'bluff-fly-a-fan-sep-2026',
})

let pending = null

function bisectRight(values, target) {
  let low = 0
  let high = values.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (values[mid] <= target) low = mid + 1
    else high = mid
  }
  return low
}

function gcd(left, right) {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b) {
    const next = a % b
    a = b
    b = next
  }
  return a
}

function mixStep(total) {
  let step = Math.max(1, Math.floor(total * 0.618033988749895))
  if (step % 2 === 0) step += 1
  while (gcd(step, total) !== 1) step += 2
  return step
}

function buildDrawing(runs) {
  const starts = runs.map((run) => run.start)
  const totalLines = runs.length ? runs[runs.length - 1].start + runs[runs.length - 1].entries - 1 : 0
  const step = totalLines > 1 ? mixStep(totalLines) : 1

  function runAt(realLine) {
    return runs[bisectRight(starts, realLine) - 1]
  }

  function lines(at, limit) {
    if (totalLines <= 0) return []
    const startLine = Math.min(Math.max(1, at), totalLines)
    const size = Math.min(Math.max(1, limit), 1000, totalLines - startLine + 1)
    const page = []
    for (let offset = 0; offset < size; offset += 1) {
      const displayLine = startLine + offset
      const realLine = ((displayLine - 1) * step) % totalLines + 1
      const run = runAt(realLine)
      page.push({
        line: displayLine,
        id: run.id,
        name: run.name || '',
        source: run.source,
      })
    }
    return page
  }

  function draw() {
    const line = randomInt(1, totalLines + 1)
    const row = lines(line, 1)[0]
    return {
      winner: {
        line: row.line,
        id: row.id,
        name: row.name,
        source: row.source,
      },
    }
  }

  return {
    summary: {
      totalLines,
      gotbluffLines: runs.filter((run) => run.source === 'gotbluff').reduce((sum, run) => sum + run.entries, 0),
      spinQuestLines: runs.filter((run) => run.source === 'spin quest').reduce((sum, run) => sum + run.entries, 0),
      loadedRuns: runs.length,
    },
    lines,
    draw,
  }
}

async function loadDrawing() {
  const snapshot = await db.collection('runs').get()
  const chunks = snapshot.docs.map((doc) => doc.data())
  const sourceOrder = { gotbluff: 0, 'spin quest': 1 }
  chunks.sort((a, b) => {
    const sourceDelta = (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9)
    if (sourceDelta !== 0) return sourceDelta
    return Number(a.index) - Number(b.index)
  })
  const runs = []
  let line = 1
  for (const chunk of chunks) {
    for (const row of chunk.rows || []) {
      const entries = Number(row.entries) || 0
      if (entries <= 0) continue
      runs.push({
        id: row.id || row.email || '',
        name: row.name || '',
        source: row.source || chunk.source || '',
        entries,
        start: line,
      })
      line += entries
    }
  }
  return buildDrawing(runs)
}

function getDrawing() {
  if (!pending) {
    pending = loadDrawing().catch((error) => {
      pending = null
      throw error
    })
  }
  return pending
}

function originAllowed(origin) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true
    if (url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')) return true
    if (url.protocol === 'https:' && (url.hostname === 'pickmywinner.com' || url.hostname.endsWith('.pickmywinner.com'))) return true
  } catch {
    return false
  }
  return false
}

function applyCors(req, res) {
  const origin = req.get('origin') || ''
  if (originAllowed(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return true
  }
  return false
}

function routeOf(req) {
  const fromQuery = String(req.query.route || '')
  if (fromQuery) return fromQuery
  const path = String(req.path || '/').split('?')[0]
  const parts = path.split('/').filter(Boolean)
  const last = parts[parts.length - 1] || ''
  return last === 'flyAFanDrawing' ? '' : last
}

functions.http('flyAFanDrawing', async (req, res) => {
  if (applyCors(req, res)) return
  try {
    const drawing = await getDrawing()
    const route = routeOf(req)
    if (req.method === 'GET' && route === 'summary') {
      res.json(drawing.summary)
      return
    }
    if (req.method === 'GET' && route === 'lines') {
      const at = Number(req.query.at || 1)
      const limit = Number(req.query.limit || 1000)
      res.json({
        at,
        total: drawing.summary.totalLines,
        rows: drawing.lines(at, limit),
      })
      return
    }
    if (req.method === 'POST' && route === 'draw') {
      res.json(drawing.draw())
      return
    }
    res.status(404).json({ error: 'Unknown drawing route.' })
  } catch (error) {
    res.status(500).json({ error: error.message || 'The drawing list could not be loaded.' })
  }
})
