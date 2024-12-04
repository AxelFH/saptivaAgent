/**
 * Compara un timestamp y devuelve `true` si no ha pasado más de media hora desde el tiempo actual, o `false` si ha pasado más de media hora.
 *
 * @param {number} timestamp - El timestamp a comparar.
 * @returns {boolean} - `true` si el timestamp no ha caducado, `false` si ha caducado.
 */
const compareTimestamp = (timestamp) => {
  const halfHourInMilliseconds = 30 * 60 * 1000 // Media hora en milisegundos
  const currentTimestamp = Math.floor(Date.now() / 1000) // Tiempo actual en segundos

  return (currentTimestamp - timestamp) <= halfHourInMilliseconds / 1000
}

/**
 * Compara un timestamp con el estilo de mongoDB.
 *
 * @param {number} timestamp - El timestamp a comparar con el estilo 2023-09-14T19:40:38.797+00:00.
 * @param {minutes} timestamp - los minutos a comparar para saber si han pasado o no.
 * @returns {boolean} - `true` si ha pasado el tiempo `false` si no ha pasado.
 */
const hasTimePassed = (timestamp, minutes) => {
  // Convierte el timestamp y los minutos a objetos Date
  const time = new Date(timestamp)
  const futureTime = new Date(time.getTime() + minutes * 60 * 1000)

  // Obtiene la fecha y hora actuales
  const now = new Date()

  // Compara la fecha y hora actuales con futureTime
  return now >= futureTime
}

module.exports = {
  compareTimestamp,
  hasTimePassed
}
