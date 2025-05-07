const User = require('../models/User');  

const getUserData = async (userId) => {
  const user = await User.findOne({ clerkUserId: userId });  // Buscar al usuario por el ID de Clerk
  return user;
};

// Servicio para guardar datos del usuario
const saveUserData = async (userId, data) => {
  const user = await User.findOneAndUpdate(
    { clerkUserId: userId },  // Buscar el usuario por su ID de Clerk
    data,  // Datos a actualizar
    { new: true, upsert: true }  // Si no existe el usuario, lo crea
  );
  return user;
};

module.exports = { getUserData, saveUserData };
