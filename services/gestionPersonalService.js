const GestionPersonal = require('../models/GestionPersonal');
const Colaborador = require('../models/Colaborador'); // Si necesitas validar o usar el colaborador

// Función auxiliar para validar y parsear números
const parsearNumero = (valor, defecto = 0) => {
  const num = parseFloat(valor);
  return isNaN(num) ? defecto : num;
};

// Crear nuevo registro
const crearRegistro = async (data) => {
  const { 
    colaboradorId,
    fechaDeGestion,
    descripcion,
    monto,
    faltante = 0,
    adelanto = 0,
    diasLaborados = 30 
  } = data;

  // Buscar al colaborador
  const colaborador = await Colaborador.findById(colaboradorId);
  if (!colaborador) {
    throw new Error('Colaborador no encontrado');
  }

  // Obtener el último registro de gestión personal del colaborador
  const ultimoRegistro = await GestionPersonal.findOne({ colaboradorId }).sort({ fechaDeGestion: -1 });

  // Si existe un registro anterior, sumamos 1 al total de días laborados
  const nuevoDiaLaborado = ultimoRegistro ? ultimoRegistro.diasLaborados + 1 : 1;

  // Crear el nuevo registro de gestión personal
  const nuevoRegistro = new GestionPersonal({
    colaboradorId,
    fechaDeGestion: new Date(fechaDeGestion),
    descripcion: descripcion.trim(),
    monto: parsearNumero(monto),
    faltante: parsearNumero(faltante),
    adelanto: parsearNumero(adelanto),
    diasLaborados: nuevoDiaLaborado // Usamos el valor incrementado de días laborados
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
