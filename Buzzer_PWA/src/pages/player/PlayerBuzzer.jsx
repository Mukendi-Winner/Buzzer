import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './PlayerBuzzer.css'
import AppLogo from '../../components/AppLogo.jsx'
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
  const room = useMemo(
    () => buildRoomData(location.state?.room || demoRoom),
    [location.state?.room],
  )
  const selectedTeamId =
    location.state?.selectedTeamId || savedPlayerSession?.selectedTeamId || room.teams[0]?.id || null
  const nickname = location.state?.nickname || savedPlayerSession?.nickname || 'Player'
  const [playerState, setPlayerState] = useState(() => ({
    connectionStatus: savedPlayerSession?.playerId ? 'reconnecting' : 'connected',
    hasBuzzed: false,
    rank: null,
  }))
  const [liveRoom, setLiveRoom] = useState(room)
  const selectedTeam =
    liveRoom.teams.find((team) => team.id === selectedTeamId) || liveRoom.teams[0]
  const [error, setError] = useState('')
  const roomCode = liveRoom.gameCode || savedPlayerSession?.roomCode
  const playerId = location.state?.playerId || savedPlayerSession?.playerId || null

  useEffect(() => {
    if (playerId && roomCode) {
      writePlayerSession({
        roomCode,
        playerId,
        selectedTeamId,
        nickname,
      })
    }
  }, [nickname, playerId, roomCode, selectedTeamId])

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
      } catch (socketError) {
        clearPlayerSession()
        setError(socketError.message || 'Session introuvable.')
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
    }

    function handleRoomState(payload) {
      setLiveRoom(buildRoomData(payload.room))
    }

    function handleRoomClosed() {
      setError('La partie a ete fermee.')
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
  }, [navigate, playerId, roomCode, selectedTeamId, nickname])

  async function handleBuzz() {
    if (playerState.hasBuzzed || !roomCode || playerState.connectionStatus !== 'connected') {
      return
    }

    setError('')

    try {
      const socket = getSocket()
      await emitWithAck(socket, 'player:buzz', { roomCode })
    } catch (socketError) {
      setError(socketError.message || 'Impossible d envoyer le buzz.')
    }
  }

  async function handleDisconnect() {
    try {
      const socket = getSocket()
      if (roomCode) {
        await emitWithAck(socket, 'player:disconnect-room', { roomCode })
      }
    } catch {
      // Ignore disconnect failures and leave locally.
    }

    clearPlayerSession()
    setPlayerState((currentState) => ({
      ...currentState,
      connectionStatus: 'disconnected',
      hasBuzzed: false,
    }))
    navigate('/')
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
          {nickname} • {selectedTeam?.name || 'Équipe sélectionnée'}
        </p>
        {error ? <p className="player-buzzer__error">{error}</p> : null}
      </section>

      <button
        type="button"
        className="player-buzzer__disconnect"
        onClick={handleDisconnect}
      >
        Se deconnecter
      </button>
    </main>
  )
}

export default PlayerBuzzer
