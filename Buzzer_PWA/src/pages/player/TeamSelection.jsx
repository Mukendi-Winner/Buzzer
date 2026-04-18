import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './TeamSelection.css'
import AppLogo from '../../components/AppLogo.jsx'
import { buildRoomData, demoRoom } from '../../lib/roomData.js'
import {
  clearPlayerJoinInfo,
  clearPlayerSession,
  writePlayerSession,
  readPlayerJoinInfo,
} from '../../lib/session.js'
import { emitWithAck } from '../../lib/socketRequest.js'
import { getSocket } from '../../lib/socket.js'

function TeamSelection() {
  const location = useLocation()
  const navigate = useNavigate()
  const joinInfo = readPlayerJoinInfo()
  const room = useMemo(
    () => buildRoomData(location.state?.room || joinInfo?.room || demoRoom),
    [joinInfo?.room, location.state?.room],
  )
  const [selectedTeamId, setSelectedTeamId] = useState(
    room.teams.find((team) => !team.isFull)?.id ?? room.teams[0]?.id ?? null,
  )
  const [nickname, setNickname] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const selectedTeam = room.teams.find((team) => team.id === selectedTeamId) || null

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const socket = getSocket()
      clearPlayerSession()
      const response = await emitWithAck(socket, 'player:join-room', {
        roomCode: room.gameCode,
        nickname: nickname.trim(),
        teamId: selectedTeamId,
      })

      writePlayerSession({
        roomCode: room.gameCode,
        playerId: response.player.id,
        selectedTeamId,
        nickname: response.player.nickname,
      })
      clearPlayerJoinInfo()

      navigate('/player/buzzer', {
        state: {
          room: response.room,
          selectedTeamId,
          nickname: response.player.nickname,
          playerId: response.player.id,
        },
      })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de rejoindre la partie.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="team-selection">
      <header className="team-selection__brand" aria-label="Club Genie en Herbe">
        <AppLogo className="team-selection__brand-mark" />
      </header>

      <section className="team-selection__hero" aria-labelledby="team-selection-title">
        <h1 id="team-selection-title">Choisissez votre équipe</h1>
      </section>

      <form className="team-selection__form" onSubmit={handleSubmit}>
        <div className="team-selection__choices" role="radiogroup" aria-label="Équipes">
          {room.teams.slice(0, 2).map((team, index) => {
            const isSelected = selectedTeamId === team.id
            const isFull = Boolean(team.isFull)

            return (
              <button
                key={team.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`team-selection__card team-selection__card--${
                  index === 0 ? 'primary' : 'secondary'
                } ${isSelected ? 'team-selection__card--selected' : ''}`}
                onClick={() => setSelectedTeamId(team.id)}
                disabled={isFull}
              >
                {isSelected ? (
                  <span className="team-selection__selected-badge" aria-hidden="true">
                    CHOISIE
                  </span>
                ) : null}
                <span className="team-selection__label">{team.name}</span>
                <span className="team-selection__number">{index + 1}</span>
                {isFull ? (
                  <span className="team-selection__full-badge">COMPLET</span>
                ) : null}
              </button>
            )
          })}
        </div>

        <label className="team-selection__nickname-field" htmlFor="player-nickname">
          <span>Pseudo</span>
          <input
            id="player-nickname"
            name="nickname"
            type="text"
            placeholder="Entrez votre pseudo"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>

        <button
          type="submit"
          className="team-selection__submit"
          disabled={
            !selectedTeamId ||
            nickname.trim().length === 0 ||
            submitting ||
            Boolean(selectedTeam?.isFull)
          }
        >
          {submitting ? 'CONNEXION...' : 'LANCER LA PARTIE'}
        </button>
        {error ? <p className="team-selection__error">{error}</p> : null}
      </form>
    </main>
  )
}

export default TeamSelection
