// Importar la librería moment-timezone
const moment = require('moment-timezone');

// Definir la zona horaria que se utilizará (en este caso Lima, Perú)
const zonaHoraria = 'America/Lima';  // Puedes cambiar esta zona horaria si es necesario

// Función para obtener la fecha actual en la zona horaria correcta
const obtenerFechaActual = () => {
  // Retorna la fecha actual en formato ISO 8601 usando la zona horaria configurada
  return moment().tz(zonaHoraria).format(); // El formato es ISO 8601
}

// Función para convertir una fecha UTC a la zona horaria local
const convertirFechaAFechaLocal = (fechaUtc) => {
  return moment.utc(fechaUtc).tz(zonaHoraria).format('YYYY-MM-DD HH:mm:ss'); // Formato adecuado para mostrar en local
}

// Función para convertir una fecha local a UTC antes de guardarla en la base de datos
const convertirFechaALocalUtc = (fechaLocal) => {
  return moment.tz(fechaLocal, zonaHoraria).utc().format(); // Convierte la fecha a UTC en formato ISO 8601
}

module.exports = {
  obtenerFechaActual,
  convertirFechaAFechaLocal,
  convertirFechaALocalUtc
};
