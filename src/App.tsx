import QuizEditor from './components/QuizEditor';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen">
        <QuizEditor />
      </div>
    </ErrorBoundary>
  );
}
