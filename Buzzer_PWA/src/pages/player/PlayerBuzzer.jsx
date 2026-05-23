import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './PlayerBuzzer.css'
import AppLogo from '../../components/AppLogo.jsx'
import ConfirmationModal from '../../components/ConfirmationModal.jsx'
import { buildRoomData, demoRoom } from '../../lib/roomData.js'
import { emitWithAck } from '../../lib/socketRequest.js'
import {
  clearPlayerSession,
  readPlayerSession,
  writePlayerSession,
} from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function PlayerBuzzer() {
  const location = useLocation()
  const navigate = useNavigate()
  const savedPlayerSession = readPlayerSession()
  const resumeAttemptRef = useRef(false)
  const skipRouteLeaveDisconnectRef = useRef(false)
  const allowRouteLeaveDisconnectRef = useRef(false)
  const latestSessionRef = useRef({
    roomCode: null,
    playerId: null,
  })
  const room = useMemo(
    () => buildRoomData(location.state?.room || demoRoom),
    [location.state?.room],
  )
  const selectedTeamId =
    location.state?.selectedTeamId || savedPlayerSession?.selectedTeamId || room.teams[0]?.id || null
  const initialNickname = location.state?.nickname || savedPlayerSession?.nickname || 'Player'
  const [currentNickname, setCurrentNickname] = useState(initialNickname)
  const [playerState, setPlayerState] = useState(() => ({
    connectionStatus: savedPlayerSession?.playerId ? 'reconnecting' : 'connected',
    hasBuzzed: false,
    rank: null,
  }))
  const [liveRoom, setLiveRoom] = useState(room)
  const selectedTeam =
    liveRoom.teams.find((team) => team.id === selectedTeamId) || liveRoom.teams[0]
  const [error, setError] = useState('')
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draftNickname, setDraftNickname] = useState(initialNickname)
  const [playerNotice, setPlayerNotice] = useState({
    tone: savedPlayerSession?.playerId ? 'warning' : 'success',
    text: savedPlayerSession?.playerId ? 'Reconnexion en cours...' : 'Connecté à la partie.',
  })
  const roomCode = liveRoom.gameCode || savedPlayerSession?.roomCode
  const playerId = location.state?.playerId || savedPlayerSession?.playerId || null

  useEffect(() => {
    latestSessionRef.current = {
      roomCode,
      playerId,
    }
  }, [playerId, roomCode])

  useEffect(() => {
    const activationTimeout = window.setTimeout(() => {
      allowRouteLeaveDisconnectRef.current = true
    }, 0)

    return () => {
      window.clearTimeout(activationTimeout)
      const socket = getSocket()
      const { roomCode: activeRoomCode, playerId: activePlayerId } = latestSessionRef.current

      if (
        skipRouteLeaveDisconnectRef.current ||
        !allowRouteLeaveDisconnectRef.current ||
        !activeRoomCode ||
        !activePlayerId
      ) {
        return
      }

      socket.emit('player:disconnect-room', { roomCode: activeRoomCode })
      clearPlayerSession()
    }
  }, [])

  useEffect(() => {
    if (playerId && roomCode) {
      writePlayerSession({
        roomCode,
        playerId,
        selectedTeamId,
        nickname: currentNickname,
      })
    }
  }, [currentNickname, playerId, roomCode, selectedTeamId])

  useEffect(() => {
    setCurrentNickname(initialNickname)
    setDraftNickname(initialNickname)
  }, [initialNickname])

  useEffect(() => {
    const socket = getSocket()

    async function resumeSession() {
      if (!playerId || !roomCode || resumeAttemptRef.current) {
        return
      }

      resumeAttemptRef.current = true
      setPlayerState((currentState) => ({
        ...currentState,
        connectionStatus: 'reconnecting',
      }))

      try {
        const response = await emitWithAck(socket, 'player:resume-session', {
          roomCode,
          playerId,
        })

        setLiveRoom(buildRoomData(response.room))
        setCurrentNickname(response.player.nickname)
        setDraftNickname(response.player.nickname)
        setPlayerState({
          connectionStatus: response.playerStatus?.connected ? 'connected' : 'reconnecting',
          hasBuzzed: Boolean(response.playerStatus?.hasBuzzed),
          rank: response.playerStatus?.rank ?? null,
        })
        writePlayerSession({
          roomCode,
          playerId: response.player.id,
          selectedTeamId: response.player.teamId,
          nickname: response.player.nickname,
        })
        setError('')
        setPlayerNotice({ tone: 'success', text: 'Connecté à la partie.' })
      } catch (socketError) {
        skipRouteLeaveDisconnectRef.current = true
        clearPlayerSession()
        setError(socketError.message || 'Session introuvable.')
        setPlayerNotice({ tone: 'error', text: 'Session introuvable.' })
        navigate('/player/join')
      } finally {
        resumeAttemptRef.current = false
      }
    }

    function handleBuzzStatus(payload) {
      setPlayerState((currentState) => ({
        ...currentState,
        hasBuzzed: Boolean(payload.hasBuzzed),
        rank: payload.rank,
        connectionStatus: payload.connected ? 'connected' : currentState.connectionStatus,
      }))

      if (payload.connected) {
        setPlayerNotice((currentNotice) =>
          currentNotice.tone === 'warning'
            ? { tone: 'success', text: 'Connecté à la partie.' }
            : currentNotice,
        )
      }
    }

    function handleRoomState(payload) {
      const nextRoom = buildRoomData(payload.room)
      setLiveRoom(nextRoom)

      if (nextRoom.roundOpen && !payload.room?.buzzQueue?.length && !payload.room?.queue?.length) {
        setPlayerNotice({ tone: 'success', text: 'Connecté à la partie.' })
      }
    }

    function handleRoomClosed() {
      skipRouteLeaveDisconnectRef.current = true
      setError('La partie a ete fermee.')
      setPlayerNotice({ tone: 'error', text: 'La partie a été fermée.' })
      clearPlayerSession()
      navigate('/')
    }

    function handleConnect() {
      resumeSession()
    }

    function handleDisconnect() {
      setPlayerState((currentState) => ({
        ...currentState,
        connectionStatus: 'reconnecting',
      }))
      setPlayerNotice({ tone: 'warning', text: 'Reconnexion en cours...' })
    }

    socket.on('player:buzz-status', handleBuzzStatus)
    socket.on('room:state', handleRoomState)
    socket.on('room:closed', handleRoomClosed)
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    if (socket.connected) {
      resumeSession()
    }

    return () => {
      socket.off('player:buzz-status', handleBuzzStatus)
      socket.off('room:state', handleRoomState)
      socket.off('room:closed', handleRoomClosed)
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [navigate, playerId, roomCode, selectedTeamId])

  async function handleBuzz() {
    if (playerState.hasBuzzed || !roomCode || playerState.connectionStatus !== 'connected') {
      return
    }

    setError('')
    setPlayerNotice({ tone: 'info', text: 'Envoi du buzz...' })

    try {
      const socket = getSocket()
      await emitWithAck(socket, 'player:buzz', { roomCode })
      setPlayerNotice({ tone: 'success', text: 'Buzz envoyé.' })
    } catch (socketError) {
      const message = socketError.message || 'Impossible d envoyer le buzz.'
      setError(message)
      setPlayerNotice({ tone: 'error', text: `Buzz refusé : ${message}` })
    }
  }

  async function handleDisconnect() {
    skipRouteLeaveDisconnectRef.current = true

    try {
      const socket = getSocket()
      if (roomCode) {
        await emitWithAck(socket, 'player:disconnect-room', { roomCode })
      }
    } catch {
      // Ignore disconnect failures and leave locally.
    }

    clearPlayerSession()
    setPlayerNotice({ tone: 'warning', text: 'Déconnecté de la partie.' })
    setPlayerState((currentState) => ({
      ...currentState,
      connectionStatus: 'disconnected',
      hasBuzzed: false,
    }))
    navigate('/')
  }


  async function handleNicknameUpdate() {
    if (!roomCode || !draftNickname.trim()) {
      return
    }

    setError('')
    setPlayerNotice({ tone: 'info', text: 'Mise à jour du prénom...' })

    try {
      const trimmedNickname = draftNickname.trim()
      const socket = getSocket()
      const response = await emitWithAck(socket, 'player:update-nickname', {
        roomCode,
        nickname: trimmedNickname,
      })

      setLiveRoom(buildRoomData(response.room))
      writePlayerSession({
        roomCode,
        playerId: response.player.id,
        selectedTeamId: response.player.teamId,
        nickname: response.player.nickname,
      })
      setCurrentNickname(response.player.nickname)
      setEditingName(false)
      setDraftNickname(response.player.nickname)
      setPlayerNotice({ tone: 'success', text: 'Prénom mis à jour.' })
    } catch (socketError) {
      const message = socketError.message || 'Impossible de changer le prenom.'
      setError(message)
      setPlayerNotice({ tone: 'error', text: message })
    }
  }

  return (
    <main className="player-buzzer">
      <header className="player-buzzer__topbar">
        <div className="player-buzzer__brand" aria-label="Club Genie en Herbe">
          <AppLogo className="player-buzzer__brand-mark" />
        </div>

        <section className="player-buzzer__status-card" aria-label="Statut de connexion">
          <span className="player-buzzer__status-dot" />
          <div className="player-buzzer__status-copy">
            <span>STATUS:</span>
            <strong>{playerState.connectionStatus.toUpperCase()}</strong>
          </div>
        </section>
      </header>

      <section className="player-buzzer__scores" aria-label="Scores des équipes">
        {liveRoom.teams.slice(0, 2).map((team) => {
          const isSelected = team.id === selectedTeamId

          return (
            <article
              key={team.id}
              className={`player-buzzer__score-card ${isSelected ? 'player-buzzer__score-card--selected' : ''}`}
            >
              <span className="player-buzzer__score-team">{team.name}</span>
              <strong className="player-buzzer__score-value">{team.score}</strong>
            </article>
          )
        })}
      </section>

      <section className="player-buzzer__body" aria-labelledby="player-rank">
        <p id="player-rank" className="player-buzzer__rank">
          Vous êtes le <span>#{playerState.rank ?? '--'}</span>
        </p>

        <button
          type="button"
          className={`player-buzzer__button ${
            playerState.hasBuzzed ? 'player-buzzer__button--locked' : ''
          }`}
          onClick={handleBuzz}
          disabled={playerState.hasBuzzed || playerState.connectionStatus !== 'connected'}
          aria-label={`Buzz for ${selectedTeam?.name || 'your team'}`}
        >
          <span>BUZZ</span>
        </button>

        <p className="player-buzzer__team-name">
          {currentNickname} • {selectedTeam?.name || 'Équipe sélectionnée'}
        </p>

        <p className={`player-buzzer__notice player-buzzer__notice--${playerNotice.tone}`}>
          {playerNotice.text}
        </p>

        {editingName ? (
          <div className="player-buzzer__name-editor">
            <input
              type="text"
              value={draftNickname}
              onChange={(event) => setDraftNickname(event.target.value)}
              placeholder="Entrez votre prenom"
              className="player-buzzer__name-input"
            />
            <div className="player-buzzer__name-actions">
              <button
                type="button"
                className="player-buzzer__name-button player-buzzer__name-button--ghost"
                onClick={() => {
                  setDraftNickname(currentNickname)
                  setEditingName(false)
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="player-buzzer__name-button player-buzzer__name-button--primary"
                onClick={handleNicknameUpdate}
                disabled={draftNickname.trim().length === 0}
              >
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="player-buzzer__rename-trigger"
            onClick={() => setEditingName(true)}
          >
            Modifier le prenom
          </button>
        )}

        {error ? <p className="player-buzzer__error">{error}</p> : null}
      </section>

      <button
        type="button"
        className="player-buzzer__disconnect"
        onClick={() => setShowDisconnectConfirm(true)}
      >
        Se deconnecter
      </button>

      <ConfirmationModal
        open={showDisconnectConfirm}
        title="Se déconnecter ?"
        message="Voulez-vous vraiment quitter la partie ?"
        confirmLabel="Oui"
        onCancel={() => setShowDisconnectConfirm(false)}
        onConfirm={async () => {
          setShowDisconnectConfirm(false)
          await handleDisconnect()
        }}
        busy={false}
      />
    </main>
  )
}

export default PlayerBuzzer
