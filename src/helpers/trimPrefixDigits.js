const trimPrefixDigits = (cadena) => {
  if (cadena.length >= 3) {
    const nuevaParte = '52' + cadena.substring(3)
    return nuevaParte
  } else {
    return cadena
  }
}

const normalizeMXNumber = (cadena) => {
  if (cadena.length >= 3) {
    const nuevaParte = cadena.substring(2)
    return nuevaParte
  } else {
    return cadena
  }
}

module.exports = {
  trimPrefixDigits,
  normalizeMXNumber
}
