const Venta = require('../models/Venta');
const Producto = require('../models/Producto');

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
  const { cantidad, estadoPago, cantidadPagada } = datosActualizados;
  
  // Buscar la venta
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return null;

  // Buscar el producto relacionado
  const producto = await Producto.findById(venta.productoId);
  if (!producto) throw new Error('Producto relacionado no encontrado');

  // Actualizar cantidad si es necesario
  if (cantidad && cantidad !== venta.cantidad) {
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

  // Guardar cambios
  await venta.save();

  // Retornar venta con detalles
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

  // Actualizar el producto
  const producto = await Producto.findById(venta.productoId);
  if (producto) {

    const nuevaCantidadVendida = producto.cantidadVendida - venta.cantidad;
    if (nuevaCantidadVendida < 0) {

      await producto.save();
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

module.exports = {
  getVentas,
  createVenta,
  updateVenta,
  deleteVenta,
  deleteVentaByColaborador,
  updateVentaByColaborador,
  updateVentaC,
};