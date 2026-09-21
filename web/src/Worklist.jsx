import { useEffect, useState } from 'react'
import Bar from './Bar.jsx'
import Dashboard from './Dashboard.jsx'
import { downloadUrl, getAllCasesExcelUrl, getCases } from './api.js'
import { kindOf, KIND_WORD, FIELD_PLAIN, REASON_TITLE } from './status.js'

const FILTERS = ['wrong', 'review', 'clear', 'none']
const RANK = { wrong: 0, review: 1, clear: 2, none: 3 }
const PAGE_SIZE = 20

const reportNow = new Date()
const reportYear = reportNow.getUTCFullYear()
const currentMonthValue = `${reportYear}-${String(reportNow.getUTCMonth() + 1).padStart(2, '0')}`
const reportYears = Array.from({ length: reportYear - 1999 }, (_, index) => reportYear - index)
const shortUtcDate = date => date.toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const reportEnd = shortUtcDate(reportNow)

const EXPORT_PERIODS = [
  { value: 'all', label: 'Full history', help: 'Includes every case in the register.' },
  { value: 'month', label: 'Monthly report' },
  { value: 'year', label: 'Annual report' },
  { value: 'last_30_days', label: 'Last 30 days' },
]
export default function Worklist({ health }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [exportPeriod, setExportPeriod] = useState('all')
  const [exportMonth, setExportMonth] = useState(currentMonthValue)
  const [exportYear, setExportYear] = useState(String(reportYear))
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

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
  const exportOptions = { period: exportPeriod }
  let exportHelp = EXPORT_PERIODS.find(option => option.value === exportPeriod)?.help
  if (exportPeriod === 'month') {
    const [selectedYear, selectedMonth] = exportMonth.split('-').map(Number)
    const monthStart = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1))
    const nextMonth = new Date(Date.UTC(selectedYear, selectedMonth, 1))
    const monthEnd = new Date(nextMonth.getTime() - (24 * 60 * 60 * 1000))
    const selectedEnd = exportMonth === currentMonthValue ? reportNow : monthEnd
    exportOptions.year = selectedYear
    exportOptions.month = selectedMonth
    exportHelp = `${shortUtcDate(monthStart)} to ${shortUtcDate(selectedEnd)} UTC.`
  } else if (exportPeriod === 'year') {
    const selectedYear = Number(exportYear)
    const yearStart = new Date(Date.UTC(selectedYear, 0, 1))
    const selectedEnd = selectedYear === reportYear
      ? reportNow
      : new Date(Date.UTC(selectedYear, 11, 31))
    exportOptions.year = selectedYear
    exportHelp = `${shortUtcDate(yearStart)} to ${shortUtcDate(selectedEnd)} UTC.`
  } else if (exportPeriod === 'last_30_days') {
    const last30DaysStart = new Date(reportNow.getTime() - (30 * 24 * 60 * 60 * 1000))
    exportHelp = `${shortUtcDate(last30DaysStart)} to ${reportEnd} UTC.`
  }
  const excelExportUrl = getAllCasesExcelUrl(exportOptions)

  async function downloadExcel() {
    setExporting(true)
    setExportError(null)
    try {
      await downloadUrl(excelExportUrl, 'protozero-cases.xlsx')
    } catch (e) {
      setExportError(e.message)
    } finally {
      setExporting(false)
    }
  }

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
            <span className="eyebrow">Shipping document control desk</span>
            <h1 id="welcome-title">Document checks that show their work.</h1>
            <p>
              ProtoZero reads the request, compares the shipping instruction with the draft
              bill of lading, and keeps the evidence behind every decision.
            </p>
            {workedExample && (
              <a className="btn btn--small" href={'#/case/' + workedExample.email_id}>
                Review first exception
              </a>
            )}
          </div>
          <div className="welcome__path">
            <span className="eyebrow">Verification path</span>
            <ol className="welcome__steps" aria-label="How ProtoZero works">
              <li><b>01</b><span><strong>Understand the request</strong><small>Separate real document checks from inbox noise.</small></span></li>
              <li><b>02</b><span><strong>Compare seven fields</strong><small>Read both documents using deterministic rules first.</small></span></li>
              <li><b>03</b><span><strong>Prove the result</strong><small>Show exact source evidence or stop for a person.</small></span></li>
            </ol>
          </div>
        </section>

        <Dashboard health={health} items={items} />

        <section className="workbench" aria-labelledby="email-checks-heading">
          <div className="listhead">
            <div>
              <span className="eyebrow">Live worklist</span>
              <h2 id="email-checks-heading">Email checks</h2>
              <p>Start with an exception, or find a specific case from the inbox.</p>
            </div>
            <span className="workbench__total"><b>{items.length}</b> cases in the register</span>
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
              <small>Case ID, subject, booking reference, sender or summary.</small>
            </label>
            <div className="workexport-group">
              <label htmlFor="export-period">Export case register</label>
              <div className="workexport-row">
                <div className={`workexport-options${exportPeriod === 'month' || exportPeriod === 'year' ? ' workexport-options--dated' : ''}`}>
                  <select
                    id="export-period"
                    value={exportPeriod}
                    onChange={event => setExportPeriod(event.target.value)}
                  >
                    {EXPORT_PERIODS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {exportPeriod === 'month' && (
                    <input
                      type="month"
                      aria-label="Report month"
                      min="2000-01"
                      max={currentMonthValue}
                      value={exportMonth}
                      onChange={event => setExportMonth(event.target.value || currentMonthValue)}
                    />
                  )}
                  {exportPeriod === 'year' && (
                    <select
                      aria-label="Report year"
                      value={exportYear}
                      onChange={event => setExportYear(event.target.value)}
                    >
                      {reportYears.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className="workexport-foot">
                <small>
                  {exportError
                    ? exportError
                    : `${exportHelp} Uses the received date, or first processed date when missing. Search and filters do not affect the download.`}
                </small>
                <button
                  className="btn btn--ghost btn--small workexport"
                  type="button"
                  disabled={!excelExportUrl || exporting}
                  aria-busy={exporting}
                  onClick={downloadExcel}
                  title="The export is independent of the worklist search, filters and current page"
                >
                  {exporting ? 'Building the workbook…' : 'Download Excel'}
                </button>
              </div>
            </div>
          </div>

          <div className="filterbar" aria-label="Filter emails by result">
            <div className="filterbar__top">
              <span className="filterbar__label">Result</span>
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
                  <span className="wrow__id">{c.email_id}</span>
                  <span className="wrow__open" aria-hidden="true">→</span>
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
        </section>
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
