/**
 * Compara dos fechas y determina si la primera es anterior a la segunda.
 *
 * @param {Object} params - Objeto que contiene las dos fechas a comparar.
 * @param {moment} params.firstDate - La primera fecha a comparar.
 * @param {moment} params.secondDate - La segunda fecha a comparar.
 * @returns {boolean} Retorna `true` si la primera fecha es anterior a la segunda, `false` en caso contrario.
 * @throws {Error} Si ocurre un error durante la comparación, se captura y se retorna `false`.
 */
const compareDate = ({ firstDate, secondDate }) => {
  try {
    if (firstDate.isBefore(secondDate)) {
      return true
    } else {
      return false
    }
  } catch (error) {
    return false
  }
}

module.exports = { compareDate }
