export default function Bar({ meta, back }) {
  return (
    <div className="thin">
      {back && <a className="thin__back" href={back} aria-label="Back to the worklist">&#8592;</a>}
      <a className="thin__home" href="#/" aria-label="Protozero, back to the worklist">
        <span className="thin__mark">ProtoZer<span className="z">0</span></span>
      </a>
      <span className="thin__meta">{meta}</span>
    </div>
  )
}
