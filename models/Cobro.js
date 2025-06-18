const mongoose = require('mongoose');

const cobroSchema = new mongoose.Schema({
  userId: {
    type: String,  // Asociar al ID del usuario autenticado
    required: true,
  },
    colaboradorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Colaborador',
    required: [true, 'El colaborador es requerido']
  },

  // Venta específica a la que se aplica este cobro
  ventaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venta',
    required: [true, 'La venta es requerida']
  },

  // Mantener el array para compatibilidad (opcional)
  ventasId: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venta'
  }],

  montoPagado: {
    type: Number,
    required: [true, 'El monto pagado es requerido'],
    min: [0, 'El monto pagado no puede ser negativo']
  },
  estadoPago: {
    type: String,
    required: [true, 'El estado de pago es requerido'],
    enum: {
      values: ['parcial', 'total'],
      message: '{VALUE} no es un estado válido'
    }
  },

  yape: {
    type: Number,
    default: 0,
  },
  efectivo: {
    type: Number,
    default: 0,
  },
  gastosImprevistos: {
    type: Number,
    default: 0,
  },

  fechaPago: {
    type: Date,
    default: Date.now,  // Establecer fecha por defecto

  }
}, {
  timestamps: true
});

const Cobro = mongoose.model('Cobro', cobroSchema);

module.exports = Cobro;