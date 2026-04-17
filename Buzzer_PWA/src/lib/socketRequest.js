export function emitWithAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(eventName, payload, (response) => {
      if (!response?.ok) {
        reject(response?.error || { message: 'Unknown socket error.' })
        return
      }

      resolve(response)
    })
  })
}
