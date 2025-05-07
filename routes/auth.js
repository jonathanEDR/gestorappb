const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Clerk = require('../config/clerkConfig'); // Usar la configuración de Clerk
const router = express.Router();


// Middleware para verificar el token de Clerk
const authenticate = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];  // Obtener el token del header

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  clerk.verifySession(token)
    .then(session => {
      req.user = session.user;  // Si el token es válido, agregar el usuario a la request
      next();  // Continuar con la ruta protegida
    })
    .catch(err => {
      res.status(401).json({ message: 'Unauthorized: Invalid token', error: err });
    });
};

// Ruta protegida para obtener datos del usuario
router.get('/user-profile', authenticate, (req, res) => {
  // Aquí accedes a los datos del usuario autenticado
  res.json({ message: 'User profile', user: req.user });
});

// Ruta para registrar un usuario
router.post('/register', async (req, res) => {
  const { email, nombre_negocio, clerk_id } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ mensaje: 'El usuario ya está registrado' });
    }

    const newUser = new User({ email, nombre_negocio, clerk_id });
    await newUser.save();
    res.status(201).json({ mensaje: 'Usuario registrado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al registrar al usuario' });
  }
});

// Ruta de login
router.post('/login', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ mensaje: 'Usuario no encontrado' });
    }

    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ mensaje: 'Login exitoso', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error en el login' });
  }
});

module.exports = router;
