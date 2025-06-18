// Script de prueba para verificar el manejo de fechas
const { convertirFechaALocalUtc, obtenerFechaActual } = require('./utils/fechaHoraUtils');

console.log('=== PRUEBA DE MANEJO DE FECHAS ===');

// 1. Probar fecha actual
const fechaActual = obtenerFechaActual();
console.log('Fecha actual:', fechaActual);

// 2. Probar conversión de fecha personalizada
const fechaPersonalizada = '2024-12-15T10:30:00';
const fechaConvertida = convertirFechaALocalUtc(fechaPersonalizada);
console.log('Fecha personalizada original:', fechaPersonalizada);
console.log('Fecha personalizada convertida:', fechaConvertida);

// 3. Probar con fecha de datetime-local del frontend
const fechaFrontend = '2024-12-15T10:30';
const fechaFrontendConvertida = convertirFechaALocalUtc(fechaFrontend);
console.log('Fecha del frontend:', fechaFrontend);
console.log('Fecha del frontend convertida:', fechaFrontendConvertida);

// 4. Verificar que la fecha se mantiene cuando se especifica
const testDate = '2024-01-15T08:00:00';
const resultadoTest = testDate ? convertirFechaALocalUtc(testDate) : obtenerFechaActual();
console.log('Fecha de test:', testDate);
console.log('Resultado final:', resultadoTest);
