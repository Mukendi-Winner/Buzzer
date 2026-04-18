import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './HostRound.css'
import buzzSound from '../../assets/Ding.mp3'
import AppLogo from '../../components/AppLogo.jsx'
import { buildRoomData } from '../../lib/roomData.js'
import { emitWithAck } from '../../lib/socketRequest.js'
import { readHostSession } from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function HostRound() {
  const location = useLocation()
  const [room, setRoom] = useState(() => buildRoomData(location.state?.room))
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const openedRoundRef = useRef(false)

  const activeEntry =
    room.queue.find((entry) => entry.isActive || entry.status === 'pending') || null
  const roomCode = room.gameCode || readHostSession()?.roomCode
  const canResetQueue = room.queue.length > 0 || !room.roundOpen

  useEffect(() => {
    const socket = getSocket()

    function handleRoomState(payload) {
      setRoom(buildRoomData(payload.room))
    }

    function handleBuzzSound() {
      playBuzzSound()
    }

    function handleRoomClosed() {
      setError('La salle a ete fermee.')
    }

    socket.on('room:state', handleRoomState)
    socket.on('host:buzz-sound', handleBuzzSound)
    socket.on('room:closed', handleRoomClosed)

    return () => {
      socket.off('room:state', handleRoomState)
      socket.off('host:buzz-sound', handleBuzzSound)
      socket.off('room:closed', handleRoomClosed)
    }
  }, [])

  useEffect(() => {
    if (!roomCode || openedRoundRef.current) {
      return
    }

    openedRoundRef.current = true
    void (async () => {
      setBusyAction('open-round')
      setError('')

      try {
        const socket = getSocket()
        await emitWithAck(socket, 'host:open-round', { roomCode })
      } catch (socketError) {
        setError(socketError.message || 'Impossible de lancer le round.')
      } finally {
        setBusyAction('')
      }
    })()
  }, [roomCode])

  async function openRound() {
    if (!roomCode) {
      return
    }

    setBusyAction('open-round')
    setError('')

    try {
      const socket = getSocket()
      await emitWithAck(socket, 'host:open-round', { roomCode })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de lancer le round.')
    } finally {
      setBusyAction('')
    }
  }

  async function scoreEntry(outcome) {
    if (!roomCode) {
      return
    }

    setBusyAction(outcome)
    setError('')

    try {
      const socket = getSocket()
      await emitWithAck(socket, 'host:mark-answer', {
        roomCode,
        result: outcome === 'failed' ? 'wrong' : 'correct',
      })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de noter la reponse.')
    } finally {
      setBusyAction('')
    }
  }

  return (
    <main className="host-round">
      <header className="host-round__brand" aria-label="Club Genie en Herbe">
        <AppLogo className="host-round__brand-mark" />
      </header>

      <section className="host-round__code-card" aria-label="Code du jeu">
        <p>CODE DU JEU</p>
        <strong>{room.gameCode}</strong>
      </section>

      <section className="host-round__scoreboard" aria-label="Points des équipes">
        {room.teams.map((team) => (
          <article
            key={team.id}
            className={`host-round__score-card host-round__score-card--${team.accent}`}
          >
            <p className="host-round__team-label">{team.name}</p>
            <div className="host-round__score-value">
              <strong>{team.score}</strong>
              <span>PTS</span>
            </div>
          </article>
        ))}
      </section>

      <section className="host-round__queue" aria-labelledby="queue-title">
        <div className="host-round__queue-header">
          <h1 id="queue-title">File d&apos;attente</h1>
          <span>({room.queue.length})</span>
        </div>

        <div className="host-round__queue-list">
          {room.queue.map((entry, index) => {
            const team = room.teams.find((item) => item.id === entry.teamId)
            const isActive = activeEntry?.id === entry.id

            return (
              <article
                key={entry.id}
                className={`host-round__queue-item ${
                  isActive ? 'host-round__queue-item--active' : ''
                }`}
              >
                <span className="host-round__queue-rank">{index + 1}</span>

                <div className="host-round__queue-main">
                  <strong>{entry.playerName}</strong>
                  <p>
                    {(team?.name || 'Équipe').toUpperCase()} •{' '}
                    {entry.responseTimeLabel}
                  </p>
                </div>

                {isActive ? (
                  <div className="host-round__actions">
                    <button
                      type="button"
                      className="host-round__action host-round__action--fail"
                      onClick={() => scoreEntry('failed')}
                      disabled={Boolean(busyAction)}
                      aria-label={`Marquer ${entry.playerName} comme incorrect`}
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      className="host-round__action host-round__action--success"
                      onClick={() => scoreEntry('success')}
                      disabled={Boolean(busyAction)}
                    >
                      VALIDER
                    </button>
                  </div>
                ) : (
                  <span
                    className={`host-round__status host-round__status--${entry.status}`}
                  >
                    {getStatusLabel(entry.status)}
                  </span>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {error ? <p className="host-round__error">{error}</p> : null}

      <div className="host-round__footer">
        <button
          type="button"
          className={`host-round__footer-button ${
            canResetQueue ? 'host-round__footer-button--active' : ''
          }`}
          onClick={openRound}
          disabled={busyAction === 'open-round' || !canResetQueue}
        >
          RÉINITIALISER • SUIVANT
        </button>
      </div>
    </main>
  )
}

function getStatusLabel(status) {
  if (status === 'success') {
    return 'Validé'
  }

  if (status === 'failed') {
    return 'Échoué'
  }

  return ''
}

function playBuzzSound() {
  try {
    const audio = new Audio(buzzSound)
    audio.play()
  } catch {
    // Ignore audio issues.
  }
}

export default HostRound
