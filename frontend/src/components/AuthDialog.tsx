import { useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { recoveryQuestions } from '../lib/recoveryQuestions';

type View = 'login' | 'signup' | 'recover-username' | 'recover-answer';

export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const { login, register } = useAuth();
  const [view, setView] = useState<View>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [challenge, setChallenge] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (view === 'login') {
        await login(username, password);
        onClose();
      } else if (view === 'signup') {
        await register({ username, email: email || undefined, password, recoveryQuestion, recoveryAnswer });
        onClose();
      } else if (view === 'recover-username') {
        setChallenge((await authApi.challenge(username)).question);
        setView('recover-answer');
      } else {
        setMessage((await authApi.reset({ username, recoveryAnswer, newPassword: password })).message);
        setView('login');
        setPassword('');
        setRecoveryAnswer('');
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isSignup = view === 'signup';
  const isRecovery = view.startsWith('recover');

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="icon-btn auth-dialog__close" type="button" onClick={onClose} aria-label="Close account dialog">
          <X size={20} />
        </button>
        <div className="auth-dialog__icon"><LockKeyhole size={22} /></div>
        <h2 id="auth-title">
          {isSignup ? 'Create your account' : isRecovery ? 'Reset your password' : 'Welcome back'}
        </h2>
        <p className="auth-dialog__intro">
          {isSignup
            ? 'Choose a username for sign-in. Email is optional and your practice remains private.'
            : isRecovery
              ? 'Use the recovery answer you chose when signing up.'
              : 'Sign in with your username to continue saved practice.'}
        </p>

        {!isRecovery && (
          <div className="tabs" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={view === 'login'} onClick={() => setView('login')}>Sign in</button>
            <button type="button" role="tab" aria-selected={view === 'signup'} onClick={() => setView('signup')}>Create account</button>
          </div>
        )}

        <form className="form-stack" onSubmit={submit}>
          <label className="field">
            <span>Username</span>
            <input
              type="text" autoComplete="username" required minLength={3} maxLength={30}
              pattern="[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]"
              value={username} onChange={(event) => setUsername(event.target.value)}
            />
            {isSignup && <small>3–30 characters. Use letters, numbers, dots, underscores or hyphens.</small>}
          </label>

          {isSignup && (
            <label className="field">
              <span>Email <small>(optional)</small></span>
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
          )}

          {view !== 'recover-username' && (
            <div className="field">
              <label htmlFor="account-password">{view === 'recover-answer' ? 'New password' : 'Password'}</label>
              <div className="password-input">
                <input
                  id="account-password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete={isSignup || view === 'recover-answer' ? 'new-password' : 'current-password'}
                  minLength={view === 'login' ? 1 : 5}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={passwordVisible}
                >
                  {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {view !== 'login' && <small>At least 5 characters</small>}
            </div>
          )}

          {isSignup && (
            <>
              <label className="field">
                <span>Recovery question</span>
                <select required value={recoveryQuestion} onChange={(event) => setRecoveryQuestion(event.target.value)}>
                  <option value="" disabled>Choose a question</option>
                  {recoveryQuestions.map((question) => <option key={question} value={question}>{question}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Recovery answer</span>
                <input type="password" required minLength={3} maxLength={180} value={recoveryAnswer} onChange={(event) => setRecoveryAnswer(event.target.value)} />
                <small>Stored as a secure hash. It cannot be shown later.</small>
              </label>
            </>
          )}

          {view === 'recover-answer' && (
            <label className="field">
              <span>{challenge}</span>
              <input type="password" required value={recoveryAnswer} onChange={(event) => setRecoveryAnswer(event.target.value)} />
            </label>
          )}

          {error && <div className="form-alert form-alert--error" role="alert">{error}</div>}
          {message && <div className="form-alert form-alert--success" role="status">{message}</div>}

          <button className="button button--primary button--wide" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : isRecovery ? <KeyRound size={18} /> : null}
            {busy ? 'Please wait…' : view === 'login' ? 'Sign in' : view === 'signup' ? 'Create account' : view === 'recover-username' ? 'Show my question' : 'Reset password'}
          </button>
        </form>

        {view === 'login' && <button className="text-button" type="button" onClick={() => setView('recover-username')}>Forgot password?</button>}
        {isRecovery && <button className="text-button" type="button" onClick={() => setView('login')}><ArrowLeft size={15} /> Back to sign in</button>}
      </section>
    </div>
  );
}
