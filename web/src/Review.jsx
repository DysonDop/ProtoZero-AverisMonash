import { useEffect, useState } from 'react'
import Bar from './Bar.jsx'
import { fixtureMode, getReview, resolveReview, retryReview } from './api.js'

const TITLE = {
  MISSING_ATTACHMENT: 'Nothing attached to check',
  UNREADABLE_DOCUMENT: 'The file will not open',
  WRONG_DOC_TYPE: 'Wrong document attached',
  FIELD_NOT_FOUND: 'A value is blank',
  GROUNDING_FAILED: 'We could not find the evidence',
  LOW_CONFIDENCE: 'Too close to call',
  BORDERLINE_MATCH: 'Too close to call',
  PROCESSING_ERROR: 'Something went wrong reading this',
  MANUAL_REVIEW_REQUESTED: 'A teammate asked for a second check',
}

const ACTIONS = {
  MISSING_ATTACHMENT: ['Ask for the draft', 'Dismiss'],
  UNREADABLE_DOCUMENT: ['Retry with OCR', 'Request a text copy'],
  WRONG_DOC_TYPE: ['Ask for the right file', 'Dismiss'],
  FIELD_NOT_FOUND: ['Fill it in', 'Dismiss'],
}

export default function Review() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    getReview().then(d => setItems(d.items)).catch(e => setError(e.message))
  }, [])

  async function resolve(item, action) {
    const previous = items
    setPending(item.id)
    setError(null)
    setNotice(null)
    setItems(items.filter(i => i.id !== item.id))
    try {
      await resolveReview(item.id, {
        action: action === 'Dismiss' || action === 'Confirm' ? 'confirm' : 'correct',
        field: item.fields[0] ?? null,
        correct_value: null,
        reviewer_id: 'demo-reviewer',
      })
    } catch (e) {
      setItems(previous)
      setError(e.message)
    } finally {
      setPending(null)
    }
  }

  async function retry(item) {
    setPending(item.id)
    setError(null)
    setNotice(null)
    try {
      await retryReview(item.id)
      const fresh = await getReview()
      setItems(fresh.items)
      setNotice(`${item.email_id} was processed again.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setPending(null)
    }
  }

  if (error) return <Shell meta="needs a person"><div className="state">Could not reach the review service. {error}</div></Shell>
  if (!items) return <Shell meta="needs a person"><div className="state">Reading the queue.</div></Shell>

  const open = items.length

  return (
    <Shell meta={open + ' open'}>
      <div className="rmain">
        <div className="reviewhead">
          <span className="eyebrow">Human checkpoint</span>
          <h1>Cases waiting for judgement</h1>
          <p>ProtoZero stopped here instead of guessing. Open a case to inspect the source, retry a failed read, or mark the question handled.</p>
        </div>
        <div className="chips">
          <a className="chip" href="#/"><span className="mk mk--none"></span>All emails</a>
          <span className="chip chip--on"><span className="mk mk--review"></span>Needs a person<span className="chip__count">{open}</span></span>
        </div>

        {notice && <div className="reviewnotice" role="status">{notice}</div>}

        {open === 0 ? (
          <div className="state">Nothing is waiting on a person.</div>
        ) : (
          <div className="cards">
            {items.map(item => {
              const [primary, secondary] = ACTIONS[item.reason] ?? ['Confirm', 'Correct']
              const hasEvidence = item.si_value || item.bl_value
              return (
                <div className="card" key={item.id}>
                  <span className="card__ref">{item.email_id}</span>
                  <a className="card__title" href={'#/case/' + item.email_id}>
                    {TITLE[item.reason] ?? 'Needs a person'}
                  </a>
                  <p className="card__body">{item.reason_detail}</p>
                  {hasEvidence && (
                    <div className="card__evidence">
                      <div><em>Instruction</em><span>{item.si_value ?? '—'}</span></div>
                      <div><em>Draft</em><span>{item.bl_value ?? '—'}</span></div>
                    </div>
                  )}
                  <div className="card__actions">
                    <a className="btn btn--ghost btn--small" href={'#/case/' + item.email_id}>Open case</a>
                    {!fixtureMode && retryable(item.reason) && (
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        disabled={pending === item.id}
                        onClick={() => retry(item)}
                      >
                        Retry failed stage
                      </button>
                    )}
                    {fixtureMode ? (
                      <>
                        <button className="btn btn--small" type="button" onClick={() => resolve(item, primary)}>{primary}</button>
                        <button className="btn btn--ghost btn--small" type="button" onClick={() => resolve(item, secondary)}>{secondary}</button>
                      </>
                    ) : (
                      <button
                        className="btn btn--small"
                        type="button"
                        disabled={pending === item.id}
                        onClick={() => resolve(item, 'Confirm')}
                      >
                        Mark handled
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <span className="grow"></span>
        <div className="quiet">Whatever a person decides here is remembered, so the same question is not asked twice.</div>
      </div>
    </Shell>
  )
}

function retryable(reason) {
  return ['UNREADABLE_DOCUMENT', 'GROUNDING_FAILED', 'PROCESSING_ERROR'].includes(reason)
}

function Shell({ meta, children }) {
  return (
    <>
      <Bar meta={meta} back="#/" title="Needs a person" />
      {children}
    </>
  )
}
