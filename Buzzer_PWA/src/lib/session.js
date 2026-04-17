const HOST_SESSION_KEY = 'buzzer-host-session'
const PLAYER_SESSION_KEY = 'buzzer-player-session'
const PLAYER_JOIN_KEY = 'buzzer-player-join'

export function readHostSession() {
  return readJson(HOST_SESSION_KEY)
}

export function writeHostSession(value) {
  writeJson(HOST_SESSION_KEY, value)
}

export function clearHostSession() {
  sessionStorage.removeItem(HOST_SESSION_KEY)
}

export function readPlayerSession() {
  return readJson(PLAYER_SESSION_KEY)
}

export function writePlayerSession(value) {
  writeJson(PLAYER_SESSION_KEY, value)
}

export function clearPlayerSession() {
  sessionStorage.removeItem(PLAYER_SESSION_KEY)
}

export function readPlayerJoinInfo() {
  return readJson(PLAYER_JOIN_KEY)
}

export function writePlayerJoinInfo(value) {
  writeJson(PLAYER_JOIN_KEY, value)
}

export function clearPlayerJoinInfo() {
  sessionStorage.removeItem(PLAYER_JOIN_KEY)
}

function readJson(key) {
  try {
    const value = sessionStorage.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  sessionStorage.setItem(key, JSON.stringify(value))
}
