const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const Gasto = require('../models/Gasto');

/**
 * Obtener todos los gastos
 */
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('Usuario autenticado en GET:', req.user); // Para debugging

    const gastos = await Gasto.find({ 
      userId: req.user.id  // Cambiado de req.user._id a req.user.id
    }).sort({ fechaGasto: -1 });

    console.log('Gastos encontrados:', gastos); // Para debugging

    res.json(gastos);
  } catch (error) {
    console.error('Error al obtener gastos:', error);
    res.status(500).json({ 
      message: 'Error al obtener gastos',
      error: error.message 
    });
  }
});

/**
 * Crear nuevo gasto
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      tipoDeGasto,
      gasto,
      descripcion,
      costoUnidad,
      cantidad,
      fechaGasto
    } = req.body;

    // Validar que existe el usuario autenticado
    if (!req.user || !req.user.id) {
      console.error('Usuario no autenticado correctamente:', req.user);
      return res.status(401).json({
        message: 'No se encontró información del usuario autenticado'
      });
    }

    // Console log para debugging
    console.log('Datos recibidos:', req.body);
    console.log('Usuario autenticado:', req.user);

    // Validación más detallada
    const validationErrors = [];
    
    if (!tipoDeGasto) validationErrors.push('Tipo de gasto es requerido');
    if (!gasto) validationErrors.push('Categoría de gasto es requerida');
    if (!descripcion) validationErrors.push('Descripción es requerida');
    if (!costoUnidad) validationErrors.push('Costo por unidad es requerido');
    if (!cantidad) validationErrors.push('Cantidad es requerida');

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: 'Error de validación',
        errors: validationErrors
      });
    }

    // Asegurarse de que los valores numéricos sean válidos
    const costoUnidadNum = parseFloat(costoUnidad);
    const cantidadNum = parseFloat(cantidad);

    if (isNaN(costoUnidadNum) || isNaN(cantidadNum)) {
      return res.status(400).json({
        message: 'Error de validación',
        errors: ['Los valores de costo y cantidad deben ser números válidos']
      });
    }

    // Crear el nuevo gasto con el userId correcto
    const nuevoGasto = new Gasto({
      userId: req.user.id, // Cambiado de req.user._id a req.user.id
      tipoDeGasto,
      gasto,
      descripcion: descripcion.trim(),
      costoUnidad: costoUnidadNum,
      cantidad: cantidadNum,
      montoTotal: costoUnidadNum * cantidadNum,
      fechaGasto: fechaGasto ? new Date(fechaGasto) : new Date()
    });

    console.log('Nuevo gasto a guardar:', nuevoGasto);

    const gastoGuardado = await nuevoGasto.save();
    console.log('Gasto guardado exitosamente:', gastoGuardado);
    
    res.status(201).json(gastoGuardado);

  } catch (error) {
    console.error('Error detallado al crear gasto:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    res.status(500).json({
      message: 'Error al crear gasto',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Actualizar gasto existente
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tipoDeGasto,
      gasto,
      descripcion,
      costoUnidad,
      cantidad,
      fechaGasto
    } = req.body;

    const gastoExistente = await Gasto.findOne({
      _id: id,
      userId: req.user._id
    });

    if (!gastoExistente) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }

    // Actualizar campos si se proporcionan
    if (tipoDeGasto) gastoExistente.tipoDeGasto = tipoDeGasto;
    if (gasto) gastoExistente.gasto = gasto;
    if (descripcion) gastoExistente.descripcion = descripcion.trim();
    if (costoUnidad) gastoExistente.costoUnidad = parseFloat(costoUnidad);
    if (cantidad) gastoExistente.cantidad = parseFloat(cantidad);
    if (fechaGasto) gastoExistente.fechaGasto = new Date(fechaGasto);

    // Recalcular monto total si cambió cantidad o costo
    if (costoUnidad || cantidad) {
      gastoExistente.montoTotal = gastoExistente.costoUnidad * gastoExistente.cantidad;
    }

    await gastoExistente.save();
    res.json(gastoExistente);
  } catch (error) {
    console.error('Error al actualizar gasto:', error);
    res.status(500).json({
      message: 'Error al actualizar gasto',
      error: error.message
    });
  }
});

/**
 * Eliminar gasto
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const gasto = await Gasto.findOneAndDelete({
      _id: id,
      userId: req.user._id
    });

    if (!gasto) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }

    res.json({ message: 'Gasto eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar gasto:', error);
    res.status(500).json({
      message: 'Error al eliminar gasto',
      error: error.message
    });
  }
});

module.exports = router;