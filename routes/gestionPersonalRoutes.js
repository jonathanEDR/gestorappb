const express = require('express');
const router = express.Router();
const { obtenerFechaActual, convertirFechaAFechaLocal, convertirFechaALocalUtc } = require('../utils/fechaHoraUtils');


const { authenticate } = require('../middleware/authenticate');
const gestionService = require('../services/gestionPersonalService');
const GestionPersonal = require('../models/GestionPersonal');
const Colaborador = require('../models/Colaborador');


// Ruta para obtener todos los registros de gestión personal
// Modificar la ruta principal para obtener registros
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const registros = await GestionPersonal.find()
      .populate({
        path: 'colaboradorId',
        match: { userId }, // Solo poblará colaboradores que coincidan con el userId
        select: 'nombre departamento sueldo _id'
      })
      .sort({ fechaDeGestion: -1 });

    // Filtrar registros donde colaboradorId es null (no coincide con userId)
    const registrosFiltrados = registros.filter(registro => registro.colaboradorId);
    
    res.json(registrosFiltrados);
  } catch (error) {
    console.error('Error al obtener registros:', error);
    res.status(500).json({ message: 'Error al obtener registros de gestión' });
  }
});

// Ruta para obtener todos los colaboradores
router.get('/colaboradores', authenticate, async (req, res) => {
  try {
        const userId = req.user.id; // Obtener el userId del token

    const colaboradores = await Colaborador.find({ userId })
    res.json(colaboradores);
  } catch (error) {
    console.error('Error al obtener colaboradores:', error);
    res.status(500).json({ message: 'Error al obtener colaboradores' });
  }
});

/**
 * Crear nuevo registro de gestión personal
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const registroData = {
      ...req.body,
      userId
    };

    const { 
      colaboradorId, 
      fechaDeGestion, 
      descripcion, 
      monto = 0,        // Valor por defecto 0
      faltante = 0, 
      adelanto = 0, 
      pagodiario = 0,
      diasLaborados = 1 // Agregamos días laborados
    } = registroData;

    // Validaciones mejoradas
    if (!colaboradorId) {
      return res.status(400).json({ message: 'ID de colaborador es requerido' });
    }

    if (!fechaDeGestion) {
      return res.status(400).json({ message: 'Fecha de gestión es requerida' });
    }

    if (!descripcion || descripcion.trim() === '') {
      return res.status(400).json({ message: 'Descripción es requerida' });
    }

    // Validar que los valores numéricos sean válidos (incluyendo 0)
    const numericos = { monto, faltante, adelanto, pagodiario, diasLaborados };
    for (const [campo, valor] of Object.entries(numericos)) {
      if (typeof valor !== 'number' || isNaN(valor) || valor < 0) {
        return res.status(400).json({ 
          message: `El campo ${campo} debe ser un número válido mayor o igual a 0` 
        });
      }
    }

    // Validar ObjectId
    if (!colaboradorId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'ID de colaborador no válido' });
    }

    // Verificar colaborador
    const colaborador = await Colaborador.findOne({ 
      _id: colaboradorId,
      userId // Aseguramos que el colaborador pertenece al usuario
    });

    if (!colaborador) {
      return res.status(404).json({ message: 'Colaborador no encontrado' });
    }

    // Convertir fecha
    const fechaDeGestionUtc = convertirFechaALocalUtc(fechaDeGestion);

    // Preparar datos normalizados
    const datosNormalizados = {
      ...registroData,
      fechaDeGestion: fechaDeGestionUtc,
      monto: parseFloat(monto) || 0,
      faltante: parseFloat(faltante) || 0,
      adelanto: parseFloat(adelanto) || 0,
      pagodiario: parseFloat(pagodiario) || 0,
      diasLaborados: parseInt(diasLaborados) || 1
    };

    // Crear registro
    const nuevoRegistro = await gestionService.crearRegistro(datosNormalizados);

    // Responder con el registro creado
    res.status(201).json(nuevoRegistro);

  } catch (error) {
    console.error('Error al crear registro:', error);
    res.status(500).json({
      message: 'Error al crear registro de gestión',
      error: error.message
    });
  }
});

/**
 * Eliminar registro por ID
 */
/**
 * Eliminar un registro de gestión personal por ID
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar y eliminar el registro de gestión personal
    const registroEliminado = await GestionPersonal.findByIdAndDelete(id);
    
    // Si el registro no se encuentra, responder con un error
    if (!registroEliminado) {
      return res.status(404).json({ message: 'Registro no encontrado' });
    }

    res.json({ message: 'Registro eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar registro:', error);
    res.status(500).json({
      message: 'Error al eliminar registro de gestión',
      error: error.message
    });
  }
});

module.exports = router;
