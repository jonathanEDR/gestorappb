const express = require('express');
const router = express.Router();
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

// Función para actualizar venta
async function updateVentaService(id, datos, userId) {
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return null;

  const producto = await Producto.findById(venta.productoId);
  if (!producto) throw new Error('Producto relacionado no encontrado');

  // Actualizar campos de la venta
  if (datos.cantidad && datos.cantidad !== venta.cantidad) {
    const nuevaCantidadVendida = producto.cantidadVendida - venta.cantidad + datos.cantidad;
    producto.cantidadVendida = nuevaCantidadVendida;
    producto.cantidadRestante = producto.cantidad - nuevaCantidadVendida;
    await producto.save();

    venta.cantidad = datos.cantidad;
    venta.montoTotal = producto.precio * datos.cantidad;
  }

  if (datos.estadoPago) venta.estadoPago = datos.estadoPago;
  if (datos.cantidadPagada !== undefined) venta.cantidadPagada = datos.cantidadPagada;

  await venta.save();
  return await Venta.findById(id)
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
  const { colaboradorId, productoId, cantidad, montoTotal, estadoPago, cantidadPagada } = req.body;
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

    // Crear la venta
    const ventaData = {
      colaboradorId,
      productoId,
      cantidad,
      montoTotal,
      estadoPago,
      cantidadPagada,
      userId
    };

    const nuevaVenta = await createVentaService(ventaData);
    res.status(201).json(nuevaVenta);
  } catch (error) {
    console.error('Error al agregar la venta:', error.message);
    res.status(500).json({ message: `Error al agregar la venta: ${error.message}` });
  }
});

// Ruta para actualizar una venta
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { cantidad, estadoPago, cantidadPagada } = req.body;
  const userId = req.user.id;

  try {
    const ventaActualizada = await updateVentaService(id, {
      cantidad, 
      estadoPago, 
      cantidadPagada 
    }, userId);
    
    if (!ventaActualizada) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }
    
    res.json(ventaActualizada);
  } catch (error) {
    console.error('Error al actualizar la venta:', error);
        if (error.message.includes('devoluciones asociadas')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al actualizar la venta.' });
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

// Ruta para crear una devolución
router.post('/devoluciones', authenticate, async (req, res) => {
  const { ventaId, productoId, cantidadDevuelta, montoDevolucion, motivo } = req.body;
  const userId = req.user.id;

  try {
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

    // Actualizar la venta
    await Venta.findByIdAndUpdate(ventaId, {
      $inc: { cantidadDevuelta: cantidadDevuelta }
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

    // Revertir los cambios en el stock del producto
    await Producto.findByIdAndUpdate(devolucion.productoId, {
      $inc: { 
        cantidadVendida: devolucion.cantidadDevuelta,
        cantidadRestante: -devolucion.cantidadDevuelta
      }
    });

    // Actualizar la venta
    await Venta.findByIdAndUpdate(devolucion.ventaId, {
      $inc: { cantidadDevuelta: -devolucion.cantidadDevuelta }
    });

    // Eliminar la devolución
    await Devolucion.findByIdAndDelete(id);

    res.json({ message: 'Devolución eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar la devolución:', error);
    res.status(500).json({ message: 'Error al eliminar la devolución' });
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