import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './HostRound.css'
import buzzSound from '../../assets/Ding.mp3'
import AppLogo from '../../components/AppLogo.jsx'
import ConfirmationModal from '../../components/ConfirmationModal.jsx'
import { buildRoomData, getPlayerBadge } from '../../lib/roomData.js'
import { emitWithAck } from '../../lib/socketRequest.js'
import { clearHostSession, readHostSession } from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function HostRound() {
  const navigate = useNavigate()
  const location = useLocation()
  const [room, setRoom] = useState(() => buildRoomData(location.state?.room))
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [showPlayersStatus, setShowPlayersStatus] = useState(false)
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

  async function updateQuestionPoints(nextPoints) {
    if (!roomCode) {
      return
    }

    setBusyAction('question-points')
    setError('')

    try {
      const socket = getSocket()
      await emitWithAck(socket, 'host:set-question-points', {
        roomCode,
        points: nextPoints,
      })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de changer les points.')
    } finally {
      setBusyAction('')
    }
  }

  async function leaveHostRoom(nextPath) {
    setBusyAction('leave-room')
    setError('')

    try {
      const socket = getSocket()
      if (roomCode) {
        await emitWithAck(socket, 'host:disconnect-room', { roomCode })
      }
    } catch (socketError) {
      setError(socketError.message || 'Impossible de fermer la partie.')
      setBusyAction('')
      return
    }

    clearHostSession()
    navigate(nextPath)
  }

  function requestHostAction(type) {
    if (type === 'new-game') {
      setConfirmAction({
        type,
        title: 'Créer une nouvelle partie ?',
        message: 'Voulez-vous vraiment fermer cette partie et revenir à la configuration pour en créer une nouvelle ?',
        confirmLabel: 'Oui',
      })
      return
    }

    setConfirmAction({
      type,
      title: 'Se déconnecter ?',
      message: 'Voulez-vous vraiment fermer cette partie et vous déconnecter ?',
      confirmLabel: 'Oui',
    })
  }

  async function confirmHostAction() {
    if (!confirmAction) {
      return
    }

    const nextPath = confirmAction.type === 'new-game' ? '/configuration' : '/'
    setConfirmAction(null)
    await leaveHostRoom(nextPath)
  }

  return (
    <main className="host-round">
      <header className="host-round__brand" aria-label="Club Genie en Herbe">
        <AppLogo className="host-round__brand-mark" />
      </header>

      <div className="host-round__content">
        <section className="host-round__code-card" aria-label="Code du jeu">
          <p>CODE DU JEU</p>
          <strong>{room.gameCode}</strong>
        </section>

        <div className="host-round__top-actions">
          <button
            type="button"
            className="host-round__players-status-trigger"
            onClick={() => setShowPlayersStatus(true)}
          >
            ÉTAT DES JOUEURS
          </button>
        </div>

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

        <section className="host-round__points-control" aria-label="Points de la question">
          <span className="host-round__points-label">POINTS DE LA QUESTION</span>
          <div className="host-round__points-box">
            <button
              type="button"
              className="host-round__points-step"
              onClick={() => updateQuestionPoints(Math.max(1, (room.currentQuestionPoints || 1) - 1))}
              disabled={busyAction === 'question-points' || (room.currentQuestionPoints || 1) <= 1}
              aria-label="Diminuer les points"
            >
              −
            </button>
            <div className="host-round__points-readout">
              <strong className="host-round__points-value">{room.currentQuestionPoints || 1}</strong>
              <span className="host-round__points-unit">PTS</span>
            </div>
            <button
              type="button"
              className="host-round__points-step"
              onClick={() => updateQuestionPoints(Math.min(10, (room.currentQuestionPoints || 1) + 1))}
              disabled={busyAction === 'question-points' || (room.currentQuestionPoints || 1) >= 10}
              aria-label="Augmenter les points"
            >
              +
            </button>
          </div>
        </section>

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

        <div className="host-round__secondary-actions">
          <button
            type="button"
            className="host-round__secondary-button host-round__secondary-button--primary"
            onClick={() => requestHostAction('new-game')}
            disabled={Boolean(busyAction)}
          >
            CRÉER UNE NOUVELLE PARTIE
          </button>
          <button
            type="button"
            className="host-round__secondary-button host-round__secondary-button--ghost"
            onClick={() => requestHostAction('disconnect')}
            disabled={Boolean(busyAction)}
          >
            SE DÉCONNECTER
          </button>
        </div>
      </div>

      {showPlayersStatus ? (
        <div className="host-round__players-modal" role="dialog" aria-modal="true" aria-labelledby="players-status-title">
          <button
            type="button"
            className="host-round__players-modal-backdrop"
            aria-label="Fermer l'état des joueurs"
            onClick={() => setShowPlayersStatus(false)}
          />

          <section className="host-round__players-modal-card">
            <div className="host-round__players-modal-header">
              <div>
                <h2 id="players-status-title">État des joueurs</h2>
                <p>Connexion des joueurs par équipe</p>
              </div>
              <button
                type="button"
                className="host-round__players-modal-close"
                onClick={() => setShowPlayersStatus(false)}
              >
                Fermer
              </button>
            </div>

            <div className="host-round__players-groups">
              {room.teams.map((team) => (
                <section key={team.id} className="host-round__players-group">
                  <div className="host-round__players-group-header">
                    <h3>{team.name}</h3>
                    <span>{team.players.length} joueur{team.players.length > 1 ? 's' : ''}</span>
                  </div>

                  <div className="host-round__players-list">
                    {team.players.length > 0 ? (
                      team.players.map((player) => (
                        <article key={player.id} className="host-round__player-status-item">
                          <span className="host-round__player-status-badge">
                            {getPlayerBadge(player.name)}
                          </span>
                          <div className="host-round__player-status-main">
                            <strong>{player.name}</strong>
                            <span
                              className={`host-round__player-status-pill ${
                                player.connected
                                  ? 'host-round__player-status-pill--connected'
                                  : 'host-round__player-status-pill--disconnected'
                              }`}
                            >
                              {player.connected ? 'Connecté' : 'Déconnecté'}
                            </span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="host-round__players-empty">Aucun joueur dans cette équipe.</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmationModal
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmHostAction}
        busy={busyAction === 'leave-room'}
      />
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
