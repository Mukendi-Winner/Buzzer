export function emitWithAck(socket, eventName, payload, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 8000)

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject({
        message: 'Le serveur ne repond pas. Verifiez que le backend a bien ete redemarre.',
      })
    }, timeoutMs)

    socket.emit(eventName, payload, (response) => {
      window.clearTimeout(timeoutId)

      if (!response?.ok) {
        reject(response?.error || { message: 'Unknown socket error.' })
        return
      }

      resolve(response)
    })
  })
}
