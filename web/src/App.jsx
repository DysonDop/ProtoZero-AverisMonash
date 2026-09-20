import { useRoute } from './route.js'
import Worklist from './Worklist.jsx'
import Review from './Review.jsx'
import CaseView from './CaseView.jsx'

export default function App() {
  const route = useRoute()
  return (
    <div className="app">
      {route.name === 'worklist' && <Worklist />}
      {route.name === 'review' && <Review />}
      {route.name === 'case' && <CaseView id={route.id} />}
    </div>
  )
}
