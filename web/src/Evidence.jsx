import { useEffect, useState } from 'react'
import { getDocument } from './api.js'
import { FIELD_PLAIN } from './status.js'

export default function Evidence({ emailId, comparison, onClose }) {
  const [docs, setDocs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    Promise.all([getDocument(emailId, 'SI'), getDocument(emailId, 'BL')])
      .then(([si, bl]) => { if (live) setDocs({ si, bl }) })
      .catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [emailId])

  return (
    <div className="ev">
      <div className="ev__head">
        <span className="ev__field">{FIELD_PLAIN[comparison.field] ?? comparison.field}</span>
        <button className="ev__close" type="button" onClick={onClose} aria-label="Close evidence">
          &#215;
        </button>
      </div>

      {error && <p className="note__body">Could not open the documents. {error}</p>}
      {!error && !docs && <p className="note__body">Opening the documents.</p>}

      {docs && (
        <>
          <Side label="Instruction" text={docs.si.text} field={comparison.si} />
          <Side label="Draft" text={docs.bl.text} field={comparison.bl} />
        </>
      )}
    </div>
  )
}

function Side({ label, text, field }) {
  const line = lineAround(text, field.locator) || evidenceAround(field)
  return (
    <div className="ev__side">
      <span className="ev__doc">{label}</span>
      {line
        ? (
          <span className="ev__line">
            {line.before}<mark>{line.value}</mark>{line.after}
          </span>
        )
        : <span className="ev__none">Nothing was found for this field in this document.</span>}
    </div>
  )
}

// Spreadsheet locators identify a sheet and row rather than character offsets.
// The parser also stores the exact evidence string, so use that instead of
// claiming nothing was found when a row-based source cannot be sliced by char.
function evidenceAround(field) {
  const evidence = field?.evidence
  if (!evidence) return null
  const value = field?.value == null ? '' : String(field.value)
  const start = value ? evidence.indexOf(value) : -1
  if (start < 0) return { before: '', value: evidence, after: '' }
  return {
    before: evidence.slice(0, start),
    value,
    after: evidence.slice(start + value.length),
  }
}

// The locator points at the value itself. Widening it to the enclosing line is
// what makes the highlight readable: the label sits to the left of the value in
// every one of these documents, and it is the label that proves we read the
// right row.
function lineAround(text, locator) {
  if (!text || !locator) return null
  const { char_start: start, char_end: end } = locator
  if (start == null || end == null) return null
  const from = text.lastIndexOf('\n', start - 1) + 1
  let to = text.indexOf('\n', end)
  if (to === -1) to = text.length
  return {
    before: text.slice(from, start),
    value: text.slice(start, end),
    after: text.slice(end, to),
  }
}
