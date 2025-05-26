const express = require('express');
const router = express.Router();
const { obtenerFechaActual, convertirFechaAFechaLocal, convertirFechaALocalUtc } = require('../utils/fechaHoraUtils');

const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Colaborador = require('../models/Colaborador');
const { authenticate } = require('../middleware/authenticate');
const Devolucion = require('../models/Devolucion'); // Importar el modelo

// Ruta de prueba para verificar que el router funciona
router.get('/test', (req, res) => {
  res.json({ message: 'La ruta de prueba está funcionando' });
});

// ===== RUTAS ESPECÍFICAS =====

// Ruta para obtener todos los colaboradores
router.get('/colaboradores', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    const colaboradores = await Colaborador.find({ userId });
    console.log(`Colaboradores encontrados para el usuario ${userId}:`, colaboradores);
    res.json(colaboradores);
  } catch (error) {
    console.error('Error al obtener colaboradores:', error);
    res.status(500).json({ message: 'Error al obtener colaboradores' });
  }
});

// Ruta para obtener todos los productos
router.get('/productos', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    const productos = await Producto.find({ userId });
    console.log(`Productos encontrados para el usuario ${userId}:`, productos);
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error al obtener productos' });
  }
});

// ===== FUNCIONES DE SERVICIO =====

// Función para obtener ventas con datos del colaborador y producto
async function getVentasService(userId) {
  return await Venta.find({ userId })
    .populate('colaboradorId', 'nombre')
    .populate('productoId', 'nombre precio');
}

// Función para crear venta
async function createVentaService(ventaData) {
  const nuevaVenta = new Venta(ventaData);
  await nuevaVenta.save();

  // Actualizar stock de producto
  const producto = await Producto.findById(ventaData.productoId);
  if (producto) {
    producto.cantidadVendida += ventaData.cantidad;
    producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
    await producto.save();
  }

  return await Venta.findById(nuevaVenta._id)
    .populate('colaboradorId', 'nombre')
    .populate('productoId', 'nombre precio');
}


// Función para eliminar venta
async function deleteVentaService(id, userId) {
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return false;

  const producto = await Producto.findById(venta.productoId);
  if (producto) {
    producto.cantidadVendida -= venta.cantidad;
    producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
    await producto.save();
  }

  await Venta.findByIdAndDelete(id);
  return true;
}

// ===== RUTAS CRUD PRINCIPALES =====

// Ruta para obtener todas las ventas
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;

  try {
    // Obtener todas las ventas del usuario sin paginación
    const ventas = await Venta.find({ userId })
      .sort({ fechadeVenta: -1 })  // Ordenar por fecha descendente
      .populate('productoId')       // Información del producto
      .populate('colaboradorId');   // Información del colaborador

    // 🔍 LOG PARA VERIFICAR
    console.log('Ventas desde DB:', ventas.map(v => ({
      id: v._id,
      fechadeVenta: v.fechadeVenta,
      fechaISO: v.fechadeVenta.toISOString()
    })));


    // Contar total de ventas (opcional, pero útil para saber cuántas hay)
    const totalVentas = ventas.length;

    // Responder con todas las ventas
    res.json({
      ventas,
      totalVentas,
      totalPages: 1,  // Al no haber paginación, solo hay 1 página
      currentPage: 1
    });
  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({ message: 'Error al obtener ventas' });
  }
});


// Ruta para crear una nueva venta
router.post('/', authenticate, async (req, res) => {
  const { colaboradorId, productoId, cantidad, montoTotal, estadoPago, cantidadPagada,fechadeVenta } = req.body;
  const userId = req.user.id;

  try {
    // Validar existencia de colaborador
    const colaborador = await Colaborador.findById(colaboradorId);
    if (!colaborador) {
      return res.status(400).json({ message: 'Colaborador no encontrado' });
    }
    
    // Validar producto
    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(400).json({ message: 'Producto no encontrado' });
    }

    // Verificar stock disponible
    if (cantidad > producto.cantidadRestante) {
      return res.status(400).json({ message: `No hay suficiente stock. Solo hay ${producto.cantidadRestante} unidades disponibles.` });
    }

    // Validar estado de pago
    if (estadoPago === 'Parcial' && cantidadPagada <= 0) {
      return res.status(400).json({ message: 'La cantidad pagada debe ser mayor a cero cuando el estado es Parcial.' });
    }

    if (estadoPago === 'Pendiente' && cantidadPagada !== 0) {
      return res.status(400).json({ message: 'La cantidad pagada debe ser cero cuando el estado es Pendiente.' });
    }

    if (estadoPago === 'Pagado' && cantidadPagada !== montoTotal) {
      return res.status(400).json({ message: 'La cantidad pagada debe ser igual al monto total cuando el estado es Pagado.' });
    }

    const fechaVenta = fechadeVenta ? convertirFechaALocalUtc(fechadeVenta) : convertirFechaALocalUtc(obtenerFechaActual());


    // Crear la venta
    const ventaData = {
      colaboradorId,
      productoId,
      cantidad,
      montoTotal,
      estadoPago,
      cantidadPagada,
      userId,
      fechadeVenta: fechaVenta
    };

  if (fechadeVenta) {
    ventaData.fechadeVenta = new Date(fechadeVenta);  // convertir string a fecha
  }

    const nuevaVenta = await createVentaService(ventaData);
    res.status(201).json(nuevaVenta);
  } catch (error) {
    console.error('Error al agregar la venta:', error.message);
    res.status(500).json({ message: `Error al agregar la venta: ${error.message}` });
  }
});


// Ruta para eliminar una venta
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const resultado = await deleteVentaService(id, userId);
    
    if (!resultado) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error al eliminar la venta:', error);
        if (error.message.includes('devoluciones asociadas')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al eliminar la venta.' });
  }
});

// Ruta para obtener todas las devoluciones
router.get('/devoluciones', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10 } = req.query;
  
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const devoluciones = await Devolucion.find({ userId })
      .populate({
        path: 'ventaId',
        populate: { 
          path: 'colaboradorId',
          model: 'Colaborador',
          select: 'nombre'
        }
      })
      .populate('productoId', 'nombre precio')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Devolucion.countDocuments({ userId });
    
    console.log('Devoluciones encontradas:', devoluciones); // Para debugging

    res.json({
      devoluciones,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error al obtener devoluciones:', error);
    res.status(500).json({ 
      message: 'Error al obtener devoluciones',
      error: error.message 
    });
  }
});

router.post('/devoluciones', authenticate, async (req, res) => {
  const { ventaId, productoId, cantidadDevuelta, montoDevolucion, motivo } = req.body;
  const userId = req.user.id;

  try {
    // Validar que exista la venta y el producto
    const venta = await Venta.findOne({ _id: ventaId, userId });
    const producto = await Producto.findById(productoId);

    if (!venta || !producto) {
      return res.status(404).json({ 
        message: !venta ? 'Venta no encontrada' : 'Producto no encontrado' 
      });
    }

    // Validar que la cantidad a devolver no sea mayor que la cantidad vendida
    const cantidadDevueltaPrevia = venta.cantidadDevuelta || 0;
    if (cantidadDevuelta > (venta.cantidad - cantidadDevueltaPrevia)) {
      return res.status(400).json({ 
        message: 'La cantidad a devolver no puede ser mayor que la cantidad vendida disponible' 
      });
    }

    const devolucion = new Devolucion({
      userId,
      ventaId,
      productoId,
      cantidadDevuelta,
      montoDevolucion,
      motivo
    });

    await devolucion.save();
    
    // Actualizar el stock del producto
    await Producto.findByIdAndUpdate(productoId, {
      $inc: { 
        cantidadVendida: -cantidadDevuelta,
        cantidadRestante: cantidadDevuelta
      }
    });

    // Calcular el nuevo montoTotal y actualizar la cantidad de la venta
    const montoAReducir = producto.precio * cantidadDevuelta;

    // Actualizar la venta con todos los cambios necesarios
    await Venta.findByIdAndUpdate(ventaId, {
      $inc: { 
        cantidadDevuelta: cantidadDevuelta,
        montoTotal: -montoAReducir,
        cantidad: -cantidadDevuelta  // Reducir la cantidad original de la venta
      }
    });

    const devolucionPopulada = await Devolucion.findById(devolucion._id)
      .populate('productoId', 'nombre precio')
      .populate('ventaId');

    res.status(201).json(devolucionPopulada);
  } catch (error) {
    console.error('Error al crear devolución:', error);
    res.status(500).json({ message: 'Error al crear devolución', error: error.message });
  }
});

// Agregar después de la ruta POST de devoluciones
router.delete('/devoluciones/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Buscar la devolución
    const devolucion = await Devolucion.findOne({ _id: id, userId });
    if (!devolucion) {
      return res.status(404).json({ message: 'Devolución no encontrada' });
    }

    // Obtener el producto para calcular el monto a restaurar
    const producto = await Producto.findById(devolucion.productoId);
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Calcular el monto a restaurar
    const montoARestaurar = producto.precio * devolucion.cantidadDevuelta;

    // Revertir los cambios en el stock del producto
    await Producto.findByIdAndUpdate(devolucion.productoId, {
      $inc: { 
        cantidadVendida: devolucion.cantidadDevuelta,
        cantidadRestante: -devolucion.cantidadDevuelta
      }
    });

    // Actualizar la venta
    await Venta.findByIdAndUpdate(devolucion.ventaId, {
      $inc: { 
        cantidadDevuelta: -devolucion.cantidadDevuelta,
        montoTotal: montoARestaurar
      }
    });

    // Eliminar la devolución
    await Devolucion.findByIdAndDelete(id);

    res.json({ message: 'Devolución eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar la devolución:', error);
    res.status(500).json({ message: 'Error al eliminar la devolución' });
  }
});


// Ruta para obtener ventas filtradas por rango de fechas
router.get('/ventas-filtradas', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { startDate, endDate, rango } = req.query; // Aceptar ambos tipos de parámetros
  
  try {
    let queryStartDate, queryEndDate;
    
    // Si se proporcionan startDate y endDate directamente, usarlos
    if (startDate && endDate) {
      queryStartDate = new Date(startDate);
      queryEndDate = new Date(endDate);
    } 
    // Si no, calcular fechas basadas en el rango
    else if (rango) {
      const now = new Date();
      queryStartDate = new Date();
      queryEndDate = new Date();
      
      // Configurar las fechas según el rango
      switch (rango) {
        case 'day':
          queryStartDate.setHours(0, 0, 0, 0);
          queryEndDate.setHours(23, 59, 59, 999);
          break;
        case 'week':
          queryStartDate.setDate(now.getDate() - now.getDay());  // Inicio de la semana
          queryStartDate.setHours(0, 0, 0, 0);
          queryEndDate.setDate(queryStartDate.getDate() + 6);  // Fin de la semana
          queryEndDate.setHours(23, 59, 59, 999);
          break;
        case 'month':
          queryStartDate.setDate(1);  // Primer día del mes
          queryStartDate.setHours(0, 0, 0, 0);
          queryEndDate.setMonth(now.getMonth() + 1, 0);  // Último día del mes
          queryEndDate.setHours(23, 59, 59, 999);
          break;
        case 'year':
          queryStartDate.setMonth(0, 1);  // Primer día del año
          queryStartDate.setHours(0, 0, 0, 0);
          queryEndDate.setMonth(11, 31);  // Último día del año
          queryEndDate.setHours(23, 59, 59, 999);
          break;
        case 'historical':
          queryStartDate = null;
          queryEndDate = null;
          break;
        default:
          queryStartDate.setDate(1);
          queryStartDate.setHours(0, 0, 0, 0);
          queryEndDate.setMonth(now.getMonth() + 1, 0);
          queryEndDate.setHours(23, 59, 59, 999);
          break;
      }
    } else {
      // Valores predeterminados (mes actual)
      const now = new Date();
      queryStartDate = new Date();
      queryEndDate = new Date();
      queryStartDate.setDate(1);
      queryStartDate.setHours(0, 0, 0, 0);
      queryEndDate.setMonth(now.getMonth() + 1, 0);
      queryEndDate.setHours(23, 59, 59, 999);
    }
    
    // Construir la consulta de filtrado
    let query = { userId };
    
    // Añadir filtro de fechas si no es histórico
    if (queryStartDate !== null && queryEndDate !== null) {
      // Cambiar de `fechaCobro` a `fechaVenta`
      query.fechaVenta = { 
        $gte: queryStartDate, 
        $lte: queryEndDate 
      };
    }

    // Filtrar las ventas
    const ventas = await Venta.find(query)
      .populate('colaboradorId', 'nombre')
      .populate('productoId', 'nombre precio');
    
    res.json({ ventas });
  } catch (error) {
    console.error('Error al obtener ventas filtradas:', error);
    res.status(500).json({ message: 'Error al obtener ventas filtradas', error: error.message });
  }
});

// ===== FUNCIONES PARA REPORTES =====

// Ruta para obtener resumen de ventas por colaborador
router.get('/reportes/resumen', authenticate, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const ventas = await Venta.find({ userId })
      .populate('colaboradorId', 'nombre') // Poblar colaborador con su nombre
      .populate('productoId', 'nombre precio'); // Poblar producto con nombre y precio

    const resumen = ventas.reduce((acc, venta) => {
      const nombre = venta.colaboradorId?.nombre || 'Sin colaborador';
      acc[nombre] = (acc[nombre] || 0) + venta.montoTotal;
      return acc;
    }, {});

    res.json({ resumen });
  } catch (error) {
    console.error('Error al obtener el resumen de ventas:', error);
    res.status(500).json({ message: 'Error al obtener el resumen de ventas.' });
  }
});

// Ruta para obtener informe de ventas por colaborador
router.get('/reportes/ventas', authenticate, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const ventas = await Venta.find({ userId })
      .populate('colaboradorId', 'nombre') // Poblar colaborador con su nombre
      .populate('productoId', 'nombre precio'); // Poblar producto con nombre y precio

    const ventasPorColaborador = ventas.reduce((acc, venta) => {
      if (!venta.colaboradorId || !venta.colaboradorId._id) return acc;
      
      const colaboradorId = venta.colaboradorId._id.toString();
      
      if (!acc[colaboradorId]) {
        acc[colaboradorId] = {
          nombre: venta.colaboradorId.nombre,
          totalVentas: 0,
          estadoPago: {
            pendiente: 0,
            pagado: 0,
            parcial: 0
          }
        };
      }
      
      acc[colaboradorId].totalVentas += venta.montoTotal;
      acc[colaboradorId].estadoPago[venta.estadoPago.toLowerCase()] += venta.montoTotal;

      return acc;
    }, {});

    res.json(ventasPorColaborador);
  } catch (error) {
    console.error('Error al obtener el informe de ventas:', error);
    res.status(500).json({ message: 'Error al obtener el informe de ventas', error: error.message });
  }
});

module.exports = router;