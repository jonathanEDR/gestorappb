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

// Modificar la ruta GET para sistema "Ver más"
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    // Obtener parámetros para "Ver más"
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 20;
    const isFirstLoad = offset === 0;

    // Obtener cobros con offset/limit
    const cobros = await Cobro.find({ userId })
      .populate('colaboradorId', 'nombre')
      .sort({ fechaPago: -1 })
      .skip(offset)
      .limit(limit);

    // Contar el total de cobros
    const totalCobros = await Cobro.countDocuments({ userId });
    const hasMore = (offset + limit) < totalCobros;

    // Si es la primera carga, obtener todos los cobros para gráficos
    let allCobrosForCharts = [];
    if (isFirstLoad) {
      allCobrosForCharts = await Cobro.find({ userId })
        .populate('colaboradorId', 'nombre')
        .sort({ fechaPago: -1 });
    }
    
    res.json({
      cobros,
      allCobrosForCharts: isFirstLoad ? allCobrosForCharts : undefined,
      offset,
      limit,
      totalCobros,
      hasMore,
      isFirstLoad
    });
  } catch (error) {
    console.error('Error al obtener los cobros:', error);
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
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate = new Date(0); // Histórico
    }

    // Obtener ventas en el rango de fechas
    const ventas = await Venta.find({
      colaboradorId,
      fechaVenta: { $gte: startDate, $lte: endDate }
    });

    const totalDebt = ventas.reduce((sum, venta) => sum + (venta.montoTotal || 0), 0);
    const totalPaid = ventas.reduce((sum, venta) => sum + (venta.cantidadPagada || 0), 0);

    return {
      totalDebt,
      totalPaid,
      remainingDebt: totalDebt - totalPaid,
      ventasCount: ventas.length
    };
  } catch (error) {
    console.error('Error en getDebtByDateRange:', error);
    throw error;
  }
}

// Nueva ruta optimizada para obtener colaboradores con deudas pendientes
router.get('/colaboradores-con-deudas', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    // Obtener todos los colaboradores del usuario
    const colaboradores = await Colaborador.find({ userId });
    
    // Para cada colaborador, calcular su deuda pendiente basada en ventas
    const colaboradoresConDeuda = await Promise.all(
      colaboradores.map(async (colaborador) => {
        // Obtener todas las ventas del colaborador
        const ventas = await Venta.find({ 
          colaboradorId: colaborador._id,
          userId: userId 
        });
        
        // Calcular deuda total y pagado total
        let deudaTotal = 0;
        let totalPagado = 0;
        let ventasPendientes = 0;
          for (const venta of ventas) {
          const deuda = venta.montoTotal || 0; // Usar montoTotal como deuda base
          const pagado = venta.cantidadPagada || 0;
          
          deudaTotal += deuda;
          totalPagado += pagado;
          
          // Contar ventas que aún tienen deuda pendiente
          if (deuda > pagado) {
            ventasPendientes++;
          }
        }
        
        const deudaPendiente = deudaTotal - totalPagado;
        
        return {
          ...colaborador.toObject(),
          deudaPendiente: Math.max(0, deudaPendiente),
          cantidadVentasPendientes: ventasPendientes,
          totalVentas: ventas.length,
          deudaTotal,
          totalPagado
        };
      })
    );
    
    // Filtrar solo colaboradores con deuda pendiente mayor a 0
    const colaboradoresDeudores = colaboradoresConDeuda.filter(
      colaborador => colaborador.deudaPendiente > 0
    );
      res.json(colaboradoresDeudores);
  } catch (error) {
    console.error('Error al obtener colaboradores con deudas:', error);
    res.status(500).json({ 
      message: 'Error al obtener colaboradores con deudas pendientes',
      error: error.message 
    });
  }
});

// Crear un nuevo cobro
router.post('/', authenticate, async (req, res) => {
  console.log('Datos recibidos en el backend:', req.body);
  const { colaboradorId, ventaId, yape, efectivo, gastosImprevistos, montoPagado, estadoPago, fechaPago } = req.body;
  const userId = req.user.id;

  try {
    if (!colaboradorId || !ventaId || montoPagado <= 0) {
      return res.status(400).json({ message: 'Faltan datos necesarios (colaborador, venta, monto)' });
    }

    // Verificar que la venta existe y pertenece al usuario
    const venta = await Venta.findOne({ _id: ventaId, userId });
    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }    // Verificar que la venta tiene deuda pendiente
    const deudaTotal = venta.montoTotal || 0; // Usar montoTotal como deuda base
    const yaaPagado = venta.cantidadPagada || 0;
    const deudaPendiente = deudaTotal - yaaPagado;

    if (deudaPendiente <= 0) {
      return res.status(400).json({ message: 'Esta venta ya está completamente pagada' });
    }

    if (montoPagado > deudaPendiente) {
      return res.status(400).json({ 
        message: `El monto (${montoPagado}) excede la deuda pendiente (${deudaPendiente})` 
      });
    }    // Manejo específico de la fecha con zona horaria
    let fechaFinal;
    if (fechaPago) {
      fechaFinal = convertirFechaALocalUtc(fechaPago);
      if (isNaN(new Date(fechaFinal).getTime())) {
        return res.status(400).json({ message: 'Fecha inválida' });
      }
    } else {
      fechaFinal = obtenerFechaActual();
    }

    console.log('Fecha original recibida:', fechaPago);
    console.log('Fecha ajustada a zona horaria (UTC):', fechaFinal);

    // Determinar el estado de pago basado en si se pagó toda la deuda de esta venta
    const estadoFinal = (montoPagado >= deudaPendiente) ? 'total' : 'parcial';

    // Crear nuevo cobro asociado a la venta específica
    const nuevoCobro = new Cobro({
      colaboradorId,
      ventaId, // Nueva referencia a la venta específica
      yape: Number(yape) || 0,
      efectivo: Number(efectivo) || 0,
      gastosImprevistos: Number(gastosImprevistos) || 0,
      montoPagado: Number(montoPagado),
      estadoPago: estadoFinal,
      fechaPago: fechaFinal,
      userId
    });

    await nuevoCobro.save();

    // Actualizar la cantidad pagada en la venta
    venta.cantidadPagada = yaaPagado + Number(montoPagado);
    await venta.save();

    // Populate colaborador y venta data
    const cobroPopulated = await Cobro.findById(nuevoCobro._id)
      .populate('colaboradorId')
      .populate('ventaId');

    // Formatear la fecha en la respuesta
    const cobroResponse = cobroPopulated.toObject();
    cobroResponse.fechaPago = moment(cobroResponse.fechaPago)
      .tz('America/Lima')
      .format('YYYY-MM-DD');

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
    console.log('🔍 DEBUG: Iniciando eliminación de cobro:', id);
    
    // Buscar el cobro antes de eliminarlo para obtener la información
    const cobro = await Cobro.findOne({ _id: id, userId }).populate('ventaId');
    if (!cobro) {
      return res.status(404).json({ message: 'Cobro no encontrado o no pertenece al usuario' });
    }    console.log('🔍 DEBUG: Cobro encontrado:', {
      id: cobro._id,
      monto: cobro.montoPagado, // CORRECCIÓN: Usar montoPagado
      ventaId: cobro.ventaId?._id,
      fecha: cobro.fechaPago
    });

    // Validar que el cobro tenga venta asociada
    if (!cobro.ventaId) {
      return res.status(400).json({ message: 'El cobro no tiene una venta asociada válida' });
    }

    // Obtener la venta actual
    const venta = await Venta.findById(cobro.ventaId._id);
    if (!venta) {
      return res.status(404).json({ message: 'Venta asociada no encontrada' });
    }

    console.log('🔍 DEBUG: Venta antes de actualizar:', {
      id: venta._id,
      montoTotal: venta.montoTotal,
      cantidadPagada: venta.cantidadPagada,
      estadoPago: venta.estadoPago
    });    // Validar los valores antes del cálculo
    const montoCobroActual = Number(cobro.montoPagado) || 0; // CORRECCIÓN: Usar montoPagado
    const cantidadPagadaActual = Number(venta.cantidadPagada) || 0;
    const montoTotalVenta = Number(venta.montoTotal) || 0;

    // Calcular nueva cantidad pagada (restar el cobro eliminado)
    const nuevaCantidadPagada = Math.max(0, cantidadPagadaActual - montoCobroActual);

    // Recalcular estado de pago
    let nuevoEstadoPago = 'Pendiente';
    if (nuevaCantidadPagada >= montoTotalVenta) {
      nuevoEstadoPago = 'Pagado';
    } else if (nuevaCantidadPagada > 0) {
      nuevoEstadoPago = 'Parcial';
    }

    console.log('🔍 DEBUG: Cálculos:', {
      montoCobroActual,
      cantidadPagadaActual,
      nuevaCantidadPagada,
      montoTotalVenta,
      nuevoEstadoPago
    });

    // Actualizar la venta
    const ventaActualizada = await Venta.findByIdAndUpdate(
      cobro.ventaId._id,
      {
        cantidadPagada: nuevaCantidadPagada,
        estadoPago: nuevoEstadoPago
      },
      { new: true }
    );

    console.log('🔍 DEBUG: Venta actualizada:', {
      id: ventaActualizada._id,
      cantidadPagada: ventaActualizada.cantidadPagada,
      estadoPago: ventaActualizada.estadoPago
    });

    // Eliminar el cobro
    await Cobro.findByIdAndDelete(id);

    console.log('✅ DEBUG: Cobro eliminado exitosamente y venta actualizada');

    res.json({ 
      message: 'Cobro eliminado correctamente y venta actualizada',
      venta: {
        id: ventaActualizada._id,
        cantidadPagada: ventaActualizada.cantidadPagada,
        estadoPago: ventaActualizada.estadoPago
      }
    });

  } catch (error) {
    console.error('❌ Error al eliminar el cobro:', error);
    res.status(500).json({ 
      message: 'Error al eliminar el cobro',
      error: error.message 
    });
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

// Obtener ventas pendientes de un colaborador, incluyendo pagos y devoluciones
router.get('/ventas-pendientes/:colaboradorId', authenticate, async (req, res) => {
  const { colaboradorId } = req.params;
  const userId = req.user.id;
  try {
    // Buscar ventas pendientes (no pagadas completamente)
    const ventasPendientes = await Venta.find({ 
      colaboradorId,
      userId,
      estadoPago: { $in: ['Pendiente', 'Parcial'] }
    })
      .populate('colaboradorId', 'nombre')
      .populate({
        path: 'detalles',
        populate: { path: 'productoId', select: 'nombre precio' }
      })
      .lean();

    // Para cada venta, poblar pagos y devoluciones
    for (const venta of ventasPendientes) {
      // Buscar cobros asociados a esta venta (corregido: usando el array ventasId)
      venta.pagos = await Cobro.find({ 
        userId,
        ventasId: { $in: [venta._id] }
      }).lean();
      
      // Buscar devoluciones asociadas a esta venta
      venta.devoluciones = await Devolucion.find({ 
        ventaId: venta._id,
        userId 
      }).lean();

      // Calcular totales
      const totalPagado = venta.pagos.reduce((sum, pago) => sum + (pago.montoPagado || 0), 0);
      const totalDevuelto = venta.devoluciones.reduce((sum, dev) => sum + (dev.montoDevolucion || 0), 0);
      
      venta.totalPagado = totalPagado;
      venta.totalDevuelto = totalDevuelto;
      venta.deudaRestante = (venta.montoTotal || 0) - totalPagado - totalDevuelto;
    }
    
    res.json(ventasPendientes);
  } catch (error) {
    console.error('Error al obtener ventas pendientes:', error);
    res.status(500).json({ message: 'Error al obtener ventas pendientes', error: error.message });
  }
});

// Nueva ruta: Obtener colaboradores con sus deudas pendientes (más eficiente)
router.get('/colaboradores-con-deudas', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    // Obtener todas las ventas pendientes agrupadas por colaborador
    const ventasPendientes = await Venta.aggregate([
      {
        $match: {
          userId: userId,
          estadoPago: { $in: ['Pendiente', 'Parcial'] }
        }
      },
      {
        $group: {
          _id: '$colaboradorId',
          ventas: {
            $push: {
              ventaId: '$_id',
              montoTotal: '$montoTotal',
              cantidadPagada: '$cantidadPagada',
              cantidadDevuelta: '$cantidadDevuelta'
            }
          },
          totalDeuda: {
            $sum: {
              $subtract: [
                '$montoTotal',
                { $add: ['$cantidadPagada', '$cantidadDevuelta'] }
              ]
            }
          }
        }
      },
      {
        $match: {
          totalDeuda: { $gt: 0 }
        }
      }
    ]);

    // Poblar la información del colaborador
    const colaboradoresConDeuda = await Promise.all(
      ventasPendientes.map(async (item) => {
        const colaborador = await Colaborador.findById(item._id).lean();
        return {
          ...colaborador,
          deudaPendiente: item.totalDeuda,
          cantidadVentasPendientes: item.ventas.length
        };
      })
    );

    res.json(colaboradoresConDeuda);
  } catch (error) {
    console.error('Error al obtener colaboradores con deudas:', error);
    res.status(500).json({ message: 'Error al obtener colaboradores con deudas', error: error.message });
  }
});

// Nueva ruta para obtener ventas individuales con deuda pendiente
router.get('/ventas-pendientes-individuales', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    // Obtener todas las ventas del usuario con detalles y colaborador
    const ventas = await Venta.find({ userId })
      .populate('colaboradorId', 'nombre')
      .populate({
        path: 'detalles',
        populate: {
          path: 'productoId',
          select: 'nombre precio'
        }
      })
      .sort({ fechaVenta: -1 });    
    console.log(`📊 Ventas encontradas: ${ventas.length}`);
    
    // Procesar cada venta para obtener información completa
    const ventasPendientes = await Promise.all(
      ventas.map(async (venta) => {
        const deuda = venta.montoTotal || 0; // Usar montoTotal como deuda base
        const montoPagado = venta.cantidadPagada || 0;
        
        // Solo incluir ventas con deuda pendiente
        if (deuda <= montoPagado) {
          return null;
        }
        
        // Debug: verificar los detalles de la venta
        console.log(`🔍 Venta ${venta._id}:`, {
          detallesCount: venta.detalles ? venta.detalles.length : 0,
          detalles: venta.detalles
        });
        
        // Obtener cobros asociados a esta venta específica
        const cobrosVenta = await Cobro.find({ 
          ventaId: venta._id,
          userId: userId 
        });
        
        // Obtener devoluciones asociadas a esta venta
        const devolucionesVenta = await Devolucion.find({
          ventaId: venta._id,
          userId: userId
        });
          // Calcular totales
        const sumaPagos = cobrosVenta.reduce((sum, cobro) => sum + (cobro.montoPagado || 0), 0);
        const sumaDevoluciones = devolucionesVenta.reduce((sum, dev) => sum + (dev.monto || 0), 0);
        const deudaPendiente = deuda - sumaPagos;
        
        // Procesar detalles para asegurar que tengan la información correcta
        const detallesProcesados = (venta.detalles || []).map(detalle => {
          if (!detalle) return null;
          
          return {
            _id: detalle._id,
            cantidad: detalle.cantidad || 0,
            precioUnitario: detalle.precioUnitario || 0,
            subtotal: detalle.subtotal || 0,
            productoId: detalle.productoId ? {
              _id: detalle.productoId._id,
              nombre: detalle.productoId.nombre || 'Producto sin nombre',
              precio: detalle.productoId.precio || 0
            } : {
              nombre: 'Producto no encontrado',
              precio: 0
            }
          };
        }).filter(detalle => detalle !== null);
        
        console.log(`🛍️ Detalles procesados para venta ${venta._id}:`, detallesProcesados);
          return {
          _id: venta._id,
          ventaId: venta.ventaId || venta._id.toString().slice(-6),
          colaboradorId: venta.colaboradorId._id,
          colaboradorNombre: venta.colaboradorId.nombre,
          fechaVenta: venta.fechaVenta,
          montoTotal: venta.montoTotal || 0,
          deudaTotal: deuda,
          montoPagado: montoPagado,
          sumaPagos: sumaPagos,
          sumaDevoluciones: sumaDevoluciones,
          deudaPendiente: Math.max(0, deudaPendiente), // Asegurar que no sea negativo
          detalles: detallesProcesados, // Usar detalles procesados
          // Información adicional para el frontend
          displayText: `Venta #${venta.ventaId || venta._id.toString().slice(-6)} - ${venta.colaboradorId.nombre} - S/ ${Math.max(0, deudaPendiente).toFixed(2)}`,
          fechaFormateada: venta.fechaVenta 
            ? new Date(venta.fechaVenta).toLocaleDateString('es-PE')
            : 'Sin fecha'
        };
      })
    );
    
    // Filtrar ventas nulas y con deuda pendiente > 0
    const ventasConDeuda = ventasPendientes
      .filter(venta => venta !== null && venta.deudaPendiente > 0);
    
    res.json(ventasConDeuda);
  } catch (error) {
    console.error('Error al obtener ventas pendientes individuales:', error);
    res.status(500).json({ 
      message: 'Error al obtener ventas pendientes',
      error: error.message 
    });
  }
});

// Endpoint de prueba para verificar ventas mejorado
router.get('/test-ventas-deudas', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    console.log('🔍 Iniciando prueba de ventas con deudas...');
    
    // Obtener ventas con populate
    const ventas = await Venta.find({ userId })
      .populate('colaboradorId', 'nombre')
      .populate('detalles.productoId', 'nombre precio')
      .limit(5); // Solo las primeras 5 para prueba
    
    console.log(`📊 Total ventas encontradas: ${ventas.length}`);
    
    const ventasInfo = await Promise.all(
      ventas.map(async (venta) => {
        // Obtener cobros de esta venta
        const cobros = await Cobro.find({ ventaId: venta._id, userId });
        const devoluciones = await Devolucion.find({ ventaId: venta._id, userId });
        
        const sumaPagos = cobros.reduce((sum, c) => sum + (c.montoPagado || 0), 0);
        const sumaDevoluciones = devoluciones.reduce((sum, d) => sum + (d.monto || 0), 0);        console.log(`🔍 DEBUG Cálculo de deuda para venta ${venta._id}:`, {
          montoTotal: venta.montoTotal,
          sumaPagos: sumaPagos,
          sumaDevoluciones: sumaDevoluciones,
          deudaPendienteCalculada: venta.montoTotal - sumaPagos - sumaDevoluciones
        });
        
        return {
          _id: venta._id,
          colaborador: venta.colaboradorId?.nombre || 'Sin colaborador',
          fechaVenta: venta.fechaVenta,
          montoTotal: venta.montoTotal,
          debe: venta.montoTotal, // Total Debe = Total Venta (siempre)
          cantidadPagada: venta.cantidadPagada,
          sumaPagos: sumaPagos,
          sumaDevoluciones: sumaDevoluciones,
          deudaPendiente: venta.montoTotal - sumaPagos - sumaDevoluciones, // Restar devoluciones de la deuda
          detallesCount: venta.detalles?.length || 0,
          detalles: venta.detalles?.map(d => ({
            producto: d.productoId?.nombre || 'Sin nombre',
            cantidad: d.cantidad,
            precio: d.productoId?.precio
          })) || []
        };
      })
    );
    
    res.json({
      total: ventas.length,
      mensaje: 'Prueba de ventas con información completa',
      ventas: ventasInfo    });
  } catch (error) {
    console.error('❌ Error en prueba de ventas:', error);
    res.status(500).json({ 
      message: 'Error en prueba',
      error: error.message 
    });
  }
});

// Endpoint para crear venta de prueba (solo para desarrollo)
router.post('/crear-venta-prueba', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    // Verificar si ya existe un colaborador de prueba
    let colaboradorPrueba = await Colaborador.findOne({ userId, nombre: 'Colaborador Prueba' });
    
    if (!colaboradorPrueba) {
      // Crear colaborador de prueba
      colaboradorPrueba = new Colaborador({
        userId,
        nombre: 'Colaborador Prueba',
        telefono: '999999999',
        direccion: 'Dirección de prueba'
      });
      await colaboradorPrueba.save();
      console.log('Colaborador de prueba creado:', colaboradorPrueba._id);
    }
    
    // Crear venta de prueba con deuda pendiente
    const ventaPrueba = new Venta({
      userId,
      colaboradorId: colaboradorPrueba._id,
      montoTotal: 100,
      subtotal: 85,
      impuesto: 15,
      estadoPago: 'Pendiente',
      cantidadPagada: 0, // Sin pagar para que tenga deuda
      debe: 100, // Deuda completa
      fechaVenta: new Date()
    });
    
    await ventaPrueba.save();
    
    res.json({
      message: 'Venta de prueba creada exitosamente',
      venta: ventaPrueba,
      colaborador: colaboradorPrueba
    });
    
  } catch (error) {
    console.error('Error creando venta de prueba:', error);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
