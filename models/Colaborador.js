const mongoose = require('mongoose');

const colaboradorSchema = new mongoose.Schema({
  userId: {
    type: String,  // Asociar al ID del usuario autenticado
    required: true,
  },
 
  nombre: {
    type: String,
    required: true
  },
  telefono: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: false
  },

  departamento: {
    type: String,
    enum: ['Producción', 'Ventas', 'Administración', 'Financiero'],
    required: true
  },
  sueldo: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },

  fechaRegistro: {
    type: Date,
    default: Date.now
  }
  },
  {
  timestamps: true, // Esto agrega createdAt y updatedAt automáticamente
  });

module.exports = mongoose.models.Colaborador || mongoose.model('Colaborador', colaboradorSchema);
