const BASE = import.meta.env.VITE_API_BASE ?? ''
const mock = BASE === ''

async function get(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(path + ' returned ' + res.status)
  return res.json()
}

export const getCases = () =>
  get(mock ? '/cases.json' : BASE + '/cases')

export const getCase = id =>
  get(mock ? '/cases/' + id + '.json' : BASE + '/cases/' + id)

export const getReview = () =>
  get(mock ? '/review.json' : BASE + '/review')

export const getDocument = (id, role) =>
  get(mock ? '/documents/' + id + '_' + role + '.json'
           : BASE + '/cases/' + id + '/document/' + role)

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
