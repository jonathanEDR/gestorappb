const express = require('express');
const Cobro = require('../models/Cobro');
const Venta = require('../models/Venta'); 
const Colaborador = require('../models/Colaborador');
const { authenticate } = require('../middleware/authenticate');
const { getCobros, createCobro, updateCobro, deleteCobro, deleteCobroByColaborador, updateCobroByColaborador } = require('../services/cobroService');

const router = express.Router();

// Código para el backend actualizado - Ruta GET para cobros
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 15 } = req.query;  // Paginación: página y límite por defecto a 15
  
  try {
    // Convertir los parámetros de la consulta a números
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    // Obtener los cobros paginados y ordenados por la fecha de pago
    const cobros = await Cobro.find({ userId })
      .sort({ fechaPago: -1 })  // Ordenar los cobros más recientes primero
      .skip((pageNum - 1) * limitNum)  // Saltar los cobros previos de la página
      .limit(limitNum)  // Limitar a 15 cobros por página
      .populate('colaboradorId');
    
    // Obtener el total de cobros para calcular las páginas
    const totalCobros = await Cobro.countDocuments({ userId });
    
    // Respuesta con formato compatible
    res.json({
      cobros,
      totalCobros,
      totalPages: Math.ceil(totalCobros / limitNum),
      currentPage: pageNum
    });
  } catch (error) {
    console.error('Error al obtener cobros:', error);
    res.status(500).json({ message: 'Error al obtener los cobros' });
  }
});

// Helper function to calculate total debt and payments
async function getDebtInfo(colaboradorId) {
  // Get total from sales
  const ventas = await Venta.find({ colaboradorId });
  const totalDebt = ventas.reduce((sum, venta) => sum + venta.montoTotal, 0);

  // Get total payments
  const cobros = await Cobro.find({ colaboradorId });
  const totalPaid = cobros.reduce((sum, cobro) => sum + cobro.montoPagado, 0);

  return {
    totalDebt,
    totalPaid,
    remainingDebt: totalDebt - totalPaid
  };
}

// Crear un nuevo cobro
router.post('/', authenticate, async (req, res) => {
  console.log('Datos recibidos en el backend:', req.body);
  const { colaboradorId, montoPagado, estadoPago } = req.body;
  const userId = req.user.id;

  try {
    if (!colaboradorId || !montoPagado || !estadoPago) {
      return res.status(400).json({ message: 'Faltan datos necesarios' });
    }

    // Check if colaborador exists
    const colaborador = await Colaborador.findById(colaboradorId);
    if (!colaborador) {
      return res.status(404).json({ message: 'Colaborador no encontrado' });
    }

    // Get ventas for this colaborador
    const ventas = await Venta.find({ colaboradorId });
    const totalDeuda = ventas.reduce((sum, venta) => sum + venta.montoTotal, 0);

    // Get existing cobros
    const cobrosExistentes = await Cobro.find({ colaboradorId });
    const totalPagado = cobrosExistentes.reduce((sum, cobro) => sum + cobro.montoPagado, 0);

    // Calculate remaining debt
    const deudaPendiente = totalDeuda - totalPagado;

    // Validate payment amount
    if (montoPagado > deudaPendiente) {
      return res.status(400).json({
        message: `El pago (${montoPagado}) excede la deuda pendiente (${deudaPendiente})`
      });
    }

    // Create new cobro
    const nuevoCobro = new Cobro({
      colaboradorId,
      montoPagado: Number(montoPagado),
      estadoPago,
      fechaPago: new Date(),
      userId
    });

    await nuevoCobro.save();

    // Populate colaborador data
    const cobroPopulated = await Cobro.findById(nuevoCobro._id).populate('colaboradorId');
    res.status(201).json(cobroPopulated);
  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ message: 'Error al registrar el cobro', error: error.message });
  }
});

// Actualizar un cobro (por ejemplo, para marcarlo como "total")
router.put('/:id', authenticate, async (req, res) => {
  const { estadoPago } = req.body;
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const cobro = await Cobro.findOneAndUpdate({ _id: id, userId }, { estadoPago }, { new: true });
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

module.exports = router;
