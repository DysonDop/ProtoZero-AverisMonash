import { useEffect, useState } from 'react'
import Bar from './Bar.jsx'
import Sheet from './Sheet.jsx'
import Evidence from './Evidence.jsx'
import AuditTrail from './AuditTrail.jsx'
import {
  clearCaseDecision, getCase, getCaseDecision, recordCaseDecision,
} from './api.js'
import { FIELD_PLAIN, KIND_WORD, REASON_TITLE, kindOf } from './status.js'

const DASH = '—'

export default function CaseView({ id }) {
  const [kase, setCase] = useState(null)
  const [error, setError] = useState(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [selectedField, setSelectedField] = useState(null)

  useEffect(() => {
    setCase(null)
    setError(null)
    setAuditOpen(false)
    setSelectedField(null)
    getCase(id).then(setCase).catch(e => setError(e.message))
  }, [id])

  if (error) return <Frame meta={id}><div className="state">Could not open {id}. {error}</div></Frame>
  if (!kase) return <Frame meta={id}><div className="state">Opening {id}.</div></Frame>

  let content
  if (kase.category !== 'BL_COMPARISON') content = <NotACheck kase={kase} />
  else if (drawable(kase)) {
    content = <Compared kase={kase} selected={selectedField} onSelect={setSelectedField} />
  }
  else if (kase.status === 'NEEDS_REVIEW') content = <Refused kase={kase} />
  else content = <NothingToCompare kase={kase} />

  const viewEvidence = drawable(kase)
    ? field => {
        setSelectedField(field)
        setAuditOpen(false)
      }
    : null

  return (
    <Frame
      meta={id}
      kase={kase}
      auditOpen={auditOpen}
      onAudit={() => setAuditOpen(!auditOpen)}
      onCloseAudit={() => setAuditOpen(false)}
      onViewEvidence={viewEvidence}
    >
      {content}
    </Frame>
  )
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

function Frame({ meta, kase, auditOpen, onAudit, onCloseAudit, onViewEvidence, children }) {
  const action = kase && (
    <button
      className="thin__audit"
      type="button"
      aria-expanded={auditOpen}
      aria-controls="case-audit"
      onClick={onAudit}
    >
      <span className="thin__auditmark" aria-hidden="true"></span>
      Audit trail
    </button>
  )
  return (
    <>
      <Bar meta={meta} back="#/" action={action} title="Document check" />
      {kase && <CaseBanner kase={kase} />}
      {children}
      {auditOpen && (
        <AuditTrail kase={kase} onClose={onCloseAudit} onViewEvidence={onViewEvidence} />
      )}
    </>
  )
}

function CaseBanner({ kase }) {
  const kind = kindOf(kase)
  return (
    <section className="casebanner" aria-labelledby="case-title">
      <span className={'mk mk--' + kind} aria-hidden="true"></span>
      <div className="casebanner__body">
        <span className={'casebanner__status casebanner__status--' + kind}>{KIND_WORD[kind]}</span>
        <h1 id="case-title">{kase.subject || kase.email_id}</h1>
        <p>{kase.summary}</p>
      </div>
      <dl className="casebanner__meta">
        <div><dt>Case</dt><dd>{kase.email_id}</dd></div>
        <div><dt>From</dt><dd>{kase.from_addr || 'not recorded'}</dd></div>
      </dl>
    </section>
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
    <Actions kase={kase} />
    </>
  )
}

function Compared({ kase, selected, onSelect }) {

  const wrong = kase.comparisons.filter(c => c.verdict === 'MISMATCH')
  const blocked = kase.comparisons.filter(
    c => c.verdict !== 'MISMATCH' && c.confidence && c.confidence.hard_fail)
  const matched = kase.comparisons.filter(c => c.verdict === 'MATCH').length
  const noted = wrong.length + blocked.length
  const open = kase.comparisons.find(c => c.field === selected)
  const isNoted = [...wrong, ...blocked].some(c => c.field === selected)
  const close = () => onSelect(null)

  return (
    <>
    <div className="stage">
      <div className="sheetwrap">
        <Sheet kase={kase} selected={selected} onSelect={onSelect} />
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
    <Actions kase={kase} />
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
    { action: 'reject', label: 'Reject the draft', done: 'Draft rejected.' },
    { action: 'review', label: 'Send to a person', done: 'Sent to a person.' },
  ],
  OK: [
    { action: 'approve', label: 'Approve the draft', done: 'Draft approved.' },
    { action: 'review', label: 'Send to a person', done: 'Sent to a person.' },
  ],
  NEEDS_REVIEW: [
    { action: 'review', label: 'Send to a person', done: 'Sent to a person.' },
    { action: 'request', label: 'Ask for a complete instruction', done: 'Asked for a complete instruction.' },
  ],
}

const CHOICE_IMPACT = {
  reject: {
    title: 'Reject this draft?',
    detail: 'This closes the case as rejected and records your decision in the audit trail. It does not edit the draft or email the sender.',
    confirm: 'Confirm rejection',
  },
  approve: {
    title: 'Approve this draft?',
    detail: 'This closes the case as approved and records your decision in the audit trail. It does not send the document onward automatically.',
    confirm: 'Confirm approval',
  },
  review: {
    title: 'Send this for a second check?',
    detail: 'This adds the case to the Needs a person queue and records the handoff. It does not send an email or change either document.',
    confirm: 'Confirm handoff',
  },
  request: {
    title: 'Request a complete instruction?',
    detail: 'This adds a follow-up item to the Needs a person queue. It records the request but does not email the sender automatically.',
    confirm: 'Confirm request',
  },
}

const DECISION_RESULT = {
  reject: 'The case is closed as rejected. No email was sent.',
  approve: 'The case is closed as approved. Nothing was sent automatically.',
  review: 'The case is now in the Needs a person queue.',
  request: 'A follow-up item is now in the Needs a person queue.',
}

function Actions({ kase }) {
  const [decision, setDecision] = useState(null)
  const [pendingChoice, setPendingChoice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const choices = CHOICES[kase.status] ?? CHOICES.OK

  useEffect(() => {
    let live = true
    getCaseDecision(kase.email_id)
      .then(value => { if (live) setDecision(value) })
      .catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [kase.email_id])

  async function decide(choice) {
    setBusy(true)
    setError(null)
    try {
      setDecision(await recordCaseDecision(kase.email_id, choice))
      setPendingChoice(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    setBusy(true)
    setError(null)
    try {
      await clearCaseDecision(kase.email_id)
      setDecision(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (decision) {
    return (
      <div className="fbar">
        <span className="fbar__done">
          <b>{decision.done}</b>
          <em>{DECISION_RESULT[decision.action]}</em>
        </span>
        <span className="grow"></span>
        <button className="btn btn--ghost" type="button" disabled={busy} onClick={undo}>Undo</button>
      </div>
    )
  }

  if (pendingChoice) {
    const impact = CHOICE_IMPACT[pendingChoice.action]
    return (
      <div className="fbar fbar--confirm" role="group" aria-label="Confirm case action">
        <span className="fbar__impact">
          <b>{impact.title}</b>
          <span>{impact.detail}</span>
        </span>
        <span className="grow"></span>
        <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => setPendingChoice(null)}>
          Cancel
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => decide(pendingChoice)}>
          {busy ? 'Saving…' : impact.confirm}
        </button>
      </div>
    )
  }

  return (
    <div className="fbar">
      {error && <span className="fbar__error">{error}</span>}
      <span className="fbar__prompt">Choose what should happen next. The decision will appear in the audit trail.</span>
      <span className="grow"></span>
      <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => setPendingChoice(choices[1])}>
        {choices[1].label}
      </button>
      <button className="btn" type="button" disabled={busy} onClick={() => setPendingChoice(choices[0])}>
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
