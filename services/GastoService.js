const GestionPersonal = require('../models/GestionPersonal');

// Obtener la gestión personal de un colaborador
const getGestionPersonal = async (userId) => {
  return await GestionPersonal.findOne({ colaboradorId: userId });
};

// Crear un gasto y agregarlo a la gestión personal
const createGasto = async (gastoData) => {
  const gestion = await GestionPersonal.findOne({ colaboradorId: gastoData.colaboradorId });
  
  if (!gestion) throw new Error('Gestión no encontrada');

  // Agregar el gasto al array correspondiente (gastosOcasionales, faltantes o adelantos)
  if (gastoData.tipo === 'gastosOcasionales') {
    gestion.gastosOcasionales.push(gastoData);
  } else if (gastoData.tipo === 'faltantes') {
    gestion.faltantes.push(gastoData);
  } else if (gastoData.tipo === 'adelantos') {
    gestion.adelantos.push(gastoData);
  }

  await gestion.save();
  return gastoData; // Retornar el gasto creado
};

// Actualizar un gasto dentro de la gestión personal
const updateGasto = async (gastoId, userId, updatedData) => {
  const gestion = await GestionPersonal.findOne({ colaboradorId: userId });

  if (!gestion) throw new Error('Gestión personal no encontrada');

  // Buscar el gasto por ID y actualizarlo
  const gasto = gestion.gastosOcasionales.id(gastoId) || 
                gestion.faltantes.id(gastoId) || 
                gestion.adelantos.id(gastoId);

  if (!gasto) return null; // Si no se encuentra el gasto, retornamos null

  Object.assign(gasto, updatedData);
  await gestion.save();

  return gasto; // Retornar el gasto actualizado
};

// Eliminar un gasto de la gestión personal
const deleteGasto = async (gastoId, userId) => {
  const gestion = await GestionPersonal.findOne({ colaboradorId: userId });

  if (!gestion) throw new Error('Gestión personal no encontrada');

  // Buscar y eliminar el gasto por ID
  const gasto = gestion.gastosOcasionales.id(gastoId) || 
                gestion.faltantes.id(gastoId) || 
                gestion.adelantos.id(gastoId);

  if (!gasto) return null; // Si no se encuentra el gasto, retornamos null

  gasto.remove(); // Eliminar el gasto
  await gestion.save();

  return gasto; // Retornar el gasto eliminado
};

module.exports = {
  getGestionPersonal,
  createGasto,
  updateGasto,
  deleteGasto
};
