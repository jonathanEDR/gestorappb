const express = require('express');
const router = express.Router();
const PagoRealizado = require('../models/PagoRealizado');
const Colaborador = require('../models/Colaborador');
const GestionPersonal = require('../models/GestionPersonal');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

/**
 * @route GET /api/pagos-realizados
 * @desc Obtener todos los pagos realizados del usuario
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const pagos = await PagoRealizado.find({ creadoPor: userId })
      .populate('colaboradorId', 'nombre departamento sueldo')
      .sort({ fechaPago: -1 });

    res.json(pagos);
  } catch (error) {
    console.error('Error al obtener pagos realizados:', error);
    res.status(500).json({ 
      message: 'Error al obtener pagos realizados',
      error: error.message 
    });
  }
});

/**
 * @route GET /api/pagos-realizados/colaborador/:colaboradorId
 * @desc Obtener pagos de un colaborador específico
 */
router.get('/colaborador/:colaboradorId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { colaboradorId } = req.params;

    const pagos = await PagoRealizado.find({ 
      creadoPor: userId,
      colaboradorId: colaboradorId 
    })
      .populate('colaboradorId', 'nombre departamento sueldo')
      .sort({ fechaPago: -1 });

    res.json(pagos);
  } catch (error) {
    console.error('Error al obtener pagos del colaborador:', error);
    res.status(500).json({ 
      message: 'Error al obtener pagos del colaborador',
      error: error.message 
    });
  }
});

/**
 * @route POST /api/pagos-realizados
 * @desc Crear un nuevo pago realizado
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      colaboradorId,
      fechaPago,
      montoTotal,
      metodoPago,
      periodoInicio,
      periodoFin,
      registrosIncluidos,
      observaciones,
      estado
    } = req.body;

    // Validaciones básicas
    if (!colaboradorId || !montoTotal || montoTotal <= 0) {
      return res.status(400).json({ 
        message: 'Colaborador y monto total son requeridos. El monto debe ser mayor a 0.' 
      });
    }    // Verificar que el colaborador existe y pertenece al usuario
    const colaborador = await Colaborador.findOne({
      _id: colaboradorId,
      userId: userId
    });

    if (!colaborador) {
      return res.status(404).json({ 
        message: 'Colaborador no encontrado o no autorizado' 
      });
    }

    // Crear el nuevo pago
    const nuevoPago = new PagoRealizado({
      colaboradorId,
      fechaPago: fechaPago ? new Date(fechaPago) : new Date(),
      montoTotal: parseFloat(montoTotal),
      metodoPago: metodoPago || 'efectivo',
      periodoInicio: periodoInicio ? new Date(periodoInicio) : null,
      periodoFin: periodoFin ? new Date(periodoFin) : null,
      registrosIncluidos: registrosIncluidos || [],
      observaciones: observaciones || '',
      estado: estado || 'pagado',
      creadoPor: userId
    });

    const pagoGuardado = await nuevoPago.save();
    
    // Poblar el colaborador en la respuesta
    const pagoConColaborador = await PagoRealizado.findById(pagoGuardado._id)
      .populate('colaboradorId', 'nombre departamento sueldo');

    res.status(201).json(pagoConColaborador);
  } catch (error) {
    console.error('Error al crear pago realizado:', error);
    res.status(500).json({ 
      message: 'Error al crear pago realizado',
      error: error.message 
    });
  }
});

/**
 * @route PUT /api/pagos-realizados/:id
 * @desc Actualizar un pago realizado
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updateData = req.body;

    // Eliminar campos que no deben ser actualizados
    delete updateData.creadoPor;
    delete updateData._id;

    // Convertir fechas si están presentes
    if (updateData.fechaPago) {
      updateData.fechaPago = new Date(updateData.fechaPago);
    }
    if (updateData.periodoInicio) {
      updateData.periodoInicio = new Date(updateData.periodoInicio);
    }
    if (updateData.periodoFin) {
      updateData.periodoFin = new Date(updateData.periodoFin);
    }

    const pagoActualizado = await PagoRealizado.findOneAndUpdate(
      { _id: id, creadoPor: userId },
      updateData,
      { new: true, runValidators: true }
    ).populate('colaboradorId', 'nombre departamento sueldo');

    if (!pagoActualizado) {
      return res.status(404).json({ 
        message: 'Pago no encontrado o no autorizado' 
      });
    }

    res.json(pagoActualizado);
  } catch (error) {
    console.error('Error al actualizar pago realizado:', error);
    res.status(500).json({ 
      message: 'Error al actualizar pago realizado',
      error: error.message 
    });
  }
});

/**
 * @route DELETE /api/pagos-realizados/:id
 * @desc Eliminar un pago realizado
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const pagoEliminado = await PagoRealizado.findOneAndDelete({
      _id: id,
      creadoPor: userId
    });

    if (!pagoEliminado) {
      return res.status(404).json({ 
        message: 'Pago no encontrado o no autorizado' 
      });
    }

    res.json({ 
      message: 'Pago eliminado exitosamente',
      pago: pagoEliminado 
    });
  } catch (error) {
    console.error('Error al eliminar pago realizado:', error);
    res.status(500).json({ 
      message: 'Error al eliminar pago realizado',
      error: error.message 
    });
  }
});

/**
 * @route GET /api/pagos-realizados/resumen/:colaboradorId
 * @desc Obtener resumen de pagos de un colaborador
 */
router.get('/resumen/:colaboradorId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { colaboradorId } = req.params;

    // Obtener todos los pagos del colaborador
    const pagos = await PagoRealizado.find({
      creadoPor: userId,
      colaboradorId: colaboradorId
    });    // Obtener todos los registros de gestión personal del colaborador
    const registros = await GestionPersonal.find({
      userId: userId,
      colaboradorId: colaboradorId
    });

    // Calcular totales
    const totalPagado = pagos.reduce((sum, pago) => sum + pago.montoTotal, 0);
    const totalGenerado = registros.reduce((sum, registro) => {
      const pagodiario = registro.pagodiario || 0;
      const faltante = registro.faltante || 0;
      const adelanto = registro.adelanto || 0;
      return sum + (pagodiario - faltante - adelanto);
    }, 0);

    const saldoPendiente = totalGenerado - totalPagado;
    const ultimoPago = pagos.sort((a, b) => new Date(b.fechaPago) - new Date(a.fechaPago))[0];

    res.json({
      totalPagado,
      totalGenerado,
      saldoPendiente,
      ultimoPago: ultimoPago || null,
      cantidadPagos: pagos.length,
      cantidadRegistros: registros.length
    });
  } catch (error) {
    console.error('Error al obtener resumen de pagos:', error);
    res.status(500).json({ 
      message: 'Error al obtener resumen de pagos',
      error: error.message 
    });
  }
});

/**
 * @route GET /api/pagos-realizados/estadisticas
 * @desc Obtener estadísticas generales de pagos
 */
router.get('/estadisticas', async (req, res) => {
  try {
    const userId = req.user.id;

    // Estadísticas por método de pago
    const estadisticasPorMetodo = await PagoRealizado.aggregate([
      { $match: { creadoPor: userId } },
      {
        $group: {
          _id: '$metodoPago',
          total: { $sum: '$montoTotal' },
          cantidad: { $sum: 1 }
        }
      }
    ]);

    // Estadísticas por estado
    const estadisticasPorEstado = await PagoRealizado.aggregate([
      { $match: { creadoPor: userId } },
      {
        $group: {
          _id: '$estado',
          total: { $sum: '$montoTotal' },
          cantidad: { $sum: 1 }
        }
      }
    ]);

    // Pagos por mes (últimos 12 meses)
    const hace12Meses = new Date();
    hace12Meses.setMonth(hace12Meses.getMonth() - 12);

    const pagosPorMes = await PagoRealizado.aggregate([
      { 
        $match: { 
          creadoPor: userId,
          fechaPago: { $gte: hace12Meses }
        } 
      },
      {
        $group: {
          _id: {
            año: { $year: '$fechaPago' },
            mes: { $month: '$fechaPago' }
          },
          total: { $sum: '$montoTotal' },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1 } }
    ]);

    res.json({
      estadisticasPorMetodo,
      estadisticasPorEstado,
      pagosPorMes
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ 
      message: 'Error al obtener estadísticas',
      error: error.message 
    });
  }
});

module.exports = router;
