import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Configuration.css'
import AppLogo from '../../components/AppLogo.jsx'
import { emitWithAck } from '../../lib/socketRequest.js'
import { readHostSession, writeHostSession } from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function Configuration() {
  const navigate = useNavigate()
  const [teamAName, setTeamAName] = useState('')
  const [teamBName, setTeamBName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const socket = getSocket()
      const response = await emitWithAck(socket, 'host:create-room', {
        teams: [
          { name: teamAName.trim() || 'Équipe A' },
          { name: teamBName.trim() || 'Équipe B' },
        ],
      })

      const room = response.room
      writeHostSession({
        ...(readHostSession() || {}),
        roomCode: room.code,
        role: 'host',
      })

      navigate('/players-room', {
        state: { room },
      })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de créer la partie.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="configuration-page">
      <header className="configuration-brand" aria-label="Club Genie en Herbe">
        <AppLogo className="configuration-brand__mark" />
      </header>

      <div className="configuration-content">
        <section className="configuration-hero" aria-labelledby="configuration-title">
          <h1 id="configuration-title">Configuration</h1>
          <p>Nommez vos deux équipes pour commencer.</p>
        </section>

        <form className="configuration-form" onSubmit={handleSubmit}>
          <label className="configuration-field">
            <span>ÉQUIPE A</span>
            <input
              type="text"
              name="teamA"
              placeholder="Nom de la faction"
              value={teamAName}
              onChange={(event) => setTeamAName(event.target.value)}
            />
          </label>

          <label className="configuration-field">
            <span>ÉQUIPE B</span>
            <input
              type="text"
              name="teamB"
              placeholder="Nom de la faction"
              value={teamBName}
              onChange={(event) => setTeamBName(event.target.value)}
            />
          </label>

          <button type="submit" className="configuration-submit" disabled={submitting}>
            {submitting ? 'CREATION...' : 'LANCER LA PARTIE'}
          </button>
          {error ? <p className="configuration-error">{error}</p> : null}
        </form>
      </div>
    </main>
  )
}

export default Configuration
