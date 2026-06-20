import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './ThemesSetup.css'
import AppLogo from '../../components/AppLogo.jsx'
import { buildRoomData } from '../../lib/roomData.js'
import { emitWithAck } from '../../lib/socketRequest.js'
import { readHostSession, writeHostSession } from '../../lib/session.js'
import { getSocket } from '../../lib/socket.js'

function ThemesSetup() {
  const navigate = useNavigate()
  const location = useLocation()
  const [room, setRoom] = useState(() => buildRoomData(location.state?.room))
  const [seriesDrafts, setSeriesDrafts] = useState(() =>
    createSeriesDrafts(location.state?.room?.themeSeries),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const socket = getSocket()

    function handleRoomState(payload) {
      setRoom(buildRoomData(payload.room))
      setSeriesDrafts(createSeriesDrafts(payload.room?.themeSeries))
      writeHostSession({
        ...(readHostSession() || {}),
        roomCode: payload.room.code || payload.room.gameCode,
        role: 'host',
      })
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
        setRoom(buildRoomData(response.room))
        setSeriesDrafts(createSeriesDrafts(response.room?.themeSeries))
        writeHostSession({
          ...hostSession,
          roomCode: response.room.code || response.room.gameCode,
          hostSessionToken: response.hostSessionToken || hostSession.hostSessionToken,
          role: 'host',
        })
        setError('')
      } catch (socketError) {
        setError(socketError.message || 'Impossible de reprendre la partie.')
      }
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
    socket.on('connect', resumeHostSession)

    if (socket.connected) {
      resumeHostSession()
    }

    return () => {
      socket.off('room:state', handleRoomState)
      socket.off('room:closed', handleRoomClosed)
      socket.off('connect', resumeHostSession)
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const themeSeries = seriesDrafts.map((series, seriesIndex) => {
        const themes = series.themes.map((title, themeIndex) => ({
          title: title.trim(),
          id: `series-${seriesIndex + 1}-theme-${themeIndex + 1}`,
        }))

        if (themes.some((theme) => !theme.title)) {
          throw new Error(`Veuillez renseigner les 3 thèmes de la série ${seriesIndex + 1}.`)
        }

        return {
          id: series.id,
          label: series.label,
          mysteryIndex: series.mysteryIndex,
          themes,
        }
      })

      const socket = getSocket()
      const response = await emitWithAck(socket, 'host:set-theme-series', {
        roomCode: room.gameCode,
        themeSeries,
      })

      const nextRoom = response.room
      writeHostSession({
        ...(readHostSession() || {}),
        roomCode: nextRoom.code || nextRoom.gameCode,
        role: 'host',
        timerDurationSeconds: 60,
        timerRemainingSeconds: 60,
        timerEndsAt: null,
        isTimerRunning: false,
      })

      navigate('/players-room', {
        state: { room: nextRoom },
      })
    } catch (socketError) {
      setError(socketError.message || 'Impossible de sauvegarder les thèmes.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="themes-setup-page">
      <header className="themes-setup-brand" aria-label="Club Genie en Herbe">
        <AppLogo className="themes-setup-brand__mark" />
      </header>

      <div className="themes-setup-content">
        <section className="themes-setup-hero" aria-labelledby="themes-setup-title">
          <p className="themes-setup-kicker">ETAPE 2</p>
          <h1 id="themes-setup-title">Configuration des thèmes</h1>
          <p>
            Saisissez deux séries de trois thèmes et choisissez, pour chaque série, le thème
            mystère.
          </p>
        </section>

        <form className="themes-setup-form" onSubmit={handleSubmit}>
          <div className="themes-setup-grid">
            {seriesDrafts.map((series, seriesIndex) => (
              <section key={series.id} className="themes-setup-card">
                <div className="themes-setup-card__header">
                  <p>{series.label}</p>
                  <span>3 thèmes</span>
                </div>

                <div className="themes-setup-fields">
                  {series.themes.map((themeTitle, themeIndex) => (
                    <label key={`${series.id}-${themeIndex}`} className="themes-setup-field">
                      <span>THÈME {themeIndex + 1}</span>
                      <input
                        type="text"
                        value={themeTitle}
                        placeholder={`Thème ${themeIndex + 1}`}
                        onChange={(event) => {
                          const nextValue = event.target.value
                          setSeriesDrafts((current) =>
                            current.map((item, currentIndex) => {
                              if (currentIndex !== seriesIndex) {
                                return item
                              }

                              const nextThemes = [...item.themes]
                              nextThemes[themeIndex] = nextValue
                              return {
                                ...item,
                                themes: nextThemes,
                              }
                            }),
                          )
                        }}
                      />
                    </label>
                  ))}
                </div>

                <label className="themes-setup-mystery">
                  <span>THÈME MYSTÈRE</span>
                  <select
                    value={series.mysteryIndex}
                    onChange={(event) => {
                      const nextMysteryIndex = Number(event.target.value)
                      setSeriesDrafts((current) =>
                        current.map((item, currentIndex) =>
                          currentIndex === seriesIndex
                            ? { ...item, mysteryIndex: nextMysteryIndex }
                            : item,
                        ),
                      )
                    }}
                  >
                    <option value={0}>Thème 1</option>
                    <option value={1}>Thème 2</option>
                    <option value={2}>Thème 3</option>
                  </select>
                </label>
              </section>
            ))}
          </div>

          {error ? <p className="themes-setup-error">{error}</p> : null}

          <button type="submit" className="themes-setup-submit" disabled={submitting}>
            {submitting ? 'ENREGISTREMENT...' : 'ENREGISTRER LES THÈMES'}
          </button>
        </form>
      </div>
    </main>
  )
}

function createSeriesDrafts(sourceThemeSeries) {
  if (!Array.isArray(sourceThemeSeries) || sourceThemeSeries.length !== 2) {
    return [
      {
        id: 'series-1',
        label: 'Série 1',
        mysteryIndex: 2,
        themes: ['', '', ''],
      },
      {
        id: 'series-2',
        label: 'Série 2',
        mysteryIndex: 2,
        themes: ['', '', ''],
      },
    ]
  }

  return sourceThemeSeries.map((series, seriesIndex) => {
    const themes = Array.isArray(series?.themes) ? series.themes : []
    const mysteryIndex = Math.max(
      0,
      Math.min(
        2,
        themes.findIndex((theme) => Boolean(theme?.isMystery)) >= 0
          ? themes.findIndex((theme) => Boolean(theme?.isMystery))
          : 2,
      ),
    )

    return {
      id: series?.id || `series-${seriesIndex + 1}`,
      label: series?.label || `Série ${seriesIndex + 1}`,
      mysteryIndex,
      themes: [
        themes[0]?.title || '',
        themes[1]?.title || '',
        themes[2]?.title || '',
      ],
    }
  })
}

export default ThemesSetup
