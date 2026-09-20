import { useEffect, useState } from 'react'

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const openCase = /^#\/case\/([A-Za-z0-9_-]+)/.exec(hash)
  if (openCase) return { name: 'case', id: openCase[1] }
  if (hash.startsWith('#/review')) return { name: 'review' }
  return { name: 'worklist' }
}
