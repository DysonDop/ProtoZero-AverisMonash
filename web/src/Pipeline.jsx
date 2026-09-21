import { kindOf } from './status.js'

export default function Pipeline({ items, onSelect }) {
  const total = items.length
  const checks = items.filter(item => item.category === 'BL_COMPARISON')
  const routed = total - checks.length
  const wrong = checks.filter(item => kindOf(item) === 'wrong').length
  const review = checks.filter(item => kindOf(item) === 'review').length
  const cleared = checks.length - wrong - review

  if (total === 0) return null

  const outcomes = [
    { key: 'clear', mark: 'clear', label: 'Cleared', value: cleared,
      note: 'All seven fields agreed' },
    { key: 'wrong', mark: 'wrong', label: 'Differences found', value: wrong,
      note: 'At least one field disagreed' },
    { key: 'review', mark: 'review', label: 'Sent to a person', value: review,
      note: 'Could not be decided safely' },
  ]

  return (
    <div className="pipeline">
      <span className="eyebrow">How the register was decided</span>

      <div className="pipeline__stage">
        <p className="pipeline__caption">
          <b>{total}</b> emails read · <b>{checks.length}</b> were document checks
        </p>
        <div className="pipeline__split" role="img"
             aria-label={`${checks.length} of ${total} emails were document checks; ${routed} were routed away`}>
          <span className="pipeline__seg pipeline__seg--checks"
                style={{ flexGrow: checks.length || 1 }}>
            <b>{checks.length}</b> checked
          </span>
          <span className="pipeline__seg pipeline__seg--routed"
                style={{ flexGrow: routed || 1 }}>
            <b>{routed}</b> routed away
          </span>
        </div>
      </div>

      <ol className="pipeline__outcomes">
        {outcomes.map(row => (
          <li key={row.key}>
            <button type="button" onClick={() => onSelect?.(row.key)}
                    disabled={row.value === 0}>
              <span className={'mk mk--' + row.mark} aria-hidden="true"></span>
              <span className="pipeline__label">
                <strong>{row.label}</strong>
                <small>{row.note}</small>
              </span>
              <b className="pipeline__count">{row.value}</b>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
