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
  removeJson(HOST_SESSION_KEY, sessionStorage)
}

export function readPlayerSession() {
  return readJson(PLAYER_SESSION_KEY)
}

export function writePlayerSession(value) {
  writeJson(PLAYER_SESSION_KEY, value)
}

export function clearPlayerSession() {
  removeJson(PLAYER_SESSION_KEY, localStorage)
}

export function readPlayerJoinInfo() {
  return readJson(PLAYER_JOIN_KEY)
}

export function writePlayerJoinInfo(value) {
  writeJson(PLAYER_JOIN_KEY, value)
}

export function clearPlayerJoinInfo() {
  removeJson(PLAYER_JOIN_KEY, localStorage)
}

function readJson(key) {
  try {
    const storage = getStorageForKey(key)
    const value = storage?.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  const storage = getStorageForKey(key)
  if (!storage) {
    return
  }

  storage.setItem(key, JSON.stringify(value))
}

function removeJson(key, storage) {
  try {
    storage?.removeItem(key)
  } catch {
    // Ignore storage cleanup failures.
  }
}

function getStorageForKey(key) {
  if (key === PLAYER_SESSION_KEY || key === PLAYER_JOIN_KEY) {
    return localStorage
  }

  return sessionStorage
}
