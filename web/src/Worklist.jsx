import { useEffect, useState } from 'react'
import Bar from './Bar.jsx'
import { getCases } from './api.js'
import { kindOf, KIND_WORD, FIELD_PLAIN, REASON_TITLE } from './status.js'

const FILTERS = ['wrong', 'review', 'clear', 'none']
const RANK = { wrong: 0, review: 1, clear: 2, none: 3 }

export default function Worklist() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState(null)

  useEffect(() => {
    getCases().then(d => setItems(d.items)).catch(e => setError(e.message))
  }, [])

  if (error) return <Shell meta="worklist"><div className="state">Could not reach the case service. {error}</div></Shell>
  if (!items) return <Shell meta="worklist"><div className="state">Reading the inbox and preparing the checks.</div></Shell>

  const counts = {}
  for (const k of FILTERS) counts[k] = items.filter(c => kindOf(c) === k).length

  const ordered = [...items].sort((a, b) => RANK[kindOf(a)] - RANK[kindOf(b)])
  const shown = filter ? ordered.filter(c => kindOf(c) === filter) : ordered
  const workedExample = ordered.find(c => c.status === 'MISMATCH')

  return (
    <Shell meta={items.length + ' emails'}>
      <div className="wmain">
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="welcome__copy">
            <span className="eyebrow">Evidence-first document checking</span>
            <h1 id="welcome-title">From inbox to decision, with proof at every step.</h1>
            <p>
              ProtoZero compares a draft bill of lading with its shipping instruction,
              explains every difference and asks a person whenever it cannot be certain.
            </p>
            {workedExample && (
              <a className="btn btn--small" href={'#/case/' + workedExample.email_id}>
                Start with a worked example
              </a>
            )}
          </div>
          <ol className="welcome__steps" aria-label="How ProtoZero works">
            <li><b>1</b><span><strong>Sort the email</strong><small>Find requests that need a document check.</small></span></li>
            <li><b>2</b><span><strong>Compare seven details</strong><small>Read both documents and keep the source evidence.</small></span></li>
            <li><b>3</b><span><strong>Explain the decision</strong><small>Clear, flag or hand off without guessing.</small></span></li>
          </ol>
        </section>

        <div className="listhead">
          <div>
            <span className="eyebrow">Live worklist</span>
            <h2>Email checks</h2>
          </div>
          <p>Choose a status to focus the list or open the human queue. Select any row to inspect its evidence.</p>
        </div>

        <div className="chips">
          {FILTERS.map(k => k === 'review' ? (
            <a className="chip" key={k} href="#/review">
              <span className={'mk mk--' + k}></span>
              {KIND_WORD[k]}
              <span className="chip__count">{counts[k]}</span>
            </a>
          ) : (
            <button
              className="chip"
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(filter === k ? null : k)}
            >
              <span className={'mk mk--' + k}></span>
              {KIND_WORD[k]}
              <span className="chip__count">{counts[k]}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            <b>No emails have this status.</b>
            <span>Choose another status or return to the full worklist.</span>
            <button className="btn btn--ghost btn--small" type="button" onClick={() => setFilter(null)}>Show all emails</button>
          </div>
        ) : <div className="wtable">
          {shown.map(c => {
            const k = kindOf(c)
            return (
              <a
                className={'wrow wrow--link' + (k === 'none' ? ' wrow--muted' : '')}
                key={c.email_id}
                href={'#/case/' + c.email_id}
              >
                <span className={'mk mk--' + k}></span>
                <span className="wrow__body">
                  <span className={'wrow__found wrow__found--' + k}>{headline(c)}</span>
                  <span className="wrow__ref trunc">{c.subject} &nbsp;·&nbsp; {c.from_addr}</span>
                </span>
              </a>
            )
          })}
        </div>}
      </div>
    </Shell>
  )
}

// The row leads with what we concluded, not the email subject. Subjects in this
// inbox are booking references and cargo codes, which mean nothing to a reader
// scanning for what needs them.
function headline(c) {
  if (c.category !== 'BL_COMPARISON') return c.summary
  if (c.status === 'MISMATCH') return disagreement(c.defect_fields)
  if (c.status === 'NEEDS_REVIEW') return REASON_TITLE[c.wire_review_reason] ?? 'Needs a person'
  return c.summary
}

function disagreement(fields) {
  const names = fields.map(f => FIELD_PLAIN[f] ?? f)
  const joined = names.length > 1
    ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
    : names[0]
  const sentence = joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase()
  return sentence + (names.length > 1 ? ' do not match' : ' does not match')
}

function Shell({ meta, children }) {
  return (
    <>
      <Bar meta={meta} title="Email checks" />
      {children}
    </>
  )
}
