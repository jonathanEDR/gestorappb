const Counter = require('../models/Counter');  // Suponiendo que tienes un modelo de contadores

// Función para obtener el siguiente valor secuencial
async function getNextSequenceValue(sequenceName) {
  const sequenceDocument = await Counter.findOneAndUpdate(
    { name: sequenceName },
    { $inc: { count: 1 } },
    { new: true, upsert: true }  // Si no existe, lo crea con count: 1
  );
  return sequenceDocument.count;
}

module.exports = { getNextSequenceValue };
