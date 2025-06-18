const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { obtenerFechaActual, convertirFechaAFechaLocal, convertirFechaALocalUtc } = require('../utils/fechaHoraUtils');

const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Colaborador = require('../models/Colaborador');
const DetalleVenta = require('../models/DetalleVenta');
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
async function getVentasService(userId) {  return await Venta.find({ userId })
    .populate('colaboradorId')
    .populate({
      path: 'detalles',
      populate: {
        path: 'productoId',
        select: 'nombre precio cantidadRestante'
      }
    })
    .sort({ fechaVenta: -1 })
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
  try {
    console.log(`Iniciando eliminación de venta ${id} para usuario ${userId}`);
    
    // 1. Buscar la venta con sus detalles poblados
    const venta = await Venta.findOne({ _id: id, userId })
      .populate('detalles');
    
    if (!venta) {
      console.log(`Venta ${id} no encontrada para el usuario ${userId}`);
      return { success: false, message: 'Venta no encontrada' };
    }

    console.log(`Venta encontrada:`, venta);

    // 2. Verificar si hay devoluciones asociadas a esta venta
    const devolucionesAsociadas = await Devolucion.find({ ventaId: id });
    if (devolucionesAsociadas.length > 0) {
      console.log(`Se encontraron ${devolucionesAsociadas.length} devoluciones asociadas a la venta ${id}`);
      return { 
        success: false, 
        message: `No se puede eliminar la venta porque tiene ${devolucionesAsociadas.length} devoluciones asociadas. Elimine primero las devoluciones.` 
      };
    }

    // 3. Revertir el stock de todos los productos en los detalles
    if (venta.detalles && venta.detalles.length > 0) {
      console.log(`Revirtiendo stock para ${venta.detalles.length} productos`);
      
      for (const detalle of venta.detalles) {
        const detalleCompleto = await DetalleVenta.findById(detalle._id || detalle);
        if (detalleCompleto) {
          const producto = await Producto.findById(detalleCompleto.productoId);
          if (producto) {
            console.log(`Actualizando stock del producto ${producto.nombre}: +${detalleCompleto.cantidad}`);
            
            producto.cantidadVendida -= detalleCompleto.cantidad;
            producto.cantidadRestante += detalleCompleto.cantidad;
            
            // Asegurar que los valores no sean negativos
            if (producto.cantidadVendida < 0) producto.cantidadVendida = 0;
            if (producto.cantidadRestante > producto.cantidad) producto.cantidadRestante = producto.cantidad;
            
            await producto.save();
            console.log(`Stock actualizado para ${producto.nombre}: vendida=${producto.cantidadVendida}, restante=${producto.cantidadRestante}`);
          }
        }
      }

      // 4. Eliminar todos los detalles de venta
      await DetalleVenta.deleteMany({ ventaId: id });
      console.log(`Detalles de venta eliminados para la venta ${id}`);
    }

    // 5. Eliminar la venta principal
    await Venta.findByIdAndDelete(id);
    console.log(`Venta ${id} eliminada exitosamente`);

    return { success: true, message: 'Venta eliminada correctamente' };
  } catch (error) {
    console.error('Error en deleteVentaService:', error);
    return { success: false, message: `Error al eliminar la venta: ${error.message}` };
  }
}

// ===== RUTAS CRUD PRINCIPALES =====

// Ruta para obtener todas las ventas
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Obteniendo ventas para usuario:', userId);
    
    const ventas = await getVentasService(userId);
    console.log(`Se encontraron ${ventas.length} ventas`);
    
    res.json(ventas);
  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({ 
      message: 'Error al obtener las ventas',
      error: error.message 
    });
  }
});


// Ruta para crear una nueva venta
router.post('/', authenticate, async (req, res) => {
  try {    const { 
      colaboradorId, 
      detalles,
      total,
      estadoPago, 
      cantidadPagada,
      fechaVenta 
    } = req.body;
    
    const userId = req.user.id;
    console.log('Datos recibidos:', { colaboradorId, detalles, total, estadoPago, cantidadPagada, fechaVenta });

    // Validar datos requeridos
    if (!colaboradorId || !detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({ 
        message: 'Datos incompletos. Se requiere colaboradorId y al menos un detalle de venta' 
      });
    }

    // Validar existencia del colaborador
    const colaborador = await Colaborador.findById(colaboradorId);
    if (!colaborador) {
      return res.status(400).json({ message: 'Colaborador no encontrado' });
    }

    // Validar productos y stock antes de hacer cualquier cambio
    for (const detalle of detalles) {
      const producto = await Producto.findById(detalle.productoId);
      if (!producto) {
        return res.status(400).json({ 
          message: `Producto no encontrado: ${detalle.productoId}` 
        });
      }
      if (producto.cantidadRestante < detalle.cantidad) {
        return res.status(400).json({ 
          message: `Stock insuficiente para el producto ${producto.nombre}` 
        });
      }
    }

    try {
      // 1. Crear la venta principal
      const nuevaVenta = new Venta({        userId,
        colaboradorId,
        subtotal: total, // Usar el total como subtotal ya que no hay IGV
        montoTotal: total,
        estadoPago: estadoPago || 'Pendiente',
        cantidadPagada: cantidadPagada || 0,
        fechaVenta: fechaVenta ? convertirFechaALocalUtc(fechaVenta) : obtenerFechaActual(),
        detalles: [] // Se llenarán después
      });

      // 2. Guardar la venta
      const ventaGuardada = await nuevaVenta.save();
      console.log('Venta principal guardada:', ventaGuardada);

      // 3. Procesar cada detalle
      const detallesGuardados = [];
      for (const detalle of detalles) {
        // Crear y guardar el detalle
        const nuevoDetalle = new DetalleVenta({
          ventaId: ventaGuardada._id,
          productoId: detalle.productoId,
          cantidad: detalle.cantidad,
          precioUnitario: detalle.precioUnitario,
          subtotal: detalle.subtotal
        });

        const detalleGuardado = await nuevoDetalle.save();
        detallesGuardados.push(detalleGuardado);

        // Actualizar stock del producto
        await Producto.findByIdAndUpdate(
          detalle.productoId,
          {
            $inc: {
              cantidadVendida: detalle.cantidad,
              cantidadRestante: -detalle.cantidad
            }
          }
        );
      }

      // 4. Actualizar la venta con los detalles
      ventaGuardada.detalles = detallesGuardados.map(d => d._id);
      await ventaGuardada.save();

      // 5. Obtener la venta completa con sus relaciones
      const ventaCompleta = await Venta.findById(ventaGuardada._id)
        .populate('colaboradorId')
        .populate({
          path: 'detalles',
          populate: {
            path: 'productoId'
          }
        });

      res.status(201).json(ventaCompleta);

    } catch (error) {
      console.error('Error durante el proceso de venta:', error);
      throw new Error('Error al procesar la venta: ' + error.message);
    }

  } catch (error) {
    console.error('Error al crear venta:', error);
    res.status(500).json({ 
      message: 'Error al crear la venta',
      error: error.message 
    });
  }
});


// Ruta para eliminar una venta
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    console.log(`Solicitud de eliminación de venta: ${id} por usuario: ${userId}`);
    
    // Validar que el ID sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de venta no válido' });
    }
    
    const resultado = await deleteVentaService(id, userId);
    
    if (!resultado.success) {
      if (resultado.message.includes('no encontrada')) {
        return res.status(404).json({ message: resultado.message });
      } else if (resultado.message.includes('devoluciones asociadas')) {
        return res.status(400).json({ message: resultado.message });
      } else {
        return res.status(500).json({ message: resultado.message });
      }
    }
    
    console.log(`Venta ${id} eliminada exitosamente`);
    res.status(200).json({ message: resultado.message });
  } catch (error) {
    console.error('Error al eliminar la venta:', error);
    res.status(500).json({ 
      message: 'Error interno del servidor al eliminar la venta',
      error: error.message 
    });
  }
});

// Ruta para obtener todas las devoluciones
router.get('/devoluciones', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10 } = req.query;
  
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
      const devoluciones = await Devolucion.find({ userId })      .populate({
        path: 'ventaId',
        select: 'fechaVenta montoTotal estadoPago', // Solo incluir fechaVenta
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
    
    // Debug adicional - verificar estructura de ventas
    devoluciones.forEach((dev, index) => {
      console.log(`🔍 Devolución ${index + 1}:`, {        id: dev._id,
        ventaId: dev.ventaId?._id,
        fechaVenta: dev.ventaId?.fechaVenta,
        colaborador: dev.ventaId?.colaboradorId?.nombre,
        producto: dev.productoId?.nombre
      });
    });

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
  const { ventaId, fechaDevolucion, items } = req.body;
  const userId = req.user.id;

  try {
    console.log('Datos de devolución recibidos:', { ventaId, fechaDevolucion, items });

    // Validar que exista la venta
    const venta = await Venta.findOne({ _id: ventaId, userId })
      .populate('detalles');

    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    console.log('Venta encontrada:', venta);

    // Validar que se proporcionaron items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Se requiere al menos un producto para devolver' });
    }

    // Procesar fecha de devolución
    const fechaFinal = fechaDevolucion ? 
      convertirFechaALocalUtc(fechaDevolucion) : 
      obtenerFechaActual();

    // Array para almacenar las devoluciones creadas
    const devolucionesCreadas = [];

    // Procesar cada item de devolución
    for (const item of items) {
      const { productoId, cantidadDevuelta, montoDevolucion, motivo } = item;

      console.log('Procesando item:', item);

      // Validar que el producto existe
      const producto = await Producto.findById(productoId);
      if (!producto) {
        throw new Error(`Producto con ID ${productoId} no encontrado`);
      }

      // Buscar el detalle de venta correspondiente
      const detalleVenta = venta.detalles.find(d => 
        d.productoId.toString() === productoId.toString()
      );

      if (!detalleVenta) {
        throw new Error(`El producto ${producto.nombre} no está en esta venta`);
      }

      // Calcular cantidad ya devuelta para este producto en esta venta
      const devolucionesExistentes = await Devolucion.find({ 
        ventaId: ventaId, 
        productoId: productoId 
      });
      
      const cantidadYaDevuelta = devolucionesExistentes.reduce(
        (total, dev) => total + dev.cantidadDevuelta, 0
      );

      const cantidadDisponible = detalleVenta.cantidad - cantidadYaDevuelta;

      // Validar cantidad a devolver
      if (cantidadDevuelta > cantidadDisponible) {
        throw new Error(
          `No se puede devolver ${cantidadDevuelta} unidades de ${producto.nombre}. ` +
          `Cantidad disponible: ${cantidadDisponible}`
        );
      }

      // Crear la devolución
      const devolucion = new Devolucion({
        userId,
        ventaId,
        productoId,
        cantidadDevuelta,
        montoDevolucion,
        motivo,
        fechaDevolucion: fechaFinal
      });

      await devolucion.save();
      devolucionesCreadas.push(devolucion);

      // Actualizar el stock del producto
      await Producto.findByIdAndUpdate(productoId, {
        $inc: { 
          cantidadVendida: -cantidadDevuelta,
          cantidadRestante: cantidadDevuelta
        }
      });

      // Actualizar la venta - reducir el monto total
      await Venta.findByIdAndUpdate(ventaId, {
        $inc: { 
          cantidadDevuelta: cantidadDevuelta,
          montoTotal: -montoDevolucion
        }
      });

      console.log(`Devolución creada para ${producto.nombre}: ${cantidadDevuelta} unidades`);
    }

    // Poblar las devoluciones creadas con los datos necesarios
    const devolucionesRespuesta = await Promise.all(
      devolucionesCreadas.map(async (dev) => {
        return await Devolucion.findById(dev._id)
          .populate('productoId', 'nombre precio')
          .populate('ventaId');
      })
    );

    res.status(201).json({
      message: 'Devoluciones procesadas exitosamente',
      devoluciones: devolucionesRespuesta
    });

  } catch (error) {
    console.error('Error al crear devolución:', error);
    res.status(500).json({ 
      message: 'Error al crear devolución', 
      error: error.message 
    });
  }
});

// Agregar después de la ruta POST de devoluciones
router.delete('/devoluciones/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Buscar la devolución y validar que existe
    const devolucion = await Devolucion.findOne({ _id: id, userId })
      .populate('productoId')
      .populate('ventaId');

    if (!devolucion) {
      return res.status(404).json({ message: 'Devolución no encontrada' });
    }

    // Validar que el producto existe
    if (!devolucion.productoId) {
      return res.status(404).json({ message: 'Producto asociado no encontrado' });
    }

    // Validar que la venta existe
    if (!devolucion.ventaId) {
      return res.status(404).json({ message: 'Venta asociada no encontrada' });
    }

    // 1. Revertir cambios en el producto
    await Producto.findByIdAndUpdate(
      devolucion.productoId._id,
      {
        $inc: {
          cantidadVendida: devolucion.cantidadDevuelta, // Aumentar la cantidad vendida
          cantidadRestante: -devolucion.cantidadDevuelta // Disminuir la cantidad restante
        }
      },
      { new: true }
    );

    // 2. Revertir cambios en la venta
    await Venta.findByIdAndUpdate(
      devolucion.ventaId._id,
      {
        $inc: {
          cantidadDevuelta: -devolucion.cantidadDevuelta, // Disminuir la cantidad devuelta
          montoTotal: devolucion.montoDevolucion, // Restaurar el monto original
          cantidad: devolucion.cantidadDevuelta // Restaurar la cantidad original
        }
      },
      { new: true }
    );

    // 3. Eliminar la devolución
    await Devolucion.findByIdAndDelete(id);

    res.json({ 
      message: 'Devolución eliminada correctamente',
      devolucion: {
        id: devolucion._id,
        cantidadDevuelta: devolucion.cantidadDevuelta,
        montoDevolucion: devolucion.montoDevolucion
      }
    });

  } catch (error) {
    console.error('Error al eliminar la devolución:', error);
    res.status(500).json({ 
      message: 'Error al eliminar la devolución',
      error: error.message 
    });
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

// Ruta para obtener una venta específica por ID
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    // Validar que el ID sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de venta no válido' });
    }

    console.log(`Obteniendo venta ${id} para usuario ${userId}`);
    
    const venta = await Venta.findOne({ _id: id, userId })
      .populate('colaboradorId', 'nombre')
      .populate({
        path: 'detalles',
        populate: {
          path: 'productoId',
          select: 'nombre precio cantidadRestante'
        }
      });
    
    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }
    
    console.log(`Venta encontrada:`, venta);
    res.json(venta);
  } catch (error) {
    console.error('Error al obtener la venta:', error);
    res.status(500).json({ 
      message: 'Error al obtener la venta',
      error: error.message 
    });
  }
});

module.exports = router;