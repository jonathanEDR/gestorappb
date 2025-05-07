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
  fechaRegistro: {
    type: Date,
    default: Date.now
  }
  },
  {
  timestamps: true, // Esto agrega createdAt y updatedAt automáticamente
  });

module.exports = mongoose.model('Colaborador', colaboradorSchema);
