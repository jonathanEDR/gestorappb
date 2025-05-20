const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Devolucion = require('../models/Devolucion');

/**
 * Obtiene todas las ventas para un usuario específico
 * @param {string} userId - ID del usuario
 * @returns {Promise<Array>} Lista de ventas
 */
async function getVentas(userId) {
  return await Venta.find({ userId })
    .populate('colaboradorId', 'nombre')
    .populate('productoId', 'nombre precio');
}

/**
 * Crea una nueva venta
 * @param {Object} ventaData - Datos de la venta
 * @returns {Promise<Object>} Venta creada
 */
async function createVenta(ventaData) {
  const { colaboradorId, productoId, cantidad, montoTotal, estadoPago, cantidadPagada, userId } = ventaData;
  
  // Crear la venta
  const nuevaVenta = new Venta({
    colaboradorId,
    productoId,
    cantidad,
    montoTotal,
    estadoPago,
    cantidadPagada,
    userId
  });
  
  // Guardar la venta
  await nuevaVenta.save();
  
  // Actualizar el stock del producto
  const producto = await Producto.findById(productoId);
  producto.cantidadVendida += cantidad;
  producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
  await producto.save();
  
  // Retornar la venta con detalles
  const ventaCompleta = await Venta.findById(nuevaVenta._id)
    .populate('colaboradorId', 'nombre')
    .populate('productoId', 'nombre precio');
    
  return ventaCompleta;
}

/**
 * Actualiza una venta existente
 * @param {string} id - ID de la venta
 * @param {Object} datosActualizados - Datos a actualizar
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} Venta actualizada
 */
async function updateVenta(id, datosActualizados, userId) {
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return null;

  const { cantidad, estadoPago, cantidadPagada, fechadeVenta } = datosActualizados;

  // Verificar si tiene devoluciones antes de actualizar cualquier dato
  const tieneDevoluciones = await Devolucion.findOne({ ventaId: id });
  if (tieneDevoluciones) {
    throw new Error('No se puede editar una venta que tiene devoluciones asociadas');
  }

  // Actualizar fechadeVenta si viene
  if (fechadeVenta) {
    venta.fechadeVenta = fechadeVenta;
    venta.markModified('fechadeVenta'); // Forzar a mongoose a detectar el cambio
  }

  // Buscar el producto relacionado
  const producto = await Producto.findById(venta.productoId);
  if (!producto) throw new Error('Producto relacionado no encontrado');

  // Actualizar cantidad si es necesario
  if (cantidad !== undefined && cantidad !== venta.cantidad) {
    const nuevaCantidadVendida = producto.cantidadVendida - venta.cantidad + cantidad;

    if (nuevaCantidadVendida < 0) {
      throw new Error('La cantidad vendida no puede ser negativa.');
    }

    if (nuevaCantidadVendida > producto.cantidad) {
      throw new Error(`No hay suficiente stock. Solo hay ${producto.cantidad - producto.cantidadVendida + venta.cantidad} unidades disponibles.`);
    }

    // Actualizar producto
    producto.cantidadVendida = nuevaCantidadVendida;
    producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
    await producto.save();

    // Actualizar venta
    venta.cantidad = cantidad;
    venta.montoTotal = producto.precio * cantidad;
  }

  // Actualizar estado de pago y cantidad pagada
  if (estadoPago) venta.estadoPago = estadoPago;
  if (cantidadPagada !== undefined) venta.cantidadPagada = cantidadPagada;

  await venta.save();

  return await Venta.findById(id)
    .populate('colaboradorId', 'nombre')
    .populate('productoId', 'nombre precio');
}


async function updateVentaC(id, datosActualizados, userId) {
  const { cantidad, estadoPago, cantidadPagada } = datosActualizados;
  
  // Buscar la venta
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return null;
  
  // Buscar el producto relacionado
  const producto = await Producto.findById(venta.productoId);
  if (!producto) throw new Error('Producto relacionado no encontrado');
  
  // Actualizar cantidad si es necesario
  if (cantidad !== undefined && cantidad !== venta.cantidad) {
    // Calcular la diferencia entre la nueva cantidad y la anterior
    const diferencia = cantidad - venta.cantidad;
    
    // Verificar si hay suficiente stock para el incremento
    if (diferencia > 0) {
      const stockDisponible = producto.cantidad - producto.cantidadVendida;
      if (diferencia > stockDisponible) {
        throw new Error(`No hay suficiente stock. Solo hay ${stockDisponible} unidades disponibles.`);
      }
    }
    
    // Actualizar el inventario basado en la diferencia
    producto.cantidadVendida += diferencia;
    producto.cantidadRestante -= diferencia;
    await producto.save();
    
    // Actualizar la venta
    venta.cantidad = cantidad;
    
    // Recalcular monto total de la venta (usar el precio del producto)
    const precioUnitario = producto.precio;
    venta.montoTotal = precioUnitario * cantidad;
  }
  
  // Actualizar estado de pago y cantidad pagada
  if (estadoPago) venta.estadoPago = estadoPago;
  if (cantidadPagada !== undefined) venta.cantidadPagada = cantidadPagada;
  
  // Guardar los cambios
  await venta.save();
  
  // Retornar venta con detalles
  return await Venta.findById(id)
    .populate('colaboradorId', 'nombre')
    .populate('productoId', 'nombre precio');
}


/**
 * Elimina una venta
 * @param {string} id - ID de la venta
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} Resultado de la operación
 */
async function deleteVenta(id, userId) {
  // Buscar la venta
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return false;

  // Verificar si tiene devoluciones
  const tieneDevoluciones = await Devolucion.findOne({ ventaId: id });
  if (tieneDevoluciones) {
    throw new Error('No se puede eliminar una venta que tiene devoluciones asociadas');
  }

  // Actualizar el producto
  const producto = await Producto.findById(venta.productoId);
  if (producto) {

    const nuevaCantidadVendida = producto.cantidadVendida - venta.cantidad;
    if (nuevaCantidadVendida < 0) {
      throw new Error('La cantidad vendida no puede ser negativa');
    }
    producto.cantidadVendida = nuevaCantidadVendida;
    producto.cantidadRestante = producto.cantidad - nuevaCantidadVendida;
    await producto.save();
  }

  // Eliminar la venta
  await Venta.findByIdAndDelete(id);
  return true;
}

/**
 * Elimina ventas por colaborador
 * @param {string} colaboradorId - ID del colaborador
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Número de ventas eliminadas
 */
async function deleteVentaByColaborador(colaboradorId, userId) {
  const ventas = await Venta.find({ colaboradorId, userId });

    // Verificar si alguna venta tiene devoluciones
  for (const venta of ventas) {
    const tieneDevoluciones = await Devolucion.findOne({ ventaId: venta._id });
    if (tieneDevoluciones) {
      throw new Error('No se pueden eliminar ventas que tienen devoluciones asociadas');
    }
  }
  
  // Actualizar productos por cada venta
  for (const venta of ventas) {
    const producto = await Producto.findById(venta.productoId);
    if (producto) {
      producto.cantidadVendida -= venta.cantidad;
      producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
      await producto.save();
    }
  }
  
  // Eliminar todas las ventas del colaborador
  const resultado = await Venta.deleteMany({ colaboradorId, userId });
  return resultado.deletedCount;
}

/**
 * Actualiza ventas cuando se actualiza un colaborador
 * @param {string} oldColaboradorId - ID original del colaborador
 * @param {string} newColaboradorId - Nuevo ID del colaborador
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Número de ventas actualizadas
 */
async function updateVentaByColaborador(oldColaboradorId, newColaboradorId, userId) {
  const resultado = await Venta.updateMany(
    { colaboradorId: oldColaboradorId, userId },
    { $set: { colaboradorId: newColaboradorId } }
  );
  return resultado.modifiedCount;
}

// Función para gestionar la devolución de una venta
async function registrarDevolucion(ventaId, productoId, cantidadDevuelta, motivo, userId) {
  // Verificar que la venta exista
  const venta = await Venta.findById(ventaId);
  if (!venta || venta.userId !== userId) {
    throw new Error("Venta no encontrada");
  }

  // Verificar que el producto esté relacionado con la venta
  const producto = await Producto.findById(productoId);
  if (!producto) {
    throw new Error("Producto no encontrado");
  }

  // Verificar que la cantidad a devolver no sea mayor a la vendida
  if (cantidadDevuelta > venta.cantidad) {
    throw new Error(`No se puede devolver más productos que los vendidos. Vendidos: ${venta.cantidad}`);
  }

  // Actualizar la venta
  venta.cantidadVendida -= cantidadDevuelta;
  venta.montoTotal -= (producto.precio * cantidadDevuelta);
  await venta.save();

  // Actualizar el inventario
  producto.cantidadRestante += cantidadDevuelta;
  await producto.save();

  // Registrar la devolución
  const montoDevolucion = producto.precio * cantidadDevuelta;
  const nuevaDevolucion = new Devolucion({
    ventaId,
    productoId,
    cantidadDevuelta,
    montoDevolucion,
    motivo,
    userId
  });

  await nuevaDevolucion.save();
  return nuevaDevolucion;
}


// Agregar nueva función para obtener datos del gráfico
async function getChartData(userId, range) {
  const startDate = getStartDate(range);
  
  const [ventas, devoluciones] = await Promise.all([
    Venta.find({
      userId,
      fechadeVenta: { $gte: startDate }
    })
    .sort({ fechadeVenta: 1 })
    .populate('colaboradorId', 'nombre')
    .populate('productoId', 'nombre precio'),
    
    Devolucion.find({
      userId,
      createdAt: { $gte: startDate }
    })
    .populate('ventaId')
    .populate('productoId')
  ]);

  return {
    ventas,
    devoluciones
  };
}

// Modificar la función getVentas para soportar paginación
async function getVentas(userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  const [ventas, total] = await Promise.all([
    Venta.find({ userId })
      .sort({ fechadeVenta: -1 })
      .skip(skip)
      .limit(limit)
      .populate('colaboradorId', 'nombre')
      .populate('productoId', 'nombre precio'),
    Venta.countDocuments({ userId })
  ]);

  return {
    ventas,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    totalRecords: total,
    itemsPerPage: limit
  };
}

async function getAllVentas(userId) {
  try {
    return await Venta.find({ userId })
      .sort({ fechadeVenta: -1 })
      .populate('colaboradorId', 'nombre')
      .populate('productoId', 'nombre precio');
  } catch (error) {
    console.error('Error en getAllVentas:', error);
    throw error;
  }
}


module.exports = {
  getVentas,
  createVenta,
  updateVenta,
  deleteVenta,
  deleteVentaByColaborador,
  updateVentaByColaborador,
  updateVentaC,
  registrarDevolucion,
    getChartData,
  getVentas,
  getAllVentas
};