import { useEffect, useState } from 'react'
import Bar from './Bar.jsx'
import Dashboard from './Dashboard.jsx'
import { getAllCasesExcelUrl, getCases } from './api.js'
import { kindOf, KIND_WORD, FIELD_PLAIN, REASON_TITLE } from './status.js'

const FILTERS = ['wrong', 'review', 'clear', 'none']
const RANK = { wrong: 0, review: 1, clear: 2, none: 3 }
const PAGE_SIZE = 20
export default function Worklist({ health }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  function loadCases() {
    setItems(null)
    setError(null)
    getCases().then(d => setItems(d.items)).catch(e => setError(e.message))
  }

  useEffect(() => {
    loadCases()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [filter, query])

  if (error) return (
    <Shell meta="worklist">
      <div className="state state--error">
        <b>Could not load the email checks.</b>
        <span>{error}</span>
        <button className="btn btn--ghost btn--small" type="button" onClick={loadCases}>Try again</button>
      </div>
    </Shell>
  )
  if (!items) return <Shell meta="worklist"><div className="state">Reading the inbox and preparing the checks.</div></Shell>

  const counts = {}
  for (const k of FILTERS) counts[k] = items.filter(c => kindOf(c) === k).length

  const ordered = [...items].sort((a, b) => RANK[kindOf(a)] - RANK[kindOf(b)])
  const needle = query.trim().toLowerCase()
  const shown = ordered.filter(c => {
    const matchesStatus = !filter || kindOf(c) === filter
    const matchesQuery = !needle || [c.email_id, c.subject, c.from_addr, c.summary]
      .some(value => String(value || '').toLowerCase().includes(needle))
    return matchesStatus && matchesQuery
  })
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, shown.length)
  const visible = shown.slice(pageStart, pageEnd)
  const workedExample = ordered.find(c => c.status === 'MISMATCH')
  const excelExportUrl = getAllCasesExcelUrl()

  function changePage(nextPage) {
    setPage(Math.max(1, Math.min(nextPage, pageCount)))
    window.requestAnimationFrame(() => {
      document.getElementById('email-checks-heading')?.scrollIntoView({ block: 'start' })
    })
  }

  return (
    <Shell meta={items.length + ' emails'} reviewCount={counts.review}>
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
                Open highest-priority case
              </a>
            )}
          </div>
          <ol className="welcome__steps" aria-label="How ProtoZero works">
            <li><b>1</b><span><strong>Sort the email</strong><small>Find requests that need a document check.</small></span></li>
            <li><b>2</b><span><strong>Compare seven details</strong><small>Read both documents and keep the source evidence.</small></span></li>
            <li><b>3</b><span><strong>Explain the decision</strong><small>Clear, flag or hand off without guessing.</small></span></li>
          </ol>
        </section>

        <Dashboard health={health} items={items} />

        <div className="listhead">
          <div>
            <span className="eyebrow">Live worklist</span>
            <h2 id="email-checks-heading">Email checks</h2>
          </div>
          <div className="worktools">
            <label className="worksearch">
              <span>Find an email</span>
              <input
                type="search"
                value={query}
                placeholder="e.g. email_004 or sender@company.com"
                onChange={event => setQuery(event.target.value)}
              />
              <small>Use the case ID assigned here, or the subject, booking reference or sender from the original email.</small>
            </label>
            <div className="workexport-group">
              {excelExportUrl ? (
                <a
                  className="btn btn--ghost btn--small workexport"
                  href={excelExportUrl}
                  download
                  title="Downloads every case, regardless of the current filters"
                >
                  Export all {items.length} cases (Excel)
                </a>
              ) : (
                <button className="btn btn--ghost btn--small workexport" type="button" disabled>
                  Export all cases (Excel)
                </button>
              )}
              <small>Includes every case, not just this page.</small>
            </div>
          </div>
        </div>

        <div className="filterbar" aria-label="Filter emails by result">
          <div className="filterbar__top">
            <span className="filterbar__label">Filter by result</span>
            <span className="filterbar__count">
              {shown.length === 0
                ? `Showing 0 of ${items.length} emails`
                : `Showing ${pageStart + 1}–${pageEnd} of ${shown.length}${shown.length !== items.length ? ' matching' : ''} emails`}
            </span>
            {(filter || query) && (
              <button type="button" onClick={() => { setFilter(null); setQuery('') }}>Clear filters</button>
            )}
          </div>
          <div className="chips">
          <button
            className="chip"
            type="button"
            aria-pressed={filter === null}
            onClick={() => setFilter(null)}
          >
            All emails
            <span className="chip__count">{items.length}</span>
          </button>
          {FILTERS.map(k => (
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
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            <b>No emails match these filters.</b>
            <span>Try another status, change the search, or return to the full worklist.</span>
            <button
              className="btn btn--ghost btn--small"
              type="button"
              onClick={() => { setFilter(null); setQuery('') }}
            >
              Clear filters
            </button>
          </div>
        ) : <>
          <div className="wtable">
          {visible.map(c => {
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
          </div>
          <nav className="pagination" aria-label="Email list pages">
            <button
              className="pagination__button"
              type="button"
              disabled={currentPage === 1}
              onClick={() => changePage(currentPage - 1)}
            >
              <span aria-hidden="true">←</span> Previous
            </button>
            <span className="pagination__status">
              Page <b>{currentPage}</b> of <b>{pageCount}</b>
            </span>
            <button
              className="pagination__button"
              type="button"
              disabled={currentPage === pageCount}
              onClick={() => changePage(currentPage + 1)}
            >
              Next <span aria-hidden="true">→</span>
            </button>
          </nav>
        </>}
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

function Shell({ meta, reviewCount, children }) {
  const reviewAction = reviewCount != null && (
    <a className="thin__queue" href="#/review">
      <span className="mk mk--review" aria-hidden="true"></span>
      <span className="thin__action-label">Review queue</span>
      <b>{reviewCount}</b>
    </a>
  )
  return (
    <>
      <Bar meta={meta} title="Email checks" action={reviewAction} />
      {children}
    </>
  )
}
