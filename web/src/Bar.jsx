export default function Bar({ meta, back }) {
  return (
    <div className="thin">
      {back && <a className="thin__back" href={back} aria-label="Back to the worklist">&#8592;</a>}
      <a className="thin__home" href="#/">
        <span className="thin__mark"></span>
        <span className="thin__name">protozero</span>
      </a>
      <span className="thin__meta">{meta}</span>
    </div>
  )
}
