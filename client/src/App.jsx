import { useAuth } from './auth/AuthContext.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Dashboard from './components/Dashboard.jsx';

// Top-level gate: show the auth screen until a session is established.
export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="centered muted">Loading…</div>;
  }
  return user ? <Dashboard /> : <AuthScreen />;
}
