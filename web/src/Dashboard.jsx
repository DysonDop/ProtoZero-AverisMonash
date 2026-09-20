import { useEffect, useState } from 'react'
import { getMetrics } from './api.js'

const COMPONENT_LABEL = {
  classifier: 'AI classifier',
  extraction: 'AI extraction',
  deterministic_rules: 'Deterministic rules',
  comparison: 'Comparison engine',
  audit_log: 'Audit logging',
}

export default function Dashboard({ health, items }) {
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    let live = true
    getMetrics().then(value => { if (live) setMetrics(value) }).catch(() => {})
    return () => { live = false }
  }, [])

  const comparisonCases = items.filter(item => item.category === 'BL_COMPARISON')
  const values = {
    processed: metrics?.total_emails ?? items.length,
    cleared: metrics?.automatically_cleared ?? comparisonCases.filter(item => item.status === 'OK').length,
    reviews: metrics?.human_reviews ?? comparisonCases.filter(item => item.status === 'NEEDS_REVIEW').length,
    rejected: metrics?.rejected ?? 0,
  }
  const issues = metrics?.top_flagged_issues || fallbackIssues(items)

  return (
    <details className="ops">
      <summary className="ops__summary">
        <span className="ops__summarycopy">
          <span className="eyebrow">Operations</span>
          <strong>Processing and system health</strong>
        </span>
        <span className="ops__quick" aria-label="Current operational summary">
          <span><b>{values.processed}</b> processed</span>
          <span><b>{values.reviews}</b> need review</span>
          <span className={'ops__health ops__health--' + healthTone(health)}>
            <i aria-hidden="true"></i>{healthWord(health)}
          </span>
        </span>
        <span className="ops__chevron" aria-hidden="true">⌄</span>
      </summary>

      <div className="ops__body">
        <div className="ops__analytics">
          <div className="ops__head">
            <div>
              <span className="eyebrow">Current processing run</span>
              <h2 id="ops-title">Operations snapshot</h2>
            </div>
          </div>

          <dl className="metricgrid">
            <Metric label="Emails processed" value={values.processed} />
            <Metric label="Automatically cleared" value={values.cleared} />
            <Metric label="Human reviews" value={values.reviews} />
            <Metric label="Rejected by reviewer" value={values.rejected} />
          </dl>

          <div className="ops__lower">
            <div>
              <span className="ops__label">Processing</span>
              <p>
                <b>{formatPercent(metrics?.parser_pct)}</b> deterministic document coverage
                <span>{formatDuration(metrics?.avg_processing_ms)} average per email</span>
              </p>
            </div>
            <div>
              <span className="ops__label">Top flagged issues</span>
              {issues.length > 0
                ? <ol className="issuebars">
                    {issues.slice(0, 5).map(issue => (
                      <li key={issue.label}>
                        <span>{issue.label}</span><b>{issue.count}</b>
                      </li>
                    ))}
                  </ol>
                : <p className="ops__empty">No issue breakdown in this data source.</p>}
            </div>
          </div>
        </div>

        <HealthPanel health={health} />
      </div>
    </details>
  )
}

function Metric({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
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
              <i aria-hidden="true"></i>{component.state}
            </b>
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

function fallbackIssues(items) {
  const counts = new Map()
  const add = label => counts.set(label, (counts.get(label) || 0) + 1)
  for (const item of items) {
    if (item.wire_review_reason === 'missing_attachment') add('Missing attachment')
    if (item.wire_review_reason === 'wrong_doc_type') add('Wrong document type')
    if (item.wire_review_reason === 'unreadable') add('Unreadable document')
    if (item.wire_review_reason === 'missing_value') add('Missing or uncertain field')
    if ((item.defect_fields || []).some(field => ['shipper', 'consignee', 'notify_party'].includes(field))) {
      add('Party mismatch')
    }
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—'
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return 'Not recorded'
  if (value < 1000) return `${Math.max(1, Math.round(value))} ms`
  return `${(value / 1000).toFixed(1)} sec`
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
