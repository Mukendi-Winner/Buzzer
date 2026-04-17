import { useNavigate } from 'react-router-dom'
import './Mode.css'
import AppLogo from '../../components/AppLogo.jsx'

const options = [
  {
    id: 'player',
    label: 'PLAYER',
    tone: 'light',
    icon: <GamepadIcon />,
  },
  {
    id: 'host',
    label: 'HOST',
    tone: 'accent',
    icon: <GroupIcon />,
  },
]

function Mode() {
  const navigate = useNavigate()

  return (
    <main className="mode-picker">
      <header className="brand" aria-label="Club Genie en Herbe">
        <AppLogo className="brand-mark" />
      </header>

      <section className="mode-panel" aria-label="Choose mode">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`mode-card mode-card--${option.tone}`}
            onClick={
              option.id === 'host'
                ? () => navigate('/configuration')
                : () => navigate('/player/join')
            }
          >
            <span className="mode-card__icon" aria-hidden="true">
              {option.icon}
            </span>
            <span className="mode-card__label">{option.label}</span>
          </button>
        ))}
      </section>
    </main>
  )
}

function GamepadIcon() {
  return (
    <svg viewBox="0 0 64 64" className="mode-icon" aria-hidden="true">
      <path d="M22.5 23h19c5.1 0 9.45 3.69 10.28 8.72l1.7 10.28a5.98 5.98 0 0 1-8.98 6.11l-7.39-4.36a10.05 10.05 0 0 0-10.22 0l-7.39 4.36A5.98 5.98 0 0 1 10.52 42l1.7-10.28C13.05 26.69 17.4 23 22.5 23Z" />
      <path d="M22 31.5v8M18 35.5h8M39.5 34.5h.01M45.5 38.5h.01" />
    </svg>
  )
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 64 64" className="mode-icon" aria-hidden="true">
      <path d="M32 20a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-14 4a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm28 0a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" />
      <path d="M32 37c7.4 0 13.4 4.18 13.4 9.33V49H18.6v-2.67C18.6 41.18 24.6 37 32 37Zm-14.22 1.7c1.25 0 2.46.16 3.59.47a15.12 15.12 0 0 0-4.19 9.83H9v-1.72c0-4.74 3.93-8.58 8.78-8.58Zm28.44 0c4.85 0 8.78 3.84 8.78 8.58V49h-8.18a15.12 15.12 0 0 0-4.19-9.83c1.13-.31 2.34-.47 3.59-.47Z" />
    </svg>
  )
}

export default Mode
