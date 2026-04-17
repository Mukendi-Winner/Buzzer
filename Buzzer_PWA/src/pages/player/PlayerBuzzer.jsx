import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './PlayerBuzzer.css'
import AppLogo from '../../components/AppLogo.jsx'
import { buildRoomData, demoRoom } from '../../lib/roomData.js'
import { emitWithAck } from '../../lib/socketRequest.js'
import { clearPlayerSession, readPlayerSession } from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function PlayerBuzzer() {
  const location = useLocation()
  const navigate = useNavigate()
  const savedPlayerSession = readPlayerSession()
  const room = useMemo(
    () => buildRoomData(location.state?.room || demoRoom),
    [location.state?.room],
  )
  const selectedTeamId =
    location.state?.selectedTeamId || savedPlayerSession?.selectedTeamId || room.teams[0]?.id || null
  const nickname = location.state?.nickname || savedPlayerSession?.nickname || 'Player'
  const [playerState, setPlayerState] = useState(() => ({
    connectionStatus: 'connected',
    hasBuzzed: false,
    rank: null,
  }))
  const [liveRoom, setLiveRoom] = useState(room)
  const selectedTeam =
    liveRoom.teams.find((team) => team.id === selectedTeamId) || liveRoom.teams[0]
  const [error, setError] = useState('')
  const roomCode = liveRoom.gameCode || savedPlayerSession?.roomCode

  useEffect(() => {
    const socket = getSocket()

    function handleBuzzStatus(payload) {
      setPlayerState((currentState) => ({
        ...currentState,
        hasBuzzed: Boolean(payload.hasBuzzed),
        rank: payload.rank,
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
      setPlayerState((currentState) => ({
        ...currentState,
        connectionStatus: 'connected',
      }))
    }

    function handleDisconnect() {
      setPlayerState((currentState) => ({
        ...currentState,
        connectionStatus: 'disconnected',
      }))
    }

    socket.on('player:buzz-status', handleBuzzStatus)
    socket.on('room:state', handleRoomState)
    socket.on('room:closed', handleRoomClosed)
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    return () => {
      socket.off('player:buzz-status', handleBuzzStatus)
      socket.off('room:state', handleRoomState)
      socket.off('room:closed', handleRoomClosed)
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [navigate])

  async function handleBuzz() {
    if (playerState.hasBuzzed || !roomCode) {
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
          YOU ARE <span>#{playerState.rank ?? '--'}</span>
        </p>

        <button
          type="button"
          className={`player-buzzer__button ${
            playerState.hasBuzzed ? 'player-buzzer__button--locked' : ''
          }`}
          onClick={handleBuzz}
          disabled={playerState.hasBuzzed}
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
