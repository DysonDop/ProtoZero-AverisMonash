import { useEffect, useState } from 'react'
import Bar from './Bar.jsx'
import Dashboard from './Dashboard.jsx'
import { downloadUrl, getAllCasesExcelUrl, getCases } from './api.js'
import { kindOf, FIELD_PLAIN, REASON_TITLE, priorityOf } from './status.js'

const FILTERS = ['wrong', 'review', 'clear', 'none']
const RANK = { wrong: 0, review: 1, clear: 2, none: 3 }
const PAGE_SIZE = 20
const TYPE_OPTIONS = [
  { value: 'BL_COMPARISON', label: 'Document comparison' },
  { value: 'SI_REQUEST', label: 'Shipping instruction' },
  { value: 'INVOICE_QUERY', label: 'Invoice query' },
  { value: 'GENERAL', label: 'General email' },
  { value: 'SPAM', label: 'Spam' },
]
const FILTER_WORD = {
  wrong: 'Differences',
  review: 'Needs review',
  clear: 'Cleared',
  none: 'Other email',
}
const DATE_OPTIONS = [
  { value: 'all', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: '7_days', label: 'Last 7 days' },
  { value: '30_days', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
]

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
  const [query, setQuery] = useState('')
  const [inboxView, setInboxView] = useState('incoming')
  const [selectedResults, setSelectedResults] = useState([])
  const [selectedTypes, setSelectedTypes] = useState([])
  const [dateFilter, setDateFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [chartFilter, setChartFilter] = useState(null)
  const [sortBy, setSortBy] = useState('priority')
  const [filtersOpen, setFiltersOpen] = useState(false)
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
  }, [inboxView, selectedResults, selectedTypes, dateFilter, dateFrom, dateTo, query,
    chartFilter, sortBy, exportPeriod, exportMonth, exportYear])

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

  // The dataset carries no sent/received timestamp, so every date-driven
   // control is hidden rather than shown empty. Restores itself the moment a
   // mail connector supplies received_at.
  const hasDates = items.some(item => caseDate(item) != null)
  const periodItems = hasDates
    ? items.filter(item => matchesReportPeriod(item, exportPeriod, exportMonth, exportYear, reportNow))
    : items
  const counts = {}
  for (const k of FILTERS) counts[k] = periodItems.filter(c => kindOf(c) === k).length

  const incomingItems = periodItems.filter(isIncoming)
  const historyItems = periodItems.filter(item => !isIncoming(item))
  const addedToday = items.filter(item => isSameUtcDay(caseDate(item), reportNow)).length
  const actionNeeded = incomingItems.filter(item => ['wrong', 'review'].includes(kindOf(item))).length
  const typeCounts = Object.fromEntries(
    TYPE_OPTIONS.map(option => [option.value, periodItems.filter(item => item.category === option.value).length])
  )
  const ordered = [...periodItems].sort((a, b) => {
    if (sortBy === 'case_id') return a.email_id.localeCompare(b.email_id, undefined, { numeric: true })
    const dateDifference = (caseDate(b)?.getTime() || 0) - (caseDate(a)?.getTime() || 0)
    if (sortBy === 'newest') return dateDifference || a.email_id.localeCompare(b.email_id)
    const priorityDifference = priorityOf(a).rank - priorityOf(b).rank
    const resultDifference = RANK[kindOf(a)] - RANK[kindOf(b)]
    return priorityDifference || resultDifference || dateDifference || a.email_id.localeCompare(b.email_id)
  })
  const needle = query.trim().toLowerCase()
  const shown = ordered.filter(c => {
    const matchesView = inboxView === 'all'
      || (inboxView === 'incoming' ? isIncoming(c) : !isIncoming(c))
    const matchesStatus = selectedResults.length === 0 || selectedResults.includes(kindOf(c))
    const matchesType = selectedTypes.length === 0 || selectedTypes.includes(c.category)
    const matchesWhen = !hasDates || matchesDate(c, dateFilter, dateFrom, dateTo, reportNow)
    const matchesChart = !chartFilter || matchesDashboardFilter(c, chartFilter)
    const matchesQuery = !needle || [
      c.email_id, c.subject, c.from_addr, c.summary,
      TYPE_OPTIONS.find(option => option.value === c.category)?.label,
    ]
      .some(value => String(value || '').toLowerCase().includes(needle))
    return matchesView && matchesStatus && matchesType && matchesWhen && matchesChart && matchesQuery
  })
  const activeFilterCount = selectedResults.length + selectedTypes.length
    + (dateFilter === 'all' ? 0 : 1) + (chartFilter ? 1 : 0)
  const hasSearchOrFilters = Boolean(query.trim()) || activeFilterCount > 0
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

  function toggleSelection(value, selected, setter) {
    setter(selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value])
  }

  function clearWorklistFilters({ includeView = false } = {}) {
    setQuery('')
    setSelectedResults([])
    setSelectedTypes([])
    setDateFilter('all')
    setDateFrom('')
    setDateTo('')
    setChartFilter(null)
    if (includeView) setInboxView('all')
  }

  function showFullRegister() {
    clearWorklistFilters({ includeView: true })
    setExportPeriod('all')
  }

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

  function drillDown(filter) {
    setQuery('')
    setInboxView('all')
    setSelectedResults(filter.kind === 'result' ? [filter.value] : [])
    setSelectedTypes(filter.kind === 'category' ? [filter.value] : [])
    setChartFilter(['field', 'reason'].includes(filter.kind) ? filter : null)
    setFiltersOpen(false)
    window.requestAnimationFrame(() => {
      document.getElementById('email-checks-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

        <Dashboard
          health={health}
          items={periodItems}
          periodLabel={!hasDates || exportPeriod === 'all' ? 'Full register' : exportHelp}
          onDrillDown={drillDown}
        />

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
              <span>Search by keyword</span>
              <input
                type="search"
                value={query}
                placeholder="Case, subject, sender or booking reference"
                onChange={event => setQuery(event.target.value)}
              />
              <small>Searches the case ID, subject, sender, email type and summary.</small>
            </label>
            <div className="workexport-group">
              <label htmlFor="export-period">{hasDates ? 'Worklist period & Excel export' : 'Excel export period'}</label>
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
                    : hasDates
                      ? `${exportHelp} The worklist and workbook use this period. Search and advanced filters narrow the worklist only.`
                      : `${exportHelp} Scopes the workbook only — the worklist is unaffected while the inbox carries no received dates.`}
                </small>
                <button
                  className="btn btn--ghost btn--small workexport"
                  type="button"
                  disabled={!excelExportUrl || exporting}
                  aria-busy={exporting}
                  onClick={downloadExcel}
                  title="Downloads every case in the selected period; search and advanced filters are ignored"
                >
                  {exporting ? 'Building the workbook…' : 'Download Excel'}
                </button>
              </div>
            </div>
          </div>

          <dl className="inboxpulse" aria-label="Email worklist summary">
            {hasDates && (
              <div>
                <dt>{exportPeriod === 'all' ? 'Added today' : 'In selected period'}</dt>
                <dd>{exportPeriod === 'all' ? addedToday : periodItems.length}</dd>
              </div>
            )}
            <div><dt>Incoming</dt><dd>{incomingItems.length}</dd></div>
            <div><dt>Need action</dt><dd>{actionNeeded}</dd></div>
            <div><dt>Currently showing</dt><dd>{shown.length}</dd></div>
          </dl>

          <div className="inboxnav">
            <div className="inboxnav__tabs" role="tablist" aria-label="Choose email view">
              <button type="button" role="tab" aria-selected={inboxView === 'incoming'} onClick={() => setInboxView('incoming')}>
                Incoming <span>{incomingItems.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={inboxView === 'history'} onClick={() => setInboxView('history')}>
                History <span>{historyItems.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={inboxView === 'all'} onClick={() => setInboxView('all')}>
                All records <span>{periodItems.length}</span>
              </button>
            </div>
            <div className="inboxnav__right">
              <label className="listsort">
                <span>Sort</span>
                <select value={sortBy} onChange={event => setSortBy(event.target.value)}>
                  <option value="priority">Priority first</option>
                  {hasDates && <option value="newest">Newest first</option>}
                  <option value="case_id">Case ID</option>
                </select>
              </label>
              <div className="inboxnav__summary" aria-live="polite">
                {shown.length === 0
                  ? (periodItems.length === 0 ? 'No emails in this period' : 'No matching emails')
                  : `Showing ${pageStart + 1}-${pageEnd} of ${shown.length}`}
              </div>
            </div>
          </div>

          <div className="filtermenu" aria-label="Advanced email filters">
            <div className="filtermenu__bar">
              <button className="filtermenu__toggle" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
                Filter emails
                {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
                <i aria-hidden="true">{filtersOpen ? '−' : '+'}</i>
              </button>
              <div className="filtermenu__active" aria-live="polite">
                {activeFilterCount === 0
                  ? <span>No advanced filters</span>
                  : <>
                      {selectedResults.length > 0 && <span>{selectedResults.length} result{selectedResults.length === 1 ? '' : 's'}</span>}
                      {selectedTypes.length > 0 && <span>{selectedTypes.length} email type{selectedTypes.length === 1 ? '' : 's'}</span>}
                      {dateFilter !== 'all' && <span>{DATE_OPTIONS.find(option => option.value === dateFilter)?.label}</span>}
                      {chartFilter && <span>{dashboardFilterLabel(chartFilter)}</span>}
                    </>}
              </div>
              {hasSearchOrFilters && <button className="filtermenu__clear" type="button" onClick={() => clearWorklistFilters()}>Clear all</button>}
            </div>

            {filtersOpen && (
              <div className={`filtermenu__panel${hasDates ? '' : ' filtermenu__panel--nodates'}`}>
                <fieldset>
                  <legend>Result <small>Select multiple</small></legend>
                  <div className="filtermenu__choices filtermenu__choices--results">
                    {FILTERS.map(value => (
                      <label key={value}>
                        <input type="checkbox" checked={selectedResults.includes(value)} onChange={() => toggleSelection(value, selectedResults, setSelectedResults)} />
                        <span className={'mk mk--' + value} aria-hidden="true"></span>
                        <span>{FILTER_WORD[value]}</span><b>{counts[value]}</b>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Email type <small>Select multiple</small></legend>
                  <div className="filtermenu__choices">
                    {TYPE_OPTIONS.map(option => (
                      <label key={option.value}>
                        <input type="checkbox" checked={selectedTypes.includes(option.value)} onChange={() => toggleSelection(option.value, selectedTypes, setSelectedTypes)} />
                        <span>{option.label}</span><b>{typeCounts[option.value]}</b>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {hasDates && (
                <div className="filtermenu__dates">
                  <label htmlFor="email-date-filter">Received date</label>
                  <select id="email-date-filter" value={dateFilter} onChange={event => setDateFilter(event.target.value)}>
                    {DATE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {dateFilter === 'custom' && (
                    <div className="filtermenu__range">
                      <label>From<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
                      <label>To<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
                    </div>
                  )}
                  <small>Uses the received date, or first processed date when missing.</small>
                </div>
                )}
                <div className="filtermenu__actions">
                  <button type="button" disabled={!hasSearchOrFilters} onClick={() => clearWorklistFilters()}>Reset filters</button>
                  <button type="button" onClick={() => setFiltersOpen(false)}>Done</button>
                </div>
              </div>
            )}
          </div>

          <div className="worklist-results">
              {shown.length === 0 ? (
                <div className="empty">
                  <b>{periodItems.length === 0 ? 'No emails in this reporting period.' : 'No emails match this view.'}</b>
                  <span>{periodItems.length === 0
                    ? 'Choose another month or year, or return to the full register.'
                    : 'Clear the filters or open all records to see this whole reporting period.'}</span>
                  <button className="btn btn--ghost btn--small" type="button" onClick={showFullRegister}>Show full register</button>
                </div>
              ) : <>
                <div className="wtable">
                {visible.map(c => {
                  const k = kindOf(c)
                  const priority = priorityOf(c)
                  return (
                    <a className={'wrow wrow--link' + (k === 'none' ? ' wrow--muted' : '')} key={c.email_id} href={'#/case/' + c.email_id}>
                      <span className={'mk mk--' + k}></span>
                      <span className="wrow__body">
                        <span className="wrow__headline">
                          <span className={'wrow__found wrow__found--' + k}>{headline(c)}</span>
                          {priority.key !== 'routine' && (
                            <span className={'priority priority--' + priority.key} title={priority.reason}>{priority.label}</span>
                          )}
                        </span>
                        <span className="wrow__ref trunc">{c.subject} &nbsp;&middot;&nbsp; {c.from_addr}</span>
                      </span>
                      {c.assigned_to && <span className="wrow__owner">{c.assigned_to}</span>}
                      {hasDates && <span className="wrow__time">{formatInboxDate(caseDate(c), reportNow)}</span>}
                      <span className="wrow__id">{c.email_id}</span>
                      <span className="wrow__open" aria-hidden="true">&rarr;</span>
                    </a>
                  )
                })}
                </div>
                <nav className="pagination" aria-label="Email list pages">
                  <button className="pagination__button" type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>
                    <span aria-hidden="true">&larr;</span> Previous
                  </button>
                  <span className="pagination__status">Page <b>{currentPage}</b> of <b>{pageCount}</b></span>
                  <button className="pagination__button" type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>
                    Next <span aria-hidden="true">&rarr;</span>
                  </button>
                </nav>
              </>}
          </div>
        </section>
      </div>
    </Shell>
  )
}

function caseDate(item) {
  const value = item.received_at || item.created_at || item.updated_at
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isIncoming(item) {
  return !item.lifecycle || item.lifecycle === 'new' || item.lifecycle === 'in_review'
}

function isSameUtcDay(left, right) {
  if (!left || !right) return false
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate()
}

function matchesReportPeriod(item, period, monthValue, yearValue, now) {
  if (period === 'all') return true
  const date = caseDate(item)
  if (!date) return false
  if (period === 'month') {
    const [year, month] = monthValue.split('-').map(Number)
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
  }
  if (period === 'year') return date.getUTCFullYear() === Number(yearValue)
  const start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
  return date >= start && date <= now
}

function matchesDate(item, filter, from, to, now) {
  if (filter === 'all') return true
  const date = caseDate(item)
  if (!date) return false
  if (filter === 'today') return isSameUtcDay(date, now)
  if (filter === '7_days' || filter === '30_days') {
    const days = filter === '7_days' ? 7 : 30
    return date >= new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)) && date <= now
  }
  const start = from ? new Date(`${from}T00:00:00Z`) : null
  const end = to ? new Date(`${to}T23:59:59.999Z`) : null
  return (!start || date >= start) && (!end || date <= end)
}

function matchesDashboardFilter(item, filter) {
  if (filter.kind === 'field') return (item.defect_fields || []).includes(filter.value)
  if (filter.kind === 'reason') return item.wire_review_reason === filter.value
  return true
}

function dashboardFilterLabel(filter) {
  if (filter.kind === 'field') return `${FIELD_PLAIN[filter.value] || filter.value} differences`
  if (filter.kind === 'reason') return REASON_TITLE[filter.value] || filter.value
  return 'Dashboard selection'
}

function formatInboxDate(date, now) {
  if (!date) return 'Date unavailable'
  if (isSameUtcDay(date, now)) return 'Today'
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(date.getUTCFullYear() === now.getUTCFullYear() ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
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
