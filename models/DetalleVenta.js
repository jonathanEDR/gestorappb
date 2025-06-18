const mongoose = require("mongoose");

const detalleVentaSchema = new mongoose.Schema({
  ventaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venta',
    required: true,
  },
  productoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true,
  },
  cantidad: { 
    type: Number, 
    required: true,
    min: 1
  },
  precioUnitario: { 
    type: Number, 
    required: true,
    min: 0
  },
  subtotal: { 
    type: Number, 
    required: true,
    min: 0
  }
}, {
  timestamps: true
});

// Middleware para calcular el subtotal antes de guardar
detalleVentaSchema.pre('save', function(next) {
  this.subtotal = this.cantidad * this.precioUnitario;
  next();
});

const DetalleVenta = mongoose.model("DetalleVenta", detalleVentaSchema);

module.exports = DetalleVenta;
