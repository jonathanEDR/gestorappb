const Colaborador = require('../models/Colaborador');

/**
 * Obtiene todos los colaboradores de un usuario específico
 * @param {string} userId - ID del usuario autenticado
 * @returns {Promise<Array>} - Arreglo de colaboradores
 */
const getColaboradores = async (userId) => {
  if (!userId) {
    throw new Error('userId es requerido para obtener colaboradores');
  }
  
  try {
    // Buscar colaboradores que pertenezcan al usuario especificado
    const colaboradores = await Colaborador.find({ userId: userId });
    return colaboradores;
  } catch (error) {
    console.error('Error en getColaboradores:', error);
    throw new Error(`Error al obtener colaboradores: ${error.message}`);
  }
};

/**
 * Crea un nuevo colaborador
 * @param {Object} colaboradorData - Datos del colaborador a crear
 * @returns {Promise<Object>} - Colaborador creado
 */
const createColaborador = async (colaboradorData) => {
  if (!colaboradorData.userId) {
    throw new Error('userId es requerido para crear un colaborador');
  }
  
  try {
    const nuevoColaborador = new Colaborador(colaboradorData);
    return await nuevoColaborador.save();
  } catch (error) {
    console.error('Error en createColaborador:', error);
    throw new Error(`Error al crear colaborador: ${error.message}`);
  }
};

/**
 * Elimina un colaborador
 * @param {string} id - ID del colaborador a eliminar
 * @param {string} userId - ID del usuario autenticado
 * @returns {Promise<Object>} - Colaborador eliminado
 */
const deleteColaborador = async (id, userId) => {
  if (!id || !userId) {
    throw new Error('Se requiere id del colaborador y userId para eliminar');
  }
  
  try {
    // Eliminar el colaborador que coincida con el ID y pertenezca al usuario
    const colaboradorEliminado = await Colaborador.findOneAndDelete({ 
      _id: id,
      userId: userId 
    });
    
    if (!colaboradorEliminado) {
      return null; // Retorna null si no encuentra un colaborador o no pertenece al usuario
    }
    
    return colaboradorEliminado;
  } catch (error) {
    console.error('Error en deleteColaborador:', error);
    throw new Error(`Error al eliminar colaborador: ${error.message}`);
  }
};

/**
 * Actualiza un colaborador existente
 * @param {string} id - ID del colaborador a actualizar
 * @param {Object} updateData - Nuevos datos del colaborador
 * @param {string} userId - ID del usuario autenticado
 * @returns {Promise<Object>} - Colaborador actualizado
 */
const updateColaborador = async (id, updateData, userId) => {
  if (!id || !userId) {
    throw new Error('Se requiere id del colaborador y userId para actualizar');
  }
  
  try {
    // Actualizar el colaborador que coincida con el ID y pertenezca al usuario
    const colaboradorActualizado = await Colaborador.findOneAndUpdate(
      { 
        _id: id,
        userId: userId 
      },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!colaboradorActualizado) {
      return null; // Retorna null si no encuentra un colaborador o no pertenece al usuario
    }
    
    return colaboradorActualizado;
  } catch (error) {
    console.error('Error en updateColaborador:', error);
    throw new Error(`Error al actualizar colaborador: ${error.message}`);
  }
};

module.exports = {
  getColaboradores,
  createColaborador,
  deleteColaborador,
  updateColaborador
};