import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { VerifyPage } from '@/pages/VerifyPage';
import { ResultPage } from '@/pages/ResultPage';

function App() {
  return (
    <div className="dark">
      <Router>
        <Routes>
          <Route path="/" element={<VerifyPage />} />
          <Route path="/result" element={<ResultPage />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;