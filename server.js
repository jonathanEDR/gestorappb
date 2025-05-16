require('dotenv').config();

const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session'); // Importa express-session
const productoRoutes = require('./routes/productoRoutes');  // Importar las rutas de productos
const colaboradorRoutes = require('./routes/colaboradorRoutes');
const ventaRoutes = require('./routes/ventaRoutes'); // Importa las rutas de ventas
const cobroRoutes = require('./routes/cobroRoutes'); // Importar las rutas de cobros
const chatbotRoutes = require('./routes/chatbotRoutes');


// Crear servidor
const app = express();

const sessionMiddleware = session({
  secret: 'tu_clave_secreta_aqui', // Cambia por una clave segura
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // En producción úsalo en https y secure: true
});


const allowedOrigins = [
  'http://localhost:3000', // Para desarrollo local
  'https://gestorapp-one.vercel.app' // Dominio del frontend en producción
];

app.get('/', (req, res) => {
  res.send('Bienvenido al backend de GestorApp');
});

// Middleware
app.use(cors({ origin: allowedOrigins,   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], credentials: true }));
app.use(express.json());
app.use(bodyParser.json());
app.use(sessionMiddleware);


app.use('/api/productos', productoRoutes);
app.use('/api/ventas', ventaRoutes);
app.use('/api/colaboradores', colaboradorRoutes);  // Asegúrate de que la ruta esté bien configurada
app.use('/api/cobros', cobroRoutes); // Usar las rutas para los cobros
app.use('/api/chatbot', chatbotRoutes);


// Conexión a la base de datos
const mongodbUri = process.env.MONGODB_URI;
console.log('URI de MongoDB:', mongodbUri);

if (!mongodbUri) {
  console.error('La URI de MongoDB no está definida en el archivo .env');
  process.exit(1);
}
mongoose.connect(mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Conectado a MongoDB');
  })
  .catch((error) => {
    console.error('Error al conectar con MongoDB:', error);
  });

module.exports = app; 