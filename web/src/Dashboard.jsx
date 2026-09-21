const COMPONENT_LABEL = {
  classifier: 'AI classifier',
  extraction: 'AI extraction',
  deterministic_rules: 'Deterministic rules',
  comparison: 'Comparison engine',
  audit_log: 'Audit logging',
}

const CATEGORY_LABEL = {
  BL_COMPARISON: 'Document comparison',
  SI_REQUEST: 'Shipping instruction',
  INVOICE_QUERY: 'Invoice question',
  GENERAL: 'General email',
  SPAM: 'Spam',
}

const FIELD_LABEL = {
  shipper: 'Shipper',
  consignee: 'Consignee',
  notify_party: 'Notify party',
  port_of_loading: 'Port of loading',
  port_of_discharge: 'Port of discharge',
  container_count: 'Container count',
  gross_weight_kg: 'Gross weight',
}

const REVIEW_LABEL = {
  missing_attachment: 'Missing attachment',
  wrong_doc_type: 'Wrong document type',
  unreadable: 'Unreadable document',
  missing_value: 'Missing or uncertain field',
}

export default function Dashboard({ health, items, periodLabel = 'Full register', onDrillDown, standalone = false }) {
  const comparisonCases = items.filter(item => item.category === 'BL_COMPARISON')
  const cleared = comparisonCases.filter(item => item.status === 'OK').length
  const mismatches = comparisonCases.filter(item => item.status === 'MISMATCH').length
  const reviews = comparisonCases.filter(item => item.status === 'NEEDS_REVIEW').length
  const needAction = mismatches + reviews
  const averageConfidence = average(
    items.map(item => item.category_confidence).filter(Number.isFinite)
  )

  const workload = countRows(items, item => item.category, CATEGORY_LABEL)
  const mismatchFields = countOccurrences(
    comparisonCases.flatMap(item => item.defect_fields || []), FIELD_LABEL
  )
  const reviewReasons = countRows(
    comparisonCases.filter(item => item.status === 'NEEDS_REVIEW'),
    item => item.wire_review_reason,
    REVIEW_LABEL
  )
  const outcomes = [
    { label: 'Cleared', value: cleared, tone: 'clear' },
    { label: 'Differences', value: mismatches, tone: 'wrong' },
    { label: 'Human review', value: reviews, tone: 'review' },
  ]

  return (
    <details className={`ops${standalone ? ' ops--standalone' : ''}`} open={standalone || undefined}>
      <summary className="ops__summary">
        <span className="ops__summarycopy">
          <span className="eyebrow">Analytics</span>
          <strong>Workload and system health</strong>
        </span>
        <span className="ops__quick" aria-label="Current operational summary">
          <span><b>{items.length}</b> in period</span>
          <span><b>{needAction}</b> need action</span>
          <span className={'ops__health ops__health--' + healthTone(health)}>
            <i aria-hidden="true"></i>{healthWord(health)}
          </span>
        </span>
        <span className="ops__chevron" aria-hidden="true">⌄</span>
      </summary>

      <div className="ops__body">
        <section className="ops__analytics" aria-labelledby="ops-title">
          <div className="ops__head">
            <div>
              <span className="eyebrow">Quick-look dashboard</span>
              <h2 id="ops-title">Register analytics</h2>
            </div>
            <span className="ops__period">{periodLabel}</span>
          </div>

          {standalone && (
            <RegisterFlow
              total={items.length}
              comparisons={comparisonCases.length}
              routed={items.length - comparisonCases.length}
              cleared={cleared}
              mismatches={mismatches}
              reviews={reviews}
              onSelect={onDrillDown}
            />
          )}

          <dl className="metricgrid">
            <Metric label="Emails in period" value={items.length} />
            <Metric label="Document comparisons" value={comparisonCases.length} />
            <Metric label="Automatically cleared" value={cleared} />
            <Metric label="Need action" value={needAction} />
            <Metric
              label="Classification confidence"
              value={Number.isFinite(averageConfidence) ? `${Math.round(averageConfidence * 100)}%` : '—'}
            />
          </dl>

          <div className="analyticsgrid">
            <BarChart
              title="Email workload"
              subtitle="What arrived in the selected period"
              rows={workload}
              tone="neutral"
              total={items.length}
              onSelect={key => onDrillDown?.({ kind: 'category', value: key })}
            />
            <OutcomeChart
              rows={outcomes}
              total={comparisonCases.length}
              onSelect={value => onDrillDown?.({ kind: 'result', value })}
            />
            <BarChart
              title="Fields with differences"
              subtitle="One case can contain more than one difference"
              rows={mismatchFields}
              tone="wrong"
              onSelect={key => onDrillDown?.({ kind: 'field', value: key })}
            />
            <BarChart
              title="Why a person is needed"
              subtitle="Primary reason for each human-review case"
              rows={reviewReasons}
              tone="review"
              onSelect={key => onDrillDown?.({ kind: 'reason', value: key })}
            />
          </div>
        </section>

        <HealthPanel health={health} />
      </div>
    </details>
  )
}

function RegisterFlow({ total, comparisons, routed, cleared, mismatches, reviews, onSelect }) {
  return (
    <section className="registerflow" aria-labelledby="register-flow-title">
      <header>
        <div>
          <h3 id="register-flow-title">How email moves through ProtoZero</h3>
          <p>A live register flow, not a decorative process diagram.</p>
        </div>
        <span>Select an outcome to inspect its cases</span>
      </header>
      <div className="registerflow__map">
        <div className="flowcard flowcard--source"><small>Inbox</small><strong>{total}</strong><span>emails</span></div>
        <span className="flowline" aria-hidden="true"></span>
        <div className="flowbranch">
          <button type="button" className="flowcard" onClick={() => onSelect?.({ kind: 'category', value: 'BL_COMPARISON' })}>
            <small>Document checks</small><strong>{comparisons}</strong><span>{percent(comparisons, total)}</span>
          </button>
          <div className="flowoutcomes">
            <button type="button" className="flowoutcome flowoutcome--clear" onClick={() => onSelect?.({ kind: 'result', value: 'clear' })}><b>{cleared}</b><span>Cleared</span></button>
            <button type="button" className="flowoutcome flowoutcome--wrong" onClick={() => onSelect?.({ kind: 'result', value: 'wrong' })}><b>{mismatches}</b><span>Differences</span></button>
            <button type="button" className="flowoutcome flowoutcome--review" onClick={() => onSelect?.({ kind: 'result', value: 'review' })}><b>{reviews}</b><span>Human review</span></button>
          </div>
        </div>
        <div className="flowcard flowcard--routed"><small>Other email</small><strong>{routed}</strong><span>routed without comparison</span></div>
      </div>
    </section>
  )
}

function Metric({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function BarChart({ title, subtitle, rows, tone, total, onSelect }) {
  const largest = Math.max(0, ...rows.map(row => row.value))
  const scale = total > 0 ? total : largest

  return (
    <section className="chartpanel">
      <header className="chartpanel__head">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      {rows.length > 0
        ? <ol className="chartbars" aria-label={`${title}: ${rows.map(row => `${row.label} ${row.value}`).join(', ')}`}>
            {rows.map(row => (
              <li key={row.label}>
                <button className="chartbars__button" type="button" onClick={() => onSelect?.(row.key)}>
                  <span className="chartbars__label">
                    <span>{row.label}</span>
                    <span className="chartbars__value">
                      <b>{row.value}</b>
                      {total > 0 && <small>{percent(row.value, total)}</small>}
                    </span>
                  </span>
                  <span className="chartbars__track" aria-hidden="true">
                    <i
                      className={'chartbars__fill chartbars__fill--' + tone}
                      style={{ width: `${scale > 0 ? Math.max(3, row.value / scale * 100) : 0}%` }}
                    ></i>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        : <p className="chartpanel__empty">No data for this period.</p>}
    </section>
  )
}

function OutcomeChart({ rows, total, onSelect }) {
  return (
    <section className="chartpanel">
      <header className="chartpanel__head">
        <h3>Comparison outcomes</h3>
        <p>Results for document-comparison emails only</p>
      </header>
      {total > 0
        ? <>
            <div
              className="outcomebar"
              role="img"
              aria-label={rows.map(row => `${row.label} ${row.value}, ${percent(row.value, total)}`).join('; ')}
            >
              {rows.filter(row => row.value > 0).map(row => (
                <span
                  key={row.label}
                  className={'outcomebar__segment outcomebar__segment--' + row.tone}
                  style={{ width: `${row.value / total * 100}%` }}
                  title={`${row.label}: ${row.value} (${percent(row.value, total)})`}
                ></span>
              ))}
            </div>
            <ul className="outcomelegend">
              {rows.map(row => (
                <li key={row.label}>
                  <button type="button" onClick={() => onSelect?.(row.tone)}>
                    <i className={'outcomelegend__mark outcomelegend__mark--' + row.tone} aria-hidden="true"></i>
                    <span>{row.label}</span>
                    <b>{row.value}</b>
                    <small>{percent(row.value, total)}</small>
                  </button>
                </li>
              ))}
            </ul>
          </>
        : <p className="chartpanel__empty">No document comparisons in this period.</p>}
    </section>
  )
}

function HealthPanel({ health }) {
  if (!health) {
    return (
      <aside className="healthpanel">
        <span className="eyebrow">System health</span>
        <h2>Live health unavailable</h2>
        <p className="healthpanel__empty">Connect the API to see service status and the circuit breaker.</p>
      </aside>
    )
  }

  return (
    <aside className="healthpanel" aria-label="System health">
      <div className="healthpanel__head">
        <div><span className="eyebrow">System health</span><h2>Service monitor</h2></div>
        <span className={'healthpanel__mode healthpanel__mode--' + health.mode}>
          {health.mode === 'full' ? 'Full mode' : 'Fallback active'}
        </span>
      </div>
      <ul className="healthlist">
        {(health.components || []).map(component => (
          <li key={component.name}>
            <span>{COMPONENT_LABEL[component.name] || component.name}</span>
            <b className={'healthstate healthstate--' + component.state}>
              <i aria-hidden="true"></i>{component.state}</b>
          </li>
        ))}
      </ul>
      <dl className="healthfacts">
        <div><dt>AI failures</dt><dd>{health.ai_failures}</dd></div>
        <div><dt>Circuit breaker</dt><dd>{String(health.circuit_breaker).toUpperCase()}</dd></div>
      </dl>
      {health.mode === 'deterministic_only' && (
        <div className="healthalert" role="status">
          <b>AI fallback active</b>
          <span>The system is operating in deterministic-only mode.</span>
        </div>
      )}
    </aside>
  )
}

function countRows(items, getKey, labels) {
  const counts = new Map()
  for (const item of items) {
    const key = getKey(item)
    if (labels[key]) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts]
    .map(([key, value]) => ({ key, label: labels[key], value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

function countOccurrences(values, labels) {
  return countRows(values, value => value, labels)
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function percent(value, total) {
  return total > 0 ? `${(value / total * 100).toFixed(value === total ? 0 : 1)}%` : '0%'
}

function healthTone(health) {
  if (!health) return 'unknown'
  if (health.circuit_breaker === 'open') return 'wrong'
  if (health.mode === 'deterministic_only') return 'fallback'
  return 'online'
}

function healthWord(health) {
  if (!health) return 'Health unavailable'
  if (health.circuit_breaker === 'open') return 'Circuit open'
  if (health.mode === 'deterministic_only') return 'Deterministic-only'
  return 'Systems online'
}
