import { useEffect, useRef, useState } from 'react'
import { getDocument, getRawDocumentUrl } from './api.js'
import { FIELD_PLAIN, confidencePercent } from './status.js'

export default function Evidence({ emailId, comparison, sourceFields, onClose }) {
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
    <section className="doccompare" aria-labelledby="evidence-title">
      <div className="ev__head">
        <span>
          <span className="ev__eyebrow">Side-by-side source evidence</span>
          <span className="ev__field" id="evidence-title">{FIELD_PLAIN[comparison.field] ?? comparison.field}</span>
          <span className="ev__score">Machine confidence {confidencePercent(comparison) || 'not recorded'}</span>
        </span>
        <button className="ev__close" type="button" onClick={onClose} aria-label="Close evidence">
          &#215;
        </button>
      </div>

      {error && <p className="note__body">Could not open the documents. {error}</p>}
      {!error && !docs && <p className="note__body">Opening the documents.</p>}

      {docs && (
        <>
          <p className="ev__intro">
            These are the complete source-text previews. Each pane has scrolled to the original line used for comparison.
          </p>
          <div className="doccompare__grid">
            <DocumentPreview
              emailId={emailId}
              role="SI"
              label="Shipping instruction"
              document={docs.si}
              field={sourceFields?.si || comparison.si}
              comparedField={comparison.si}
            />
            <DocumentPreview
              emailId={emailId}
              role="BL"
              label="Bill of lading"
              document={docs.bl}
              field={sourceFields?.bl || comparison.bl}
              comparedField={comparison.bl}
            />
          </div>
        </>
      )}
    </section>
  )
}

function DocumentPreview({ emailId, role, label, document, field, comparedField }) {
  const markRef = useRef(null)
  const parts = documentParts(document.text, field)
  const rawUrl = getRawDocumentUrl(emailId, role)

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: 'center' })
  }, [document.text, field?.locator?.char_start])

  return (
    <article className="docpreview">
      <header className="docpreview__head">
        <div>
          <span className="ev__doc">{label}</span>
          <strong>{fileOf(document.attachment_path) || `${role} source`}</strong>
          <small>{locationOf(field?.locator)} · {document.fmt?.toUpperCase()}</small>
        </div>
        {rawUrl && <a href={rawUrl} target="_blank" rel="noreferrer">Open original</a>}
      </header>
      {comparedField?.extracted_by === 'human' && (
        <p className="docpreview__correction">
          Human comparison value: <b>{comparedField.value}</b>. The highlight below remains the original extracted evidence.
        </p>
      )}
      {parts
        ? (
          <pre className="docpreview__text">
            {parts.before}<mark ref={markRef}>{parts.value}</mark>{parts.after}
          </pre>
        )
        : <div className="docpreview__empty">No source text was available for this document.</div>}
    </article>
  )
}

function documentParts(text, field) {
  if (!text) return null
  const locator = field?.locator
  const { char_start: start, char_end: end } = locator || {}
  if (start != null && end != null && start >= 0 && end > start && end <= text.length) {
    return { before: text.slice(0, start), value: text.slice(start, end), after: text.slice(end) }
  }

  const evidence = field?.evidence || field?.value
  const foundAt = evidence ? text.indexOf(String(evidence).split('\n')[0]) : -1
  if (foundAt < 0) return { before: '', value: text, after: '' }
  return {
    before: text.slice(0, foundAt),
    value: text.slice(foundAt, foundAt + String(evidence).split('\n')[0].length),
    after: text.slice(foundAt + String(evidence).split('\n')[0].length),
  }
}

function locationOf(locator) {
  if (!locator) return 'Location unavailable'
  if (locator.page != null) return `Page ${locator.page}`
  if (locator.sheet) return `${locator.sheet}, row ${locator.line ?? '—'}`
  if (locator.line != null) return `Line ${locator.line + 1}`
  return 'Location unavailable'
}

function fileOf(path) {
  return String(path || '').split('/').pop()
}
