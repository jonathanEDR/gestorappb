const mongoose = require('mongoose');

const devolucionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  ventaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venta',
    required: true
  },
  productoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  fechaDevolucion: {
    type: Date,
    default: Date.now,
    required: true
  },



  cantidadDevuelta: {
    type: Number,
    required: true,
    min: [1, 'La cantidad debe ser al menos 1']
  },
  montoDevolucion: {
    type: Number,
    required: true,
    min: [0, 'El monto no puede ser negativo']
  },
  motivo: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Devolucion', devolucionSchema);