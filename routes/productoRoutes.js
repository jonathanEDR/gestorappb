const express = require('express');
const router = express.Router();
const { 
  getProductos, 
  createProducto, 
  deleteProducto, 
  updateProducto 
} = require('../services/productService');
const { authenticate } = require('../middleware/authenticate');

// Ruta para obtener todos los productos
router.get('/', authenticate, async (req, res) => {    
  const userId = req.user.id;

  try {
    const productos = await getProductos(userId);
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
});

// Ruta para agregar un producto
router.post('/', authenticate, async (req, res) => {
  const { nombre, precio, precioCompra, cantidad } = req.body;  
  const userId = req.user.id;  
  
  if (!nombre || !precio || !precioCompra || !cantidad) {
    return res.status(400).json({ message: 'Faltan datos importantes' });
  }

    if (precioCompra > precio) {
    return res.status(400).json({ message: 'El precio de compra no puede ser mayor que el precio de venta' });
  }

  try {
    const nuevoProducto = await createProducto({userId, nombre, precio, precioCompra, cantidad});
    res.status(201).json(nuevoProducto);
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ 
      message: 'Error al crear producto', 
      error: error.message 
    });
  }
});

// Ruta para eliminar un producto
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;  

  try {
    const producto = await deleteProducto(id, userId);  
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ message: 'Error al eliminar producto', error: error.message });
  }
});

// Ruta para actualizar un producto
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { nombre, precio, precioCompra, cantidad } = req.body;
  const userId = req.user.id;


  try {
    // Esta es la línea corregida que estaba causando el error 500
    const producto = await updateProducto(id, { nombre, precio, precioCompra, cantidad }, userId);

    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    
    res.json(producto);
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ message: 'Error al actualizar producto', error: error.message });
  }
});

// Ruta para obtener informe de inventario
router.get('/reportes/inventario', authenticate, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const productos = await getProductos(userId);
    const reporteInventario = productos.map((producto) => ({
      nombre: producto.nombre,
      cantidad: producto.cantidad,
      precio: producto.precio,
      valorTotal: producto.precio * producto.cantidad
    }));

    const valorTotalInventario = reporteInventario.reduce((acc, item) => acc + item.valorTotal, 0);

    res.json({ reporteInventario, valorTotalInventario });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener el informe de inventario', 
      error: error.message 
    });
  }
});

module.exports = router;