import { useEffect, useState } from 'react'
import Bar from './Bar.jsx'
import Sheet from './Sheet.jsx'
import Evidence from './Evidence.jsx'
import { getCase } from './api.js'
import { FIELD_PLAIN, REASON_TITLE } from './status.js'

const DASH = '—'

export default function CaseView({ id }) {
  const [kase, setCase] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCase(null)
    getCase(id).then(setCase).catch(e => setError(e.message))
  }, [id])

  if (error) return <Frame meta={id}><div className="state">Could not open {id}. {error}</div></Frame>
  if (!kase) return <Frame meta={id}><div className="state">Opening {id}.</div></Frame>

  if (kase.category !== 'BL_COMPARISON') return <Frame meta={id}><NotACheck kase={kase} /></Frame>
  if (drawable(kase)) return <Frame meta={id}><Compared kase={kase} /></Frame>
  if (kase.status === 'NEEDS_REVIEW') return <Frame meta={id}><Refused kase={kase} /></Frame>
  return <Frame meta={id}><NothingToCompare kase={kase} /></Frame>
}

// A refusal with a readable draft still gets drawn, because the confidence mark
// on each field says which ones we would not stand behind. Only when there is no
// draft to draw, or nothing was compared, does the case fall back to cards.
function drawable(kase) {
  const bl = kase.documents.find(d => d.role === 'BL')
  const hasValues = bl && bl.readable && bl.fields &&
    Object.values(bl.fields).some(f => f && f.value)
  return Boolean(hasValues) && kase.comparisons.length > 0
}

function Frame({ meta, children }) {
  return (
    <>
      <Bar meta={meta} back="#/" />
      {children}
    </>
  )
}

function NotACheck({ kase }) {
  return (
    <div className="panel">
      <div className="card">
        <span className="card__title">{kase.subject}</span>
        <p className="card__body">{kase.summary}</p>
        <div className="card__evidence">
          <div><em>From</em><span>{kase.from_addr}</span></div>
          <div><em>Sorted as</em><span>{kase.category.toLowerCase().replace(/_/g, ' ')}</span></div>
        </div>
      </div>
    </div>
  )
}

// A comparison request that came out OK with nothing to draw is not a refusal.
// Saying "needs a person" here would contradict the worklist, which shows the
// same case as all clear.
function NothingToCompare({ kase }) {
  return (
    <div className="panel">
      <div className="card">
        <span className="card__title">Nothing to compare</span>
        <p className="card__body">{kase.summary}</p>
        <div className="card__evidence">
          <div><em>From</em><span>{kase.from_addr}</span></div>
          <div><em>Attachments</em><span>{kase.documents.length}</span></div>
        </div>
      </div>
      <div className="quiet">Nothing was flagged, because there was nothing to check.</div>
    </div>
  )
}

function Refused({ kase }) {
  const [decision, setDecision] = useState(null)
  const si = kase.documents.find(d => d.role === 'SI')
  const bl = kase.documents.find(d => d.role === 'BL')
  return (
    <>
    <div className="rmain">
      <div className="cards">
        <div className="card">
          <span className="card__title">{REASON_TITLE[kase.wire_review_reason] ?? 'Needs a person'}</span>
          <p className="card__body">{kase.summary}</p>
          <div className="card__evidence">
            <div><em>Instruction</em><span>{si ? si.detected_kind : 'not attached'}</span></div>
            <div><em>Draft</em><span>{bl ? bl.detected_kind : 'not attached'}</span></div>
          </div>
        </div>
      </div>
      <span className="grow"></span>
      <div className="quiet">We would rather ask than guess. Nothing here was compared.</div>
    </div>
    <Actions
      choices={REFUSAL_CHOICES[kase.wire_review_reason] ?? CHOICES.NEEDS_REVIEW}
      decision={decision}
      onDecide={setDecision}
    />
    </>
  )
}

function Compared({ kase }) {
  const [selected, setSelected] = useState(null)
  const [decision, setDecision] = useState(null)

  const wrong = kase.comparisons.filter(c => c.verdict === 'MISMATCH')
  const blocked = kase.comparisons.filter(
    c => c.verdict !== 'MISMATCH' && c.confidence && c.confidence.hard_fail)
  const matched = kase.comparisons.filter(c => c.verdict === 'MATCH').length
  const noted = wrong.length + blocked.length
  const open = kase.comparisons.find(c => c.field === selected)
  const isNoted = [...wrong, ...blocked].some(c => c.field === selected)
  const close = () => setSelected(null)

  return (
    <>
    <div className="stage">
      <div className="sheetwrap">
        <Sheet kase={kase} selected={selected} onSelect={setSelected} />
        <p className="sheet__hint">Click any checked field to see the line it came from.</p>
      </div>
      <div className="margin">
        {open && !isNoted && (
          <Evidence emailId={kase.email_id} comparison={open} onClose={close} />
        )}

        {wrong.map(c => c.field === selected
          ? <Evidence key={c.field} emailId={kase.email_id} comparison={c} onClose={close} />
          : <MismatchNote key={c.field} c={c} />)}

        {blocked.map(c => c.field === selected
          ? <Evidence key={c.field} emailId={kase.email_id} comparison={c} onClose={close} />
          : <BlockedNote key={c.field} c={c} />)}

        {noted === 0
          ? <div className="quiet">All {matched} details match the instruction.</div>
          : <div className="quiet">The other {matched} details match the instruction.</div>}
      </div>
    </div>
    <Actions
      choices={CHOICES[kase.status] ?? CHOICES.OK}
      decision={decision}
      onDecide={setDecision}
    />
    </>
  )
}

function MismatchNote({ c }) {
  return (
    <div className="note">
      <span className="note__field">{FIELD_PLAIN[c.field]}</span>
      <span className="note__value note__value--wrong strike">{c.bl.value ?? DASH}</span>
      <span className="note__value note__value--right">{c.si.value ?? DASH}</span>
      {c.si.label_seen && c.bl.label_seen && c.si.label_seen !== c.bl.label_seen && (
        <div className="note__synonym">
          Instruction calls this <b>{c.si.label_seen}</b>. Draft calls it <b>{c.bl.label_seen}</b>.
        </div>
      )}
    </div>
  )
}

function BlockedNote({ c }) {
  return (
    <div className="note">
      <span className="note__field">{FIELD_PLAIN[c.field]}</span>
      <p className="note__body">{whyNotChecked(c)}</p>
      <div className="note__synonym">
        Instruction <b>{c.si.value || DASH}</b> &nbsp;&#183;&nbsp; Draft <b>{c.bl.value || DASH}</b>
      </div>
    </div>
  )
}

const CHOICES = {
  MISMATCH: [
    { label: 'Reject the draft', done: 'Draft rejected.' },
    { label: 'Send to a person', done: 'Sent to a person.' },
  ],
  OK: [
    { label: 'Approve the draft', done: 'Draft approved.' },
    { label: 'Send to a person', done: 'Sent to a person.' },
  ],
  NEEDS_REVIEW: [
    { label: 'Send to a person', done: 'Sent to a person.' },
    { label: 'Ask for a complete instruction', done: 'Asked for a complete instruction.' },
  ],
}

// A refusal reached from the worklist gets the same wording as the same case in
// the review queue, so the two screens never disagree about what can be done.
const REFUSAL_CHOICES = {
  missing_attachment: [
    { label: 'Ask for the draft', done: 'Asked for the draft.' },
    { label: 'Dismiss', done: 'Dismissed.' },
  ],
  wrong_doc_type: [
    { label: 'Ask for the right file', done: 'Asked for the right file.' },
    { label: 'Dismiss', done: 'Dismissed.' },
  ],
  unreadable: [
    { label: 'Retry with OCR', done: 'Queued for another read.' },
    { label: 'Request a text copy', done: 'Asked for a text copy.' },
  ],
  missing_value: [
    { label: 'Fill it in', done: 'Sent to a person to fill in.' },
    { label: 'Dismiss', done: 'Dismissed.' },
  ],
}

function Actions({ choices, decision, onDecide }) {
  if (decision) {
    return (
      <div className="fbar">
        <span className="fbar__done">{decision.done}</span>
        <span className="grow"></span>
        <button className="btn btn--ghost" type="button" onClick={() => onDecide(null)}>Undo</button>
      </div>
    )
  }
  return (
    <div className="fbar">
      <span className="grow"></span>
      <button className="btn btn--ghost" type="button" onClick={() => onDecide(choices[1])}>
        {choices[1].label}
      </button>
      <button className="btn" type="button" onClick={() => onDecide(choices[0])}>
        {choices[0].label}
      </button>
    </div>
  )
}

// "N/A" and a row of underscores are written into these documents where a value
// is absent, so they are gaps rather than values, same as an empty string.
const NOT_A_VALUE = /^(n\/?a|-+|_+|none|nil)$/i

function whyNotChecked(c) {
  const gap = v => !v || NOT_A_VALUE.test(String(v).trim())
  const siGap = gap(c.si.value)
  const blGap = gap(c.bl.value)
  if (siGap && blGap) return 'Neither document gives this, so there was nothing to compare.'
  if (siGap) return 'The instruction does not give this, so there is nothing to compare the draft against. A blank is a gap in what we were given, not a disagreement.'
  if (blGap) return 'The draft does not give this in a form we could read, so we have not checked it.'
  return 'We could not stand behind our reading of this one, so we have not checked it.'
}
