const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  clerk_id: { type: String, required: true, unique: true }, // ID de Clerk
  nombre_negocio: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  fecha_creacion: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
