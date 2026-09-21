import { useEffect, useState } from 'react'
import Bar from './Bar.jsx'
import Dashboard from './Dashboard.jsx'
import { getCases } from './api.js'

export default function Analytics({ health }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getCases().then(data => setItems(data.items)).catch(reason => setError(reason.message))
  }, [])

  const openWorklist = filter => {
    const params = new URLSearchParams({ kind: filter.kind, value: filter.value })
    window.location.hash = `#/worklist?${params}`
  }

  return (
    <>
      <Bar title="Analytics" meta="case register" active="analytics" />
      <main className="amain">
        <header className="analyticshero">
          <div>
            <span className="eyebrow">Operational intelligence</span>
            <h1>See where the register needs attention.</h1>
            <p>Every number is calculated from the live case register. Select a chart value to open the affected cases.</p>
          </div>
          <a className="btn btn--ghost btn--small" href="#/">Open worklist</a>
        </header>
        {error && <div className="state state--error"><b>Could not load analytics.</b><span>{error}</span></div>}
        {!items && !error && <div className="state">Calculating register analytics.</div>}
        {items && (
          <Dashboard health={health} items={items} periodLabel="Full register" onDrillDown={openWorklist} standalone />
        )}
      </main>
    </>
  )
}
