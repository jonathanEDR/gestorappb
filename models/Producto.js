const mongoose = require('mongoose');
const { getNextSequenceValue } = require('../utils/counter');  // Importa la función para manejar el contador

const productoSchema = new mongoose.Schema({
  userId: {
    type: String,  // Asociar al ID del usuario autenticado
    required: true,
  },
   
  nombre: { 
    type: String, 
    required: true 
  },
  precio: { 
    type: Number, 
    required: true,
    min: [0, 'El precio no puede ser negativo']  // Validación para precio positivo
  },
  cantidad: { 
    type: Number, 
    required: true,
    min: [0, 'La cantidad no puede ser negativa']  // Validación para cantidad positiva
  },
  cantidadVendida: { 
    type: Number, 
    default: 0,  
    min: [0, 'La cantidad vendida no puede ser negativa']  // Validación para cantidad vendida positiva
  },
  cantidadRestante: { 
    type: Number, 
    default: 0,
    min: [0, 'La cantidad restante no puede ser negativa']  // Validación para cantidad restante positiva
  },
  fechadeProducto: {
    type: Date,
    default: Date.now,  // Establecer fecha por defecto
  },
  },
  {
  timestamps: true, // Esto agrega createdAt y updatedAt automáticamente
});

const Producto = mongoose.model('Producto', productoSchema);

module.exports = Producto;
