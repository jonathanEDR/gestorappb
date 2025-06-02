const GestionPersonal = require('../models/GestionPersonal');
const Colaborador = require('../models/Colaborador'); // Si necesitas validar o usar el colaborador
const { convertirFechaALocalUtc, obtenerFechaActual } = require('../utils/fechaHoraUtils');

// Función auxiliar para validar y parsear números
const parsearNumero = (valor, defecto = 0) => {
  const num = parseFloat(valor);
  return isNaN(num) ? defecto : num;
};

// Crear nuevo registro
const crearRegistro = async (data) => {
  const {
    userId, // ID del usuario autenticado
    colaboradorId,
    fechaDeGestion,
    descripcion,
    monto,
    faltante = 0,
    adelanto = 0,
    pagodiario = 0,
  } = data;

    if (!userId) {
    throw new Error('userId es requerido');
  }


  // Buscar al colaborador
  const colaborador = await Colaborador.findOne({
    _id: colaboradorId,
    userId: userId
  });


  if (!colaborador) {
    throw new Error('Colaborador no encontrado');
  }

 

  const fechaDeGestionUtc = convertirFechaALocalUtc(fechaDeGestion);

  // Crear el nuevo registro de gestión personal
  const nuevoRegistro = new GestionPersonal({
    userId, // ID del usuario autenticado
    colaboradorId,
    fechaDeGestion: fechaDeGestionUtc,
    descripcion: descripcion.trim(),
    monto: parsearNumero(monto),
    faltante: parsearNumero(faltante),
    adelanto: parsearNumero(adelanto),
    diasLaborados: 1,
    pagodiario: parsearNumero(pagodiario, 0),
  });

  await nuevoRegistro.save();
  return nuevoRegistro;
};

// Función para agregar gastos, faltantes o adelantos
const addGasto = async (colaboradorId, tipo, gastoData) => {
  const colaborador = await Colaborador.findById(colaboradorId);
  if (!colaborador) {
    throw new Error('Colaborador no encontrado');
  }

  let gestion = await GestionPersonal.findOne({ colaboradorId });
  if (!gestion) {
    gestion = new GestionPersonal({
      colaboradorId,
      fechaDeGestion: new Date(),
      descripcion: gastoData.descripcion,
      monto: 0,
      faltante: 0,
      adelanto: 0,
      diasLaborados: 1,
      pagodiario: 0,
    });
  }

  // Validar tipo de gasto
  switch (tipo) {
    case 'gastosOcasionales':
      gestion.monto += parsearNumero(gastoData.monto);
      gestion.descripcion += (gestion.descripcion ? ', ' : '') + gastoData.descripcion;
      break;
    case 'faltantes':
      gestion.faltante += parsearNumero(gastoData.monto);
      break;
    case 'adelantos':
      gestion.adelanto += parsearNumero(gastoData.monto);
      break;
    case 'pagosDiarios':
      gestion.pagodiario += parsearNumero(gastoData.monto);
      break;


    default:
      throw new Error('Tipo de gasto no válido');
  }

  await gestion.save();
  return gestion;
};

module.exports = {
  crearRegistro,
  addGasto
};
