const mongoose = require('mongoose');

const gastoSchema = new mongoose.Schema({
  userId: { type: String, required: true },
    tipoDeGasto: {
    type: String,
    enum: ['Mano de obra', 'Materia prima', 'Otros'],
    required: true
  },
  gasto: {
    type: String,
    enum: ['Producción', 'Ventas', 'Administración', 'Financiero'],
    required: true
  },
  descripcion: { type: String, required: true },
  costoUnidad: { type: Number, required: true },
  cantidad: { type: Number, required: true },
  montoTotal: { type: Number, required: true },
  fechaGasto: { type: Date, default: Date.now }
    },
  {
  timestamps: true, 
});

const Gasto = mongoose.model('Gasto', gastoSchema);

module.exports = Gasto;
