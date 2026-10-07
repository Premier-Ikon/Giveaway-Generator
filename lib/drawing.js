import { execFileSync } from 'node:child_process'
import { randomInt } from 'node:crypto'

const PROJECT = 'premier-ikon'
const DATABASE = 'bluff-fly-a-fan-sep-2026'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents`

let pending = null

export function getDrawing() {
  if (!pending) {
    pending = loadDrawing().catch((error) => {
      pending = null
      throw error
    })
  }
  return pending
}

function token() {
  return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
}

async function firestoreGet(path, accessToken) {
  const response = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Firestore ${path} returned ${response.status}`)
  }
  return response.json()
}

async function listRuns(accessToken) {
  const docs = []
  let pageToken = ''
  do {
    const query = new URLSearchParams({ pageSize: '100' })
    if (pageToken) query.set('pageToken', pageToken)
    const payload = await firestoreGet(`runs?${query}`, accessToken)
    docs.push(...(payload.documents || []))
    pageToken = payload.nextPageToken || ''
  } while (pageToken)
  return docs
}

function fieldValue(field) {
  if (!field) return null
  if ('stringValue' in field) return field.stringValue
  if ('integerValue' in field) return Number(field.integerValue)
  if ('doubleValue' in field) return field.doubleValue
  if ('booleanValue' in field) return field.booleanValue
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(fieldValue)
  if ('mapValue' in field) {
    const out = {}
    for (const [key, value] of Object.entries(field.mapValue.fields || {})) {
      out[key] = fieldValue(value)
    }
    return out
  }
  return null
}

function documentData(doc) {
  const data = {}
  for (const [key, value] of Object.entries(doc.fields || {})) {
    data[key] = fieldValue(value)
  }
  return data
}

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

function buildDrawing(summary, runs) {
  const starts = runs.map((run) => run.start)
  const peopleMap = new Map()
  for (const run of runs) {
    const key = run.email.toLowerCase()
    const person = peopleMap.get(key)
    if (!person) {
      peopleMap.set(key, {
        email: run.email,
        name: run.name,
        phone: run.phone,
        entries: run.entries,
        sources: [run.label],
        firstLine: run.start,
      })
    } else {
      person.entries += run.entries
      if (!person.sources.includes(run.label)) person.sources.push(run.label)
      if (run.name && !person.name) person.name = run.name
      if (run.phone && !person.phone) person.phone = run.phone
    }
  }
  const people = [...peopleMap.values()].sort((a, b) => {
    if (b.entries !== a.entries) return b.entries - a.entries
    return a.email.toLowerCase().localeCompare(b.email.toLowerCase())
  })

  function lines(at, limit) {
    const total = summary.totalLines
    if (total <= 0) return []
    const startLine = Math.min(Math.max(1, at), total)
    const size = Math.min(Math.max(1, limit), 1000)
    let index = bisectRight(starts, startLine) - 1
    const page = []
    let line = startLine
    while (page.length < size && index < runs.length) {
      const run = runs[index]
      const last = run.start + run.entries - 1
      const take = Math.min(size - page.length, last - line + 1)
      for (let offset = 0; offset < take; offset += 1) {
        page.push({
          line: line + offset,
          email: run.email,
          name: run.name,
          phone: run.phone || '',
          source: run.label,
        })
      }
      line += take
      index += 1
    }
    return page
  }

  function find(query) {
    const needle = query.trim().toLowerCase()
    if (!needle) return null
    for (const run of runs) {
      if (
        run.email.toLowerCase().includes(needle)
        || run.name.toLowerCase().includes(needle)
        || (run.phone || '').toLowerCase().includes(needle)
      ) {
        return run.start
      }
    }
    return null
  }

  function draw() {
    const line = randomInt(1, summary.totalLines + 1)
    const row = lines(line, 1)[0]
    const person = people.find((item) => item.email.toLowerCase() === row.email.toLowerCase())
    const winner = {
      line: row.line,
      email: row.email,
      name: row.name,
      phone: row.phone || '',
      source: row.source,
      entries: person ? person.entries : 1,
      firstLine: person ? person.firstLine : row.line,
    }
    const sliceCount = 12
    const winnerIndex = randomInt(0, sliceCount)
    return { winner, sliceCount, winnerIndex }
  }

  return {
    summary: {
      ...summary,
      loadedRuns: runs.length,
      loadedPeople: people.length,
    },
    runs,
    people,
    lines,
    find,
    draw,
  }
}

async function loadDrawing() {
  const accessToken = token()
  const summaryDoc = await firestoreGet('meta/summary', accessToken)
  const summary = documentData(summaryDoc)
  const chunks = (await listRuns(accessToken)).map(documentData)
  chunks.sort((a, b) => {
    const sourceOrder = (a.source === 'orders' ? 0 : 1) - (b.source === 'orders' ? 0 : 1)
    if (sourceOrder !== 0) return sourceOrder
    return a.index - b.index
  })
  const runs = []
  let line = 1
  for (const chunk of chunks) {
    if (chunk.source !== 'orders') continue
    for (const row of chunk.rows || []) {
      const entries = Number(row.entries) || 0
      if (entries <= 0) continue
      runs.push({
        email: row.email || '',
        name: row.name || '',
        phone: row.phone || '',
        entries,
        label: chunk.label || chunk.source,
        start: line,
      })
      line += entries
    }
  }
  summary.totalLines = line - 1
  summary.orderLines = summary.totalLines
  summary.amoeLines = 0
  return buildDrawing(summary, runs)
}
