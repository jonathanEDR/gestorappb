const mongoose = require('mongoose');

const gestionPersonalSchema = new mongoose.Schema({
  colaboradorId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Colaborador',
    required: true
  },

  fechaDeGestion: {
    type: Date,
    required: true
  },


  // Cambio: campos separados en lugar de objeto anidado
  descripcion: { 
    type: String,
    required: true
  },

  monto: { 
    type: Number,
    required: true
  },

  faltante: {
    type: Number,
    required: true,
    default: 0
  },

  adelanto: {
    type: Number,
    required: true,
    default: 0
  },

  diasLaborados: {
    type: Number,
    required: true,
    default: 30
  },
  
}, {
  timestamps: true
});



const GestionPersonal = mongoose.model('GestionPersonal', gestionPersonalSchema);
module.exports = GestionPersonal;