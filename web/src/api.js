const BASE = import.meta.env.VITE_API_BASE ?? ''
const mock = BASE === ''
const REQUEST_TIMEOUT_MS = 15000

export const offlineMode = mock
export const reviewerId = import.meta.env.VITE_REVIEWER_ID ?? 'review-desk'

export const getHealth = () => mock
  ? Promise.resolve(null)
  : get(BASE + '/health')

async function get(path) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(path, { signal: controller.signal })
    if (!res.ok) throw new Error(path + ' returned ' + res.status)
    return res.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('The case service took too long to respond. Check that the backend is running.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function getCases() {
  if (mock) return get('/cases.json')

  let offset = 0
  let firstPage = null
  const items = []
  do {
    const page = await get(BASE + '/cases?limit=500&offset=' + offset)
    firstPage ||= page
    items.push(...page.items)
    offset = page.next_offset
  } while (offset != null)

  return { ...firstPage, items, total: items.length, next_offset: null }
}

export const getCase = id =>
  get(mock ? '/cases/' + id + '.json' : BASE + '/cases/' + id)

export const getReview = () =>
  get(mock ? '/review.json' : BASE + '/review')

export const getMetrics = () =>
  get(mock ? '/metrics.json' : BASE + '/metrics')

export const getDocument = (id, role) =>
  get(mock ? '/documents/' + id + '_' + role + '.json'
           : BASE + '/cases/' + id + '/document/' + role)

export const getRawDocumentUrl = (id, role) =>
  mock ? null : BASE + '/cases/' + id + '/document/' + role + '/raw'

export const getAuditEvents = id =>
  mock ? Promise.resolve({ items: [] }) : get(BASE + '/cases/' + id + '/events')

export const getCaseReportPdfUrl = id =>
  mock ? null : BASE + '/cases/' + encodeURIComponent(id) + '/report.pdf'

export const getAllCasesExcelUrl = () =>
  mock ? null : BASE + '/cases/export.xlsx'

export async function resolveReview(id, body) {
  if (mock) return { ok: true }
  const res = await fetch(BASE + '/review/' + id + '/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('resolve ' + id + ' returned ' + res.status)
  return res.json()
}

export async function retryReview(id, body = { force_llm: false }) {
  if (mock) throw new Error('Retry is available when the live API is connected')
  const res = await fetch(BASE + '/review/' + id + '/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('retry ' + id + ' returned ' + res.status)
  return res.json()
}

export async function getCaseDecision(emailId) {
  if (mock) return null
  const data = await get(BASE + '/cases/' + emailId + '/decision')
  return data.decision
}

export async function recordCaseDecision(emailId, choice) {
  if (mock) return { ...choice, recorded_at: new Date().toISOString() }
  const res = await fetch(BASE + '/cases/' + emailId + '/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...choice, reviewer_id: reviewerId }),
  })
  if (!res.ok) throw new Error('decision for ' + emailId + ' returned ' + res.status)
  return (await res.json()).decision
}

export async function clearCaseDecision(emailId) {
  if (mock) return { ok: true }
  const res = await fetch(BASE + '/cases/' + emailId + '/decision', { method: 'DELETE' })
  if (!res.ok) throw new Error('undo for ' + emailId + ' returned ' + res.status)
  return res.json()
}
