const express = require('express');
const router = express.Router();
const { 
  getColaboradores, 
  createColaborador, 
  deleteColaborador, 
  updateColaborador 
} = require('../services/colaboradorService');
const { authenticate } = require('../middleware/authenticate');  // Middleware para autenticación

// Obtener todos los colaboradores de un usuario autenticado
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;  // Obtener el userId del usuario autenticado

  try {
    // Obtener los colaboradores filtrando por el userId
    const colaboradores = await getColaboradores(userId);  // Aquí debe recibir el userId como parámetro
    res.json(colaboradores);
  } catch (error) {
    console.error('Error en ruta GET /:', error);
    res.status(500).json({ 
      message: 'Error al obtener los colaboradores',
      error: error.message 
    });
  }
});

// Agregar un nuevo colaborador
router.post('/', authenticate, async (req, res) => {
  const { nombre, telefono, email } = req.body;
  const userId = req.user.id;  // Obtener el userId del usuario autenticado

  if (!nombre || !email) {
    return res.status(400).json({ 
      message: 'El nombre y email son obligatorios' 
    });
  }

  try {
    // Crear un nuevo colaborador y asociarlo al userId
    const nuevoColaborador = await createColaborador({
      userId,  // Asociamos el colaborador al userId del usuario autenticado
      nombre,
      telefono,
      email
    });
    res.status(201).json({
      message: 'Colaborador creado exitosamente',
      colaborador: nuevoColaborador
    });
  } catch (error) {
    console.error('Error en ruta POST /:', error);
    res.status(500).json({
      message: 'Error al agregar colaborador',
      error: error.message
    });
  }
});

// Actualizar un colaborador
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { nombre, telefono, email } = req.body;
  const userId = req.user.id;  // Obtener el userId del usuario autenticado

  try {
    // Filtrar por userId para asegurarse de que el colaborador pertenece al usuario autenticado
    const updatedColaborador = await updateColaborador(id, { nombre, telefono, email }, userId);
    if (!updatedColaborador) {
      return res.status(404).json({ message: 'Colaborador no encontrado o no autorizado' });
    }
    res.status(200).json({
      message: 'Colaborador actualizado exitosamente',
      colaborador: updatedColaborador
    });
  } catch (error) {
    console.error('Error al actualizar colaborador:', error);
    res.status(500).json({
      message: 'Error al actualizar colaborador',
      error: error.message
    });
  }
});

// Eliminar un colaborador del usuario autenticado
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;  // Obtener el userId del usuario autenticado

  try {
    // Filtrar por userId para asegurarse de que el colaborador pertenece al usuario autenticado
    const deletedColaborador = await deleteColaborador(id, userId);
    if (!deletedColaborador) {
      return res.status(404).json({ message: 'Colaborador no encontrado o no autorizado' });
    }
    res.status(200).json({
      message: 'Colaborador eliminado exitosamente',
      colaborador: deletedColaborador
    });
  } catch (error) {
    console.error('Error al eliminar colaborador:', error);
    res.status(500).json({
      message: 'Error al eliminar colaborador',
      error: error.message
    });
  }
});

module.exports = router;
