const defaultTeams = [
  {
    id: 'team-a',
    name: 'Équipe A',
    shortName: 'ALPHA',
    score: 20,
    accent: 'purple',
    players: [
      { id: 'js', name: 'Jean-Sébastien', connected: true },
      { id: 'ml', name: 'Marie-Louise', connected: true },
      { id: 'ad', name: 'Arthur D.', connected: true },
    ],
  },
  {
    id: 'team-b',
    name: 'Équipe B',
    shortName: 'OMEGA',
    score: 30,
    accent: 'gold',
    players: [
      { id: 'cl', name: 'Claire L.', connected: true },
      { id: 'ph', name: 'Pierre-Henri', connected: true },
    ],
  },
]

const defaultQueue = [
  {
    id: 'buzz-1',
    playerName: 'Alexandre Dupont',
    teamId: 'team-a',
    responseTimeLabel: '0.42s',
    status: 'pending',
  },
  {
    id: 'buzz-2',
    playerName: 'Sarah Bernhardt',
    teamId: 'team-b',
    responseTimeLabel: '0.68s',
    status: 'pending',
  },
  {
    id: 'buzz-3',
    playerName: 'Jean Gabin',
    teamId: 'team-a',
    responseTimeLabel: '1.12s',
    status: 'pending',
  },
  {
    id: 'buzz-4',
    playerName: 'Simone Veil',
    teamId: 'team-b',
    responseTimeLabel: '1.45s',
    status: 'pending',
  },
]

const defaultThemeSeries = [
  {
    id: 'series-1',
    label: 'Série 1',
    themes: [
      { id: 'series-1-theme-1', title: 'Culture générale', isMystery: false, revealed: true },
      { id: 'series-1-theme-2', title: 'Histoire', isMystery: false, revealed: true },
      { id: 'series-1-theme-3', title: 'Sport', isMystery: true, revealed: false },
    ],
  },
  {
    id: 'series-2',
    label: 'Série 2',
    themes: [
      { id: 'series-2-theme-1', title: 'Cinéma', isMystery: false, revealed: true },
      { id: 'series-2-theme-2', title: 'Sciences', isMystery: true, revealed: false },
      { id: 'series-2-theme-3', title: 'Géographie', isMystery: false, revealed: true },
    ],
  },
]

export const demoRoom = {
  gameCode: 'XJ-992',
  teams: defaultTeams,
  queue: defaultQueue,
  themeSeries: defaultThemeSeries,
}

export function buildRoomData(room) {
  if (!room) {
    return demoRoom
  }

  const hasLivePlayers = Array.isArray(room.players)
  const hasLiveQueue = Array.isArray(room.queue) || Array.isArray(room.buzzQueue)
  const baseTeams =
    Array.isArray(room.teams) && room.teams.length > 0 ? room.teams : defaultTeams
  const themeSeries =
    Array.isArray(room.themeSeries) && room.themeSeries.length > 0
      ? room.themeSeries.map((series, seriesIndex) => normalizeThemeSeries(series, seriesIndex))
      : []
  const sourcePlayers = Array.isArray(room.players) ? room.players : []
  const teams = baseTeams.slice(0, 2).map((incomingTeam, index) => {
    const defaultTeam = defaultTeams[index] || defaultTeams[0]
    const incomingPlayers = Array.isArray(incomingTeam.players)
      ? incomingTeam.players
      : sourcePlayers.filter(
          (player) => player.teamId === (incomingTeam.id || defaultTeam.id),
        )

    return {
      id: incomingTeam.id || defaultTeam.id,
      name: incomingTeam.name || defaultTeam.name,
      shortName: incomingTeam.shortName || incomingTeam.name || defaultTeam.name,
      score:
        typeof incomingTeam.score === 'number'
          ? incomingTeam.score
          : defaultTeam.score,
      accent: incomingTeam.accent || defaultTeam.accent,
      playerCount:
        typeof incomingTeam.playerCount === 'number'
          ? incomingTeam.playerCount
          : incomingPlayers.length,
      isFull: Boolean(incomingTeam.isFull),
      players:
        Array.isArray(incomingPlayers) && incomingPlayers.length > 0
          ? incomingPlayers.map((player, playerIndex) => ({
              id:
                player.id ||
                `${incomingTeam.id || defaultTeam.id}-${playerIndex}`,
              name: player.name || player.nickname || `Joueur ${playerIndex + 1}`,
              connected:
                typeof player.connected === 'boolean' ? player.connected : true,
            }))
          : hasLivePlayers
            ? []
            : defaultTeam.players,
    }
  })

  const queue =
    Array.isArray(room.queue) && room.queue.length > 0
      ? room.queue.map((entry, index) => ({
          id: entry.id || `buzz-${index + 1}`,
          playerName: entry.playerName || entry.nickname || `Joueur ${index + 1}`,
          teamId: entry.teamId || teams[0]?.id || defaultTeams[0].id,
          responseTimeLabel:
            entry.responseTimeLabel ||
            entry.timeLabel ||
            formatBuzzTime(entry.buzzedAt) ||
            `${index + 1}.00s`,
          status: normalizeQueueStatus(entry.status),
          isActive: Boolean(entry.isActive),
        }))
      : Array.isArray(room.buzzQueue) && room.buzzQueue.length > 0
        ? room.buzzQueue.map((entry, index) => ({
            id: entry.id || `buzz-${index + 1}`,
            playerName: entry.playerName || entry.nickname || `Joueur ${index + 1}`,
            teamId: entry.teamId || teams[0]?.id || defaultTeams[0].id,
            responseTimeLabel:
              entry.responseTimeLabel ||
              entry.timeLabel ||
              formatBuzzTime(entry.buzzedAt) ||
              `${index + 1}.00s`,
            status: normalizeQueueStatus(entry.status),
            isActive: Boolean(entry.isActive),
          }))
        : hasLiveQueue
          ? []
          : defaultQueue

  return {
    gameCode: room.gameCode || room.code || demoRoom.gameCode,
    roundOpen: typeof room.roundOpen === 'boolean' ? room.roundOpen : false,
    activeBuzzIndex:
      typeof room.activeBuzzIndex === 'number' ? room.activeBuzzIndex : null,
    currentQuestionPoints:
      typeof room.currentQuestionPoints === 'number' ? room.currentQuestionPoints : 1,
    teams,
    queue,
    players: Array.isArray(room.players) ? room.players : [],
    themeSeries,
  }
}

export function getPlayerBadge(name) {
  const letters = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-zÀ-ÿ]/g, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return letters || '??'
}

function normalizeQueueStatus(status) {
  if (status === 'wrong') {
    return 'failed'
  }

  return status || 'pending'
}

function formatBuzzTime(buzzedAt) {
  if (typeof buzzedAt !== 'number') {
    return ''
  }

  const seconds = Math.max(0, (buzzedAt % 100000) / 1000)
  return `${seconds.toFixed(2)}s`
}

function normalizeThemeSeries(series, seriesIndex) {
  const themes = Array.isArray(series?.themes) ? series.themes : []

  return {
    id: series?.id || `series-${seriesIndex + 1}`,
    label: series?.label || `Série ${seriesIndex + 1}`,
    themes: themes.map((theme, themeIndex) => ({
      id: theme?.id || `series-${seriesIndex + 1}-theme-${themeIndex + 1}`,
      title: theme?.title || `Thème ${themeIndex + 1}`,
      isMystery: Boolean(theme?.isMystery),
      revealed: Boolean(theme?.revealed),
    })),
  }
}
