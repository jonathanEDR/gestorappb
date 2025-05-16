const Producto = require('../models/Producto');

// Obtener todos los productos de un usuario específico
const getProductos = async (userId) => {
  if (!userId) {
    throw new Error('userId es requerido para obtener productos');
  }

  try {
    // Buscar productos que pertenezcan al usuario especificado
    const productos = await Producto.find({ userId: userId });
    return productos;
  } catch (error) {
    console.error('Error al obtener los productos:', error);
    throw new Error(`Error al obtener productos: ${error.message}`);
  }
};

// Crear un nuevo producto
const createProducto = async (productoData) => {
  if (!productoData.userId) {
    throw new Error('userId es requerido para crear un producto');
  }

  // Validación de los datos del producto
  if (!productoData.nombre || !productoData.precio || !productoData.cantidad) {
    throw new Error('Faltan campos obligatorios');
  }

  try {

    // Asignar valor de cantidadRestante (si no se define, será igual a la cantidad inicial)
    if (productoData.cantidadRestante === undefined) {
      productoData.cantidadRestante = productoData.cantidad;  // Se asume que cantidad es el valor inicial
    }

    // Crear un nuevo producto y asociarlo al userId
    const nuevoProducto = new Producto(productoData);
    await nuevoProducto.save(); 
    
    return nuevoProducto;
  } catch (error) {
    console.error('Error al agregar el producto:', error);
    throw new Error(`Error al agregar el producto: ${error.message}`);
  }
};

// Eliminar un producto
const deleteProducto = async (id, userId) => {
  if (!id || !userId) {
    throw new Error('Se requiere id del producto y userId para eliminar');
  }

  try {
    // Eliminar el producto que coincida con el ID y pertenezca al usuario
    const productoEliminado = await Producto.findOneAndDelete({ 
      _id: id,
      userId: userId 
    });

    if (!productoEliminado) {
      return null; // Retorna null si no encuentra un producto o no pertenece al usuario
    }

    return productoEliminado;
  } catch (error) {
    console.error('Error al eliminar el producto:', error);
    throw new Error(`Error al eliminar el producto: ${error.message}`);
  }
};

// Eliminar un producto
const deleteProductoC = async (nombreProducto, userId) => {
  if (!nombreProducto || !userId) {
    throw new Error('Se requiere nombre del producto y userId para eliminar');
  }

  try {
    console.log('Intentando eliminar producto con nombre:', nombreProducto, 'y userId:', userId);

    // Eliminar el producto que coincida con el nombre y pertenezca al usuario
    const productoEliminado = await Producto.findOneAndDelete({
      nombre: nombreProducto,  // Buscar por el nombre del producto
      userId: userId,          // Verificar que el producto pertenezca al usuario
    });

    if (!productoEliminado) {
      console.log(`Producto no encontrado o no pertenece al usuario. Nombre: ${nombreProducto}, userId: ${userId}`);
      return null; // Retorna null si no encuentra el producto o no pertenece al usuario
    }

    console.log('Producto eliminado:', productoEliminado);
    return productoEliminado; // Retorna el producto eliminado
  } catch (error) {
    // Manejar y registrar el error detalladamente
    console.error('Error al eliminar producto:', error);
    throw new Error(`Error al eliminar el producto: ${error.message}`);
  }
};


// Actualizar un producto existente
const updateProducto = async (id, updateData, userId) => {
  if (!id || !userId) {
    throw new Error('Se requiere id del producto y userId para actualizar');
  }

  try {
    // Primero obtener el producto actual
    const productoActual = await Producto.findOne({ _id: id, userId });
    
    if (!productoActual) {
      return null;
    }

    // Validar los datos del producto
    if (updateData.precio && updateData.precio <= 0) {
      throw new Error('El precio debe ser positivo');
    }
    
    if (updateData.cantidad !== undefined) {
      if (updateData.cantidad < 0) {
        throw new Error('La cantidad no puede ser negativa');
      }
      
      // Validar que la nueva cantidad no sea menor que la cantidad vendida
      if (updateData.cantidad < productoActual.cantidadVendida) {
        throw new Error('La nueva cantidad no puede ser menor que la cantidad ya vendida');
      }

      // Calcular la nueva cantidadRestante
      updateData.cantidadRestante = updateData.cantidad - productoActual.cantidadVendida;
    }

    // Actualizar el producto con los nuevos datos
    const productoActualizado = await Producto.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true, runValidators: true }
    );

    return productoActualizado;
  } catch (error) {
    console.error('Error al actualizar el producto:', error);
    throw new Error(`Error al actualizar el producto: ${error.message}`);
  }
};

// Actualizar un producto existente por nombre
const updateProductoC = async (nombreProducto, updateData, userId) => {
  if (!nombreProducto || !userId) {
    throw new Error('Se requiere nombre del producto y userId para actualizar');
  }

  // Validación de los datos del producto
  if (updateData.precio <= 0 || updateData.cantidad < 0) {
    throw new Error('Precio y cantidad deben ser valores positivos');
  }

  try {
    // Filtrar por nombre y userId para asegurarse de que el producto pertenece al usuario
    const productoActualizado = await Producto.findOneAndUpdate(
      { nombre: new RegExp(`^${nombreProducto}$`, 'i'), userId: userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!productoActualizado) {
      return null; // Retorna null si no encuentra el producto o no pertenece al usuario
    }

    return productoActualizado;
  } catch (error) {
    console.error('Error al actualizar el producto:', error);
    throw new Error(`Error al actualizar el producto: ${error.message}`);
  }
};




module.exports = { getProductos, createProducto, deleteProducto, updateProducto,deleteProductoC,updateProductoC };
