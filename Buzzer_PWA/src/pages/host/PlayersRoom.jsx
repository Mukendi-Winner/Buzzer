import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './PlayersRoom.css'
import AppLogo from '../../components/AppLogo.jsx'
import { buildRoomData, getPlayerBadge } from '../../lib/roomData.js'
import { readHostSession, writeHostSession } from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function PlayersRoom() {
  const navigate = useNavigate()
  const location = useLocation()
  const [room, setRoom] = useState(() => buildRoomData(location.state?.room))
  const [error, setError] = useState('')

  useEffect(() => {
    const socket = getSocket()

    function handleRoomState(payload) {
      setRoom(buildRoomData(payload.room))
      writeHostSession({
        ...(readHostSession() || {}),
        roomCode: payload.room.code || payload.room.gameCode,
        role: 'host',
      })
    }

    function handleRoomClosed(payload) {
      setError(
        payload?.reason === 'host_disconnected'
          ? 'La partie a ete fermee.'
          : 'Salle indisponible.',
      )
    }

    socket.on('room:state', handleRoomState)
    socket.on('room:closed', handleRoomClosed)

    return () => {
      socket.off('room:state', handleRoomState)
      socket.off('room:closed', handleRoomClosed)
    }
  }, [])

  return (
    <main className="players-room">
      <header className="players-room__brand" aria-label="Club Genie en Herbe">
        <AppLogo className="players-room__brand-mark" />
      </header>

      <div className="players-room__content">
        <section className="players-room__code-card" aria-label="Code du jeu">
          <p>CODE DU JEU</p>
          <strong>{room.gameCode}</strong>
        </section>

        <section className="players-room__teams">
          {room.teams.map((team) => (
            <section key={team.id} className="players-room__team">
              <h2>{team.name}</h2>
              <div className="players-room__player-list">
                {team.players.map((player, index) => (
                  <article
                    key={player.id || `${team.id}-${player.name || index}`}
                    className="players-room__player-card"
                  >
                    <span className="players-room__player-badge">
                      {getPlayerBadge(player.name)}
                    </span>
                    <span className="players-room__player-name">{player.name}</span>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>

        {error ? <p className="players-room__error">{error}</p> : null}

        <button
          type="button"
          className="players-room__start-button"
          onClick={() => navigate('/host-round', { state: { room } })}
        >
          LANCER LA PARTIE
        </button>
      </div>
    </main>
  )
}

export default PlayersRoom
