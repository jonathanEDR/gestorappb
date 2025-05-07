const { clerkClient } = require('@clerk/clerk-sdk-node');
require('dotenv').config();


const authenticate = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];  // Obtener el token del header

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  // Verificar que el token tenga el formato adecuado (tres partes separadas por puntos)
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    console.log('Token mal formado');

    return res.status(401).json({ message: 'Unauthorized: Invalid token format' });
  }

  try {
    // Verificar el token con Clerk
    const { sub } = await clerkClient.verifyToken(token);
    
    if (!sub) {
      console.log('No sub found in token');

      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }

    req.user = { id: sub };  // Asignar el id del usuario a req.user
    next();  // Continuar con la ruta protegida
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

module.exports = { authenticate };