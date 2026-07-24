import { Cloud, LogOut, Timer, UserRound } from 'lucide-react';
import whaleMark from '../assets/whale-mark.png';
import { useAuth } from '../context/AuthContext';
import { formatTime } from '../lib/assessment';

type Props = {
  onOpenAuth: () => void;
  showTimer?: boolean;
  timeRemaining?: number;
  compact?: boolean;
};

export default function TopNav({ onOpenAuth, showTimer = false, timeRemaining = 0, compact = false }: Props) {
  const { user, logout } = useAuth();
  return (
    <header className={`topbar${compact ? ' topbar--compact' : ''}`}>
      <a className="brand" href="/" onClick={(event) => event.preventDefault()} aria-label="Moby home">
        <span className="brand__mark"><img src={whaleMark} alt="" /></span>
        <span className="brand__wording">
          <strong>Moby</strong>
        </span>
      </a>
      <div className="topbar__actions">
        {showTimer && (
          <div className={`timer-chip${timeRemaining <= 60 ? ' timer-chip--urgent' : ''}`} aria-label={`${formatTime(timeRemaining)} remaining`}>
            <Timer size={16} /> <strong>{formatTime(timeRemaining)}</strong>
          </div>
        )}
        {user ? (
          <div className="account-chip">
            <Cloud size={15} />
            <span>{user.username || user.email || 'Account'}</span>
            <button type="button" onClick={() => void logout()} aria-label="Sign out"><LogOut size={15} /></button>
          </div>
        ) : (
          <button className="button button--quiet topbar__signin" type="button" onClick={onOpenAuth}>
            <UserRound size={17} /> Login
          </button>
        )}
      </div>
    </header>
  );
}
