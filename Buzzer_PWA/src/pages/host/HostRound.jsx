import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './HostRound.css'
import buzzSound from '../../assets/Ding.mp3'
import AppLogo from '../../components/AppLogo.jsx'
import ConfirmationModal from '../../components/ConfirmationModal.jsx'
import { buildRoomData, getPlayerBadge } from '../../lib/roomData.js'
import { emitWithAck } from '../../lib/socketRequest.js'
import { clearHostSession, readHostSession, writeHostSession } from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function HostRound() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialTimerState = getInitialTimerState()
  const [room, setRoom] = useState(() => buildRoomData(location.state?.room))
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [showPlayersStatus, setShowPlayersStatus] = useState(false)
  const [questionPointsInput, setQuestionPointsInput] = useState(String((room.currentQuestionPoints || 1)))
  const [editingScoreTeamId, setEditingScoreTeamId] = useState(null)
  const [scoreDraft, setScoreDraft] = useState('')
  const [selectedThemeSeriesIndex, setSelectedThemeSeriesIndex] = useState(0)
  const [timerMinuteDraft, setTimerMinuteDraft] = useState(initialTimerState.minuteDraft)
  const [timerSecondDraft, setTimerSecondDraft] = useState(initialTimerState.secondDraft)
  const [timerDurationSeconds, setTimerDurationSeconds] = useState(initialTimerState.durationSeconds)
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(initialTimerState.remainingSeconds)
  const [timerEndsAt, setTimerEndsAt] = useState(initialTimerState.endsAt)
  const [isTimerRunning, setIsTimerRunning] = useState(initialTimerState.isRunning)
  const openedRoundRef = useRef(false)
  const shouldAutoOpenRoundRef = useRef(Boolean(location.state?.room))
  const pointsSyncTimeoutRef = useRef(null)
  const pointsInputFocusedRef = useRef(false)
  const skipNextScoreCommitRef = useRef(false)

  const activeEntry =
    room.queue.find((entry) => entry.isActive || entry.status === 'pending') || null
  const themeSeries = Array.isArray(room.themeSeries) ? room.themeSeries : []
  const activeThemeSeries = themeSeries[selectedThemeSeriesIndex] || themeSeries[0] || null
  const timerDisplay = formatTimerLabel(timerRemainingSeconds)
  const hostSession = readHostSession()
  const roomCode =
    location.state?.room?.code || location.state?.room?.gameCode || hostSession?.roomCode || room.gameCode
  const canResetQueue = room.queue.length > 0 || !room.roundOpen

  useEffect(() => {
    const socket = getSocket()

    function handleRoomState(payload) {
      const nextRoom = buildRoomData(payload.room)
      setRoom(nextRoom)

      writeHostSession({
        ...(readHostSession() || {}),
        roomCode: payload.room.code || payload.room.gameCode,
        role: 'host',
      })

      if (!pointsInputFocusedRef.current) {
        setQuestionPointsInput(String(nextRoom.currentQuestionPoints || 1))
      }

      if (nextRoom.themeSeries.length > 0) {
        setSelectedThemeSeriesIndex((currentIndex) =>
          Math.min(currentIndex, nextRoom.themeSeries.length - 1),
        )
      }
    }

    async function resumeHostSession() {
      const hostSession = readHostSession()
      if (!hostSession?.roomCode || !hostSession?.hostSessionToken) {
        return
      }

      try {
        const response = await emitWithAck(socket, 'host:resume-session', {
          roomCode: hostSession.roomCode,
          hostSessionToken: hostSession.hostSessionToken,
        })
        const nextRoom = buildRoomData(response.room)
        setRoom(nextRoom)
        writeHostSession({
          ...hostSession,
          roomCode: response.room.code || response.room.gameCode,
          hostSessionToken: response.hostSessionToken || hostSession.hostSessionToken,
          role: 'host',
        })
        if (!pointsInputFocusedRef.current) {
          setQuestionPointsInput(String(nextRoom.currentQuestionPoints || 1))
        }
        setError('')
      } catch (socketError) {
        setError(socketError.message || 'Impossible de reprendre la partie.')
      }
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
    socket.on('connect', resumeHostSession)

    if (socket.connected) {
      resumeHostSession()
    }

    return () => {
      socket.off('room:state', handleRoomState)
      socket.off('host:buzz-sound', handleBuzzSound)
      socket.off('room:closed', handleRoomClosed)
      socket.off('connect', resumeHostSession)
    }
  }, [])

  useEffect(() => {
    if (!isTimerRunning || !timerEndsAt) {
      return undefined
    }

    const syncTimer = () => {
      const nextRemaining = computeTimerRemaining(timerEndsAt)
      if (nextRemaining <= 0) {
        setTimerRemainingSeconds(0)
        setIsTimerRunning(false)
        setTimerEndsAt(null)
        setTimerMinuteDraft('0')
        setTimerSecondDraft('00')
        return
      }

      setTimerRemainingSeconds(nextRemaining)
    }

    syncTimer()
    const intervalId = window.setInterval(syncTimer, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isTimerRunning, timerEndsAt])

  useEffect(() => {
    writeHostSession({
      ...(readHostSession() || {}),
      timerDurationSeconds,
      timerRemainingSeconds,
      timerEndsAt,
      isTimerRunning,
    })
  }, [timerDurationSeconds, timerRemainingSeconds, timerEndsAt, isTimerRunning])

  useEffect(() => () => {
    if (pointsSyncTimeoutRef.current) {
      window.clearTimeout(pointsSyncTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!roomCode || openedRoundRef.current || !shouldAutoOpenRoundRef.current) {
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

    setError('')

    try {
      const socket = getSocket()
      await emitWithAck(socket, 'host:set-question-points', {
        roomCode,
        points: nextPoints,
      })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de changer les points.')
    }
  }

  async function revealMysteryTheme() {
    if (!roomCode || selectedThemeSeriesIndex < 0) {
      return
    }

    const series = themeSeries[selectedThemeSeriesIndex]
    const mysteryTheme = series?.themes?.find((theme) => theme.isMystery)
    if (!series || !mysteryTheme) {
      return
    }

    setBusyAction(`reveal-theme-${selectedThemeSeriesIndex}`)
    setError('')

    try {
      const socket = getSocket()
      await emitWithAck(socket, 'host:reveal-theme-mystery', {
        roomCode,
        seriesIndex: selectedThemeSeriesIndex,
      })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de reveler le theme mystere.')
    } finally {
      setBusyAction('')
    }
  }

  function applyTimerDraft() {
    if (isTimerRunning) {
      return
    }

    const nextDurationSeconds = clampTimerDurationSeconds(
      buildTimerSeconds(timerMinuteDraft, timerSecondDraft),
    )
    const nextMinutes = Math.floor(nextDurationSeconds / 60)
    const nextSeconds = nextDurationSeconds % 60

    setTimerMinuteDraft(String(nextMinutes))
    setTimerSecondDraft(padTimerPart(nextSeconds))
    setTimerDurationSeconds(nextDurationSeconds)
    setTimerRemainingSeconds(nextDurationSeconds)
    setTimerEndsAt(null)
  }

  function toggleTimer() {
    if (isTimerRunning) {
      const nextRemaining = computeTimerRemaining(timerEndsAt)
      setTimerRemainingSeconds(nextRemaining)
      setTimerEndsAt(null)
      setIsTimerRunning(false)
      setTimerMinuteDraft(String(Math.floor(nextRemaining / 60)))
      setTimerSecondDraft(padTimerPart(nextRemaining % 60))
      return
    }

    const nextDurationSeconds = clampTimerDurationSeconds(
      buildTimerSeconds(timerMinuteDraft, timerSecondDraft),
    )

    if (nextDurationSeconds <= 0) {
      return
    }

    const nextMinutes = Math.floor(nextDurationSeconds / 60)
    const nextSeconds = nextDurationSeconds % 60

    setTimerMinuteDraft(String(nextMinutes))
    setTimerSecondDraft(padTimerPart(nextSeconds))
    setTimerDurationSeconds(nextDurationSeconds)
    setTimerRemainingSeconds(nextDurationSeconds)
    setTimerEndsAt(Date.now() + nextDurationSeconds * 1000)
    setIsTimerRunning(true)
  }

  function resetTimer() {
    setTimerMinuteDraft(String(Math.floor(timerDurationSeconds / 60)))
    setTimerSecondDraft(padTimerPart(timerDurationSeconds % 60))
    setTimerRemainingSeconds(timerDurationSeconds)
    setTimerEndsAt(null)
    setIsTimerRunning(false)
  }

  function scheduleQuestionPointsSync(nextPoints, delay = 250) {
    if (pointsSyncTimeoutRef.current) {
      window.clearTimeout(pointsSyncTimeoutRef.current)
    }

    pointsSyncTimeoutRef.current = window.setTimeout(() => {
      void updateQuestionPoints(nextPoints)
    }, delay)
  }

  function commitQuestionPoints(rawValue) {
    const nextPoints = normalizeQuestionPointsValue(rawValue, room.currentQuestionPoints || 1)
    setQuestionPointsInput(String(nextPoints))
    void updateQuestionPoints(nextPoints)
  }

  function handleQuestionPointsChange(event) {
    const nextValue = event.target.value.replace(/[^0-9]/g, '').slice(0, 2)
    setQuestionPointsInput(nextValue)

    if (!nextValue) {
      return
    }

    scheduleQuestionPointsSync(normalizeQuestionPointsValue(nextValue, room.currentQuestionPoints || 1))
  }

  function nudgeQuestionPoints(direction) {
    const currentPoints = normalizeQuestionPointsValue(questionPointsInput, room.currentQuestionPoints || 1)
    const nextPoints = normalizeQuestionPointsValue(currentPoints + direction, currentPoints)
    setQuestionPointsInput(String(nextPoints))
    scheduleQuestionPointsSync(nextPoints, 0)
  }

  function startScoreEdit(team) {
    setEditingScoreTeamId(team.id)
    setScoreDraft(String(team.score || 0))
  }

  async function commitScoreEdit(teamId, rawScore = scoreDraft) {
    if (!roomCode || !teamId) {
      return
    }

    const nextScore = normalizeTeamScoreValue(rawScore)
    setEditingScoreTeamId(null)
    setScoreDraft('')
    setError('')

    try {
      const socket = getSocket()
      await emitWithAck(socket, 'host:set-team-score', {
        roomCode,
        teamId,
        score: nextScore,
      })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de modifier les points de l équipe.')
    }
  }

  function cancelScoreEdit() {
    setEditingScoreTeamId(null)
    setScoreDraft('')
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

        <section className="host-round__timer" aria-label="Chrono de la question">
          <div className="host-round__timer-header">
            <div>
              <p>CHRONO</p>
              <strong>{timerDisplay}</strong>
            </div>
            <span>{isTimerRunning ? 'En cours' : 'En pause'}</span>
          </div>

          <div className="host-round__timer-edit">
            <label className="host-round__timer-field">
              <span>MIN</span>
              <input
                type="text"
                inputMode="numeric"
                value={timerMinuteDraft}
                disabled={isTimerRunning}
                onChange={(event) => setTimerMinuteDraft(sanitizeTimerInput(event.target.value))}
                onBlur={() => {
                  if (isTimerRunning) {
                    return
                  }
                  setTimerMinuteDraft(normalizeTimerDraftPart(timerMinuteDraft, 59))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
                aria-label="Minutes"
              />
            </label>
            <span className="host-round__timer-separator">:</span>
            <label className="host-round__timer-field">
              <span>SEC</span>
              <input
                type="text"
                inputMode="numeric"
                value={timerSecondDraft}
                disabled={isTimerRunning}
                onChange={(event) => setTimerSecondDraft(sanitizeTimerInput(event.target.value))}
                onBlur={() => {
                  if (isTimerRunning) {
                    return
                  }
                  setTimerSecondDraft(normalizeTimerDraftPart(timerSecondDraft, 59, true))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
                aria-label="Secondes"
              />
            </label>

            <button
              type="button"
              className="host-round__timer-apply"
              onClick={applyTimerDraft}
              disabled={isTimerRunning}
            >
              APPLIQUER
            </button>
          </div>

          <div className="host-round__timer-actions">
            <button
              type="button"
              className="host-round__timer-action host-round__timer-action--primary"
              onClick={toggleTimer}
            >
              {isTimerRunning ? 'PAUSE' : 'DÉMARRER'}
            </button>
            <button
              type="button"
              className="host-round__timer-action host-round__timer-action--ghost"
              onClick={resetTimer}
            >
              RÉINITIALISER
            </button>
          </div>
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

        <section className="host-round__themes" aria-label="Thèmes du jeu">
          <div className="host-round__themes-header">
            <h1>Thèmes</h1>
            <span>{themeSeries.length ? 'Séries configurées' : 'Aucune série'}</span>
          </div>

          <div className="host-round__themes-switcher" aria-label="Choisir une série">
            {themeSeries.map((series, index) => (
              <button
                key={series.id || `series-${index}`}
                type="button"
                className={`host-round__theme-tab ${
                  selectedThemeSeriesIndex === index ? 'host-round__theme-tab--active' : ''
                }`}
                onClick={() => setSelectedThemeSeriesIndex(index)}
                aria-pressed={selectedThemeSeriesIndex === index}
              >
                {series.label || `Série ${index + 1}`}
              </button>
            ))}
          </div>

          {activeThemeSeries ? (
            <article className="host-round__theme-panel">
              <div className="host-round__theme-panel-top">
                <div>
                  <p>{activeThemeSeries.label || `Série ${selectedThemeSeriesIndex + 1}`}</p>
                  <strong>3 thèmes</strong>
                </div>

                <button
                  type="button"
                  className="host-round__theme-reveal"
                  onClick={revealMysteryTheme}
                  disabled={busyAction === `reveal-theme-${selectedThemeSeriesIndex}`}
                >
                  {activeThemeSeries.themes?.find((theme) => theme.isMystery)?.revealed
                    ? 'CACHER LE THÈME MYSTÈRE'
                    : 'RÉVÉLER LE THÈME MYSTÈRE'}
                </button>
              </div>

              <div className="host-round__theme-list">
                {(activeThemeSeries.themes || []).map((theme, index) => {
                  const isMystery = Boolean(theme.isMystery)
                  const isRevealed = Boolean(theme.revealed)

                  return (
                    <article
                      key={theme.id || `${activeThemeSeries.id}-${index}`}
                      className={`host-round__theme-card ${
                        isMystery ? 'host-round__theme-card--mystery' : ''
                      } ${isRevealed ? 'host-round__theme-card--revealed' : ''}`}
                    >
                      <span className="host-round__theme-index">THÈME {index + 1}</span>
                      <strong>{isMystery && !isRevealed ? 'MYSTÈRE' : theme.title}</strong>
                      <p>{isMystery ? (isRevealed ? 'Mystère révélé' : 'Thème caché') : 'Dévoilé'}</p>
                    </article>
                  )
                })}
              </div>
            </article>
          ) : (
            <article className="host-round__theme-panel host-round__theme-panel--empty">
              <strong>Aucun thème configuré</strong>
              <p>Complétez l&apos;étape de configuration des thèmes avant de lancer la partie.</p>
            </article>
          )}
        </section>

        <section className="host-round__scoreboard" aria-label="Points des équipes">
          {room.teams.map((team) => {
            const isEditingScore = editingScoreTeamId === team.id

            return (
              <article
                key={team.id}
                className={`host-round__score-card host-round__score-card--${team.accent}`}
              >
                <div className="host-round__score-card-top">
                  <p className="host-round__team-label">{team.name}</p>
                  <button
                    type="button"
                    className="host-round__score-edit"
                    onClick={() => (isEditingScore ? cancelScoreEdit() : startScoreEdit(team))}
                    aria-label={`Modifier les points de ${team.name}`}
                    title={`Modifier les points de ${team.name}`}
                  >
                    ✎
                  </button>
                </div>

                <div className="host-round__score-value">
                  {isEditingScore ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      className="host-round__score-input"
                      value={scoreDraft}
                      onChange={(event) => {
                        setScoreDraft(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))
                      }}
                      onBlur={() => {
                        if (skipNextScoreCommitRef.current) {
                          skipNextScoreCommitRef.current = false
                          return
                        }
                        commitScoreEdit(team.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur()
                        }
                        if (event.key === 'Escape') {
                          skipNextScoreCommitRef.current = true
                          cancelScoreEdit()
                        }
                      }}
                      autoFocus
                      aria-label={`Nouveau score de ${team.name}`}
                    />
                  ) : (
                    <strong>{team.score}</strong>
                  )}
                  <span>PTS</span>
                </div>
              </article>
            )
          })}
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
              onClick={() => nudgeQuestionPoints(-1)}
              disabled={normalizeQuestionPointsValue(questionPointsInput, room.currentQuestionPoints || 1) <= 1}
              aria-label="Diminuer les points"
            >
              −
            </button>
            <div className="host-round__points-readout">
              <input
                type="text"
                inputMode="numeric"
                className="host-round__points-input"
                value={questionPointsInput}
                onChange={handleQuestionPointsChange}
                onFocus={() => {
                  pointsInputFocusedRef.current = true
                }}
                onBlur={() => {
                  pointsInputFocusedRef.current = false
                  commitQuestionPoints(questionPointsInput)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
                aria-label="Points de la question"
              />
              <span className="host-round__points-unit">PTS</span>
            </div>
            <button
              type="button"
              className="host-round__points-step"
              onClick={() => nudgeQuestionPoints(1)}
              disabled={normalizeQuestionPointsValue(questionPointsInput, room.currentQuestionPoints || 1) >= 10}
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

function getInitialTimerState() {
  const hostSession = readHostSession()
  const durationSeconds = clampTimerDurationSeconds(
    hostSession?.timerDurationSeconds ?? 60,
  )
  const storedRemaining = clampTimerDurationSeconds(
    hostSession?.timerRemainingSeconds ?? durationSeconds,
  )
  const storedEndsAt = Number(hostSession?.timerEndsAt)
  const isRunning = Boolean(hostSession?.isTimerRunning) && Number.isFinite(storedEndsAt)
  const remainingSeconds = isRunning
    ? computeTimerRemaining(storedEndsAt)
    : storedRemaining
  const normalizedRemaining = clampTimerDurationSeconds(
    Number.isFinite(remainingSeconds) ? remainingSeconds : durationSeconds,
  )
  const draftSeconds = Boolean(hostSession?.isTimerRunning)
    ? normalizedRemaining
    : durationSeconds

  return {
    minuteDraft: String(Math.floor(draftSeconds / 60)),
    secondDraft: padTimerPart(draftSeconds % 60),
    durationSeconds,
    remainingSeconds: normalizedRemaining,
    endsAt: isRunning && normalizedRemaining > 0 ? storedEndsAt : null,
    isRunning: isRunning && normalizedRemaining > 0,
  }
}

function sanitizeTimerInput(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 2)
}

function normalizeTimerDraftPart(value, max = 59, pad = false) {
  const numericValue = Number(String(value || '').trim())
  const normalizedValue = Number.isFinite(numericValue)
    ? Math.min(max, Math.max(0, Math.round(numericValue)))
    : 0

  return pad ? padTimerPart(normalizedValue) : String(normalizedValue)
}

function buildTimerSeconds(minutesValue, secondsValue) {
  const minutes = Math.min(59, Math.max(0, Number(normalizeTimerDraftPart(minutesValue))))
  const seconds = Math.min(59, Math.max(0, Number(normalizeTimerDraftPart(secondsValue))))
  return minutes * 60 + seconds
}

function clampTimerDurationSeconds(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return Math.min(3599, Math.max(0, Math.round(numericValue)))
}

function computeTimerRemaining(endsAt) {
  const numericEndsAt = Number(endsAt)
  if (!Number.isFinite(numericEndsAt)) {
    return 0
  }

  return clampTimerDurationSeconds(Math.ceil((numericEndsAt - Date.now()) / 1000))
}

function padTimerPart(value) {
  return String(Math.min(59, Math.max(0, Math.round(Number(value) || 0)))).padStart(2, '0')
}

function formatTimerLabel(secondsValue) {
  const totalSeconds = clampTimerDurationSeconds(secondsValue)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${padTimerPart(minutes)}:${padTimerPart(seconds)}`
}

function normalizeTeamScoreValue(value) {
  const numericValue = Number(String(value || '').trim())
  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return Math.max(0, Math.round(numericValue))
}

function normalizeQuestionPointsValue(value, fallback = 1) {
  const numericValue = Number(String(value || '').trim())
  if (!Number.isFinite(numericValue)) {
    return Math.min(10, Math.max(1, Math.round(fallback || 1)))
  }

  return Math.min(10, Math.max(1, Math.round(numericValue)))
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
