const express = require('express');
const Cobro = require('../models/Cobro');
const Venta = require('../models/Venta'); 
const Colaborador = require('../models/Colaborador');
const { authenticate } = require('../middleware/authenticate');
const { getCobros, createCobro, updateCobro, deleteCobro, deleteCobroByColaborador, updateCobroByColaborador } = require('../services/cobroService');
const Devolucion = require('../models/Devolucion');
const { obtenerFechaActual, convertirFechaAFechaLocal, convertirFechaALocalUtc } = require('../utils/fechaHoraUtils');
const moment = require('moment-timezone');


const router = express.Router();

// Modificar la ruta GET existente
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    const cobros = await Cobro.find({ userId })
      .populate('colaboradorId', 'nombre') // Añade esto para poblar el nombre del colaborador
      .sort({ fechaPago: -1 });
    
    res.json({
      cobros,
      totalPages: Math.ceil(cobros.length / 15),
      currentPage: 1
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los cobros' });
  }
});



// Helper function to calculate total debt and payments
async function getDebtInfo(colaboradorId) {
  try {
    // Get total from sales
    const ventas = await Venta.find({ colaboradorId });
    const totalDebt = ventas.reduce((sum, venta) => sum + venta.montoTotal, 0);

    // Get payments only for partial payments
    const cobros = await Cobro.find({ 
      colaboradorId,
      estadoPago: 'parcial' // Solo obtener cobros parciales
    });

    // Sum only partial payments
    const totalPaid = cobros.reduce((sum, cobro) => sum + cobro.montoPagado, 0);

    // Get payments with total status
    const cobrosTotales = await Cobro.find({
      colaboradorId,
      estadoPago: 'total'
    });

    // Calculate amount paid in full
    const montoPagadoTotal = cobrosTotales.reduce((sum, cobro) => sum + cobro.montoPagado, 0);

    // Subtract fully paid amounts from total debt
    const deudaReal = totalDebt - montoPagadoTotal;
    
    return {
      totalDebt: deudaReal, // Mostrar solo la deuda pendiente real
      totalPaid,
      remainingDebt: deudaReal - totalPaid
    };
  } catch (error) {
    console.error('Error en getDebtInfo:', error);
    throw error;
  }
}

// Nueva función para calcular la deuda pendiente por rango de fechas
async function getDebtByDateRange(colaboradorId, deudaRange) {
  try {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    // Determinar el rango de fechas según deudaRange
    switch (deudaRange) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);  // Hoy a las 00:00
        endDate.setHours(23, 59, 59, 999);  // Hoy hasta las 23:59
        break;
      case 'week':
        startDate.setDate(now.getDate() - now.getDay());  // Inicio de la semana
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(startDate.getDate() + 6);  // Fin de la semana
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate.setDate(1);  // Primer día del mes
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(now.getMonth() + 1, 0);  // Último día del mes anterior
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'year':
        startDate.setMonth(0, 1);  // Primer día del año
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(11, 31);  // Último día del año
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'historical':
        startDate = null;
        endDate = null;
        break;
      default:
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(now.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    // Obtener ventas del colaborador dentro del rango de fechas
    const ventas = await Venta.find({
      colaboradorId,
      fechadeVenta: { $gte: startDate, $lte: endDate }  // Filtrar ventas dentro del rango
    });

    // Calcular la deuda total de ventas
    const totalDebt = ventas.reduce((sum, venta) => sum + venta.montoTotal, 0);

    // Obtener pagos parciales dentro del rango de fechas
    const cobrosParciales = await Cobro.find({
      colaboradorId,
      estadoPago: 'parcial',
      fechaPago: { $gte: startDate, $lte: endDate }  // Filtrar cobros parciales dentro del rango
    });

    const totalPaid = cobrosParciales.reduce((sum, cobro) => sum + cobro.montoPagado, 0);

    // Obtener pagos completos dentro del rango de fechas
    const cobrosTotales = await Cobro.find({
      colaboradorId,
      estadoPago: 'total',
      fechaPago: { $gte: startDate, $lte: endDate }  // Filtrar cobros completos dentro del rango
    });

    const montoPagadoTotal = cobrosTotales.reduce((sum, cobro) => sum + cobro.montoPagado, 0);

    // Calcular la deuda real restando los pagos completos
    const deudaReal = totalDebt - montoPagadoTotal;

    // Calcular la deuda pendiente restando los pagos parciales
    const remainingDebt = deudaReal - totalPaid;

    return {
      totalDebt: deudaReal,  // Deuda total real
      totalPaid,
      remainingDebt,  // Deuda pendiente
    };
  } catch (error) {
    console.error('Error al obtener la deuda pendiente por rango de fechas:', error);
    throw error;
  }
}


// Crear un nuevo cobro
router.post('/', authenticate, async (req, res) => {
  console.log('Datos recibidos en el backend:', req.body);
  const { colaboradorId, yape, efectivo, gastosImprevistos, montoPagado, estadoPago, fechaPago } = req.body;
  const userId = req.user.id;

  try {
    if (!colaboradorId || !yape || !efectivo || !gastosImprevistos || !montoPagado || !estadoPago) {
      return res.status(400).json({ message: 'Faltan datos necesarios' });
    }

    // Manejo específico de la fecha con zona horaria
    let fechaFinal;
    if (fechaPago) {
      // Usamos la función para convertir la fecha a UTC antes de guardarla
      fechaFinal = convertirFechaALocalUtc(fechaPago);  // Convertimos la fecha local a UTC
      // Asegurarse de que la fecha sea válida
      if (isNaN(new Date(fechaFinal).getTime())) {
        return res.status(400).json({ message: 'Fecha inválida' });
      }
    } else {
      // Si no hay fecha, usamos la fecha actual en UTC
      fechaFinal = obtenerFechaActual();  // Usamos la fecha actual en UTC
    }

    console.log('Fecha original recibida:', fechaPago);
    console.log('Fecha ajustada a zona horaria (UTC):', fechaFinal);

    // Crear nuevo cobro con la fecha ajustada
    const nuevoCobro = new Cobro({
      colaboradorId,
      yape,
      efectivo,
      gastosImprevistos,
      montoPagado: Number(montoPagado),
      estadoPago,
      fechaPago: fechaFinal,
      userId
    });

    await nuevoCobro.save();

    // Populate colaborador data y ajustar la fecha en la respuesta
    const cobroPopulated = await Cobro.findById(nuevoCobro._id)
      .populate('colaboradorId');

    // Formatear la fecha en la respuesta para mostrarla en la zona horaria local
    const cobroResponse = cobroPopulated.toObject();
    cobroResponse.fechaPago = moment(cobroResponse.fechaPago)
      .tz('America/Lima')  // Convertimos la fecha a la zona horaria de Lima para mostrarla
      .format('YYYY-MM-DD');  // Solo mostramos la fecha, sin la hora

    res.status(201).json(cobroResponse);
  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ 
      message: 'Error al registrar el cobro', 
      error: error.message 
    });
  }
});


// Actualizar un cobro (por ejemplo, para marcarlo como "total")
router.put('/:id', authenticate, async (req, res) => {
  const { estadoPago } = req.body;
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const cobro = await Cobro.findOneAndUpdate({ _id: id, userId }, { estadoPago, yape, efectivo, gastosImprevistos }, { new: true });
    if (!cobro) {
      return res.status(404).json({ message: 'Cobro no encontrado o no pertenece al usuario' });
    }
    res.json(cobro);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el cobro' });
  }
});

// Eliminar un cobro
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const deletedCobro = await Cobro.findOneAndDelete({ _id: id, userId });
    if (!deletedCobro) {
      return res.status(404).json({ message: 'Cobro no encontrado o no pertenece al usuario' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el cobro' });
  }
});

// Obtener información de deuda de un colaborador
router.get('/debtInfo/:colaboradorId', authenticate, async (req, res) => {
  const { colaboradorId } = req.params;
  try {
    const debtInfo = await getDebtInfo(colaboradorId);
    res.json(debtInfo);
  } catch (error) {
    console.error('Error al obtener información de deuda:', error);
    res.status(500).json({ message: 'Error al obtener información de deuda' });
  }
});

// Eliminar cobros por colaborador
router.delete('/byName/:colaboradorID', authenticate, async (req, res) => {
  const { colaboradorID } = req.params;
  const userId = req.user.id;

  try {
    await deleteCobroByColaborador(userId, colaboradorID);
    res.json({ message: `Cobro para el colaborador ${colaboradorID} eliminado exitosamente.` });
  } catch (error) {
    console.error('Error al eliminar cobro por colaborador:', error);
    res.status(500).json({ message: 'Error al eliminar el cobro.' });
  }
});

// Actualizar cobros por colaborador
router.put('/byName/:colaboradorID', authenticate, async (req, res) => {
  const { colaboradorID } = req.params;
  const cobroData = req.body;
  const userId = req.user.id;

  try {
    const updatedCobro = await updateCobroByColaborador(userId, colaboradorID, cobroData);
    res.json({ message: `Cobro para el colaborador ${colaboradorID} actualizado exitosamente.`, updatedCobro });
  } catch (error) {
    console.error('Error al actualizar cobro por colaborador:', error);
    res.status(500).json({ message: 'Error al actualizar el cobro.' });
  }
});

// Ruta para obtener informe de pagos
router.get('/reportes/pagos', authenticate, async (req, res) => {
  try {
    const cobros = await Cobro.find().populate('colaboradorId');
    const reportePagos = cobros.map((cobro) => ({
      nombreColaborador: cobro.colaboradorId.nombre,
      montoPagado: cobro.montoPagado,
      estadoPago: cobro.estadoPago,
      fechaPago: cobro.fechaPago,
      saldoPendiente: cobro.estadoPago === 'parcial' ? (cobro.montoTotal - cobro.montoPagado) : 0
    }));

    const saldoPendienteTotal = reportePagos.reduce((acc, item) => acc + item.saldoPendiente, 0);

    res.json({ reportePagos, saldoPendienteTotal });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el informe de pagos', error });
  }
});

router.get('/ventas-pendientes/:colaboradorId', authenticate, async (req, res) => {
  const { colaboradorId } = req.params;
  try {
    const ventasPendientes = await Venta.find({ 
      colaboradorId,
      estadoPago: { $in: ['Pendiente', 'Parcial'] }
    }).populate('productoId');
    res.json(ventasPendientes);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener ventas pendientes', error: error.message });
  }
});


module.exports = router;
