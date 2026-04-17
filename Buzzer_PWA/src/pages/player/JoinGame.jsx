import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './JoinGame.css'
import AppLogo from '../../components/AppLogo.jsx'
import { emitWithAck } from '../../lib/socketRequest.js'
import { writePlayerJoinInfo } from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function JoinGame() {
  const navigate = useNavigate()
  const [gameCode, setGameCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const normalizedCode = gameCode.trim().toUpperCase()
      const socket = getSocket()
      const response = await emitWithAck(socket, 'player:check-room', {
        roomCode: normalizedCode,
      })
      const room = response.room
      writePlayerJoinInfo({
        roomCode: room.code,
        room,
      })

      navigate('/player/team-selection', {
        state: { room },
      })
    } catch (socketError) {
      setError(socketError.message || 'Code de partie invalide.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCodeChange(event) {
    const nextValue = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    setGameCode(nextValue)
  }

  return (
    <main className="join-game">
      <header className="join-game__brand" aria-label="Club Genie en Herbe">
        <AppLogo className="join-game__brand-mark" />
      </header>

      <form className="join-game__form" onSubmit={handleSubmit}>
        <label className="join-game__field" htmlFor="game-code">
          <input
            id="game-code"
            name="gameCode"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            placeholder="GAME CODE"
            value={gameCode}
            onChange={handleCodeChange}
          />
        </label>

        <button
          type="submit"
          className="join-game__submit"
          disabled={submitting || gameCode.trim().length === 0}
        >
          {submitting ? 'VERIFICATION...' : 'ENTRER DANS LA PARTIE'}
        </button>
        {error ? <p className="join-game__error">{error}</p> : null}
      </form>
    </main>
  )
}

export default JoinGame
