import { io } from 'socket.io-client'

let socket

export function getSocket() {
  if (!socket) {
    const serverUrl = import.meta.env.VITE_SERVER_URL?.trim() || undefined

    socket = io(serverUrl, {
      autoConnect: true,
      path: '/socket.io',
    })
  }

  return socket
}
