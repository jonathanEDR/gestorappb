const Cobro = require('../models/Cobro');
const Colaborador = require('../models/Colaborador'); // Asegúrate de que exista y esté exportado correctamente
const { convertirFechaALocalUtc, obtenerFechaActual } = require('../utils/fechaHoraUtils');


// Obtener todos los cobros para un usuario
const getCobros = async (userId) => {
  try {
    if (!userId) {
      throw new Error('El userId es requerido');
    }
    // Filtrar los cobros por userId del usuario autenticado
    const cobros = await Cobro.find({ userId });
    return cobros;
  } catch (error) {
    console.error('Error al obtener cobros:', error);
    throw error;
  }
};

// Crear un nuevo cobro
const createCobro = async (userId, cobroData) => {
  try {
    // Verificar si faltan campos obligatorios
    const requiredFields = ['colaboradorId', 'montoPagado', 'estadoPago', 'yape', 'efectivo', 'gastosImprevistos'];
    for (const field of requiredFields) {
      if (!cobroData[field]) {
        throw new Error(`Falta el campo requerido: ${field}`);
      }
    }

    const { fechaPago } = cobroData;
    let fechaFinal;

    // Si la fechaPago es válida, procesamos la fecha
    if (fechaPago) {
      // Usamos la función para convertir la fecha a UTC antes de guardarla
      fechaFinal = convertirFechaALocalUtc(fechaPago);  // Usar la función de conversión
    } else {
      // Si no hay fecha, usamos la fecha y hora actual en UTC
      fechaFinal = obtenerFechaActual();  // Esta función retorna la fecha actual en UTC
    }

    // Crear el objeto de cobro
    const newCobro = new Cobro({
      ...cobroData,
      userId,
      yape: cobroData.yape, // Incluir Yape
      efectivo: cobroData.efectivo, // Incluir Efectivo
      gastosImprevistos: cobroData.gastosImprevistos,
      fechaPago: fechaFinal,  // Guardar la fecha con la hora asignada
    });

    // Guardar el nuevo cobro en la base de datos
    await newCobro.save();

    return newCobro;
  } catch (error) {
    console.error('Error al crear cobro:', error);
    throw error;  // Lanza el error para que se maneje adecuadamente en el controlador
  }
};

// Actualizar un cobro por ID
const updateCobro = async (userId, id, updateData) => {
  try {
    if (!userId || !id) {
      throw new Error('userId y cobroId son requeridos');
    }

    const updated = await Cobro.findOneAndUpdate(
      { _id: id, userId },  // Filtramos por userId
      updateData,
      { new: true }
    );

    if (!updated) {
      throw new Error('Cobro no encontrado o no pertenece al usuario');
    }

    return updated;
  } catch (error) {
    console.error('Error al actualizar cobro:', error);
    throw error;
  }
};

// Eliminar un cobro por ID
const deleteCobro = async (userId, id) => {
  try {
    if (!userId || !id) {
      throw new Error('userId y cobroId son requeridos');
    }

    const deletedCobro = await Cobro.findOneAndDelete({ _id: id, userId });  // Filtramos por userId

    if (!deletedCobro) {
      throw new Error('Cobro no encontrado o no pertenece al usuario');
    }

    return deletedCobro;
  } catch (error) {
    console.error('Error al eliminar cobro:', error);
    throw error;
  }
};

// Eliminar cobros asociados a un colaborador para un usuario
const deleteCobroByColaborador = async (userId, nombre) => {
  try {
    if (!userId || !nombre) {
      throw new Error('userId y nombre son requeridos');
    }

    // Busca el colaborador cuyo nombre coincida (insensible a mayúsculas/minúsculas)
    const colaborador = await Colaborador.findOne({
      nombre: new RegExp('^' + nombre + '$', 'i'),
      userId  // Aseguramos que el colaborador pertenece al usuario
    });

    if (!colaborador) {
      throw new Error(`No se encontró colaborador con el nombre ${nombre}`);
    }

    // Elimina los cobros usando el _id del colaborador y el userId
    const result = await Cobro.deleteMany({
      colaboradorId: colaborador._id,
      userId  // Aseguramos que los cobros sean del usuario autenticado
    });

    if (result.deletedCount === 0) {
      throw new Error(`No se encontró cobro para el colaborador ${nombre}`);
    }

    return result;
  } catch (error) {
    console.error('Error al eliminar cobro por colaborador:', error);
    throw error;
  }
};

// Actualizar cobros por colaborador para un usuario
const updateCobroByColaborador = async (userId, colaboradorID, updateData) => {
  try {
    if (!userId || !colaboradorID) {
      throw new Error('userId y colaboradorID son requeridos');
    }

    const updated = await Cobro.updateMany(
      { colaboradorId: colaboradorID, userId },  // Filtramos por userId y colaboradorId
      updateData
    );

    if (updated.nModified === 0) {
      throw new Error(`No se encontró cobro para el colaborador ${colaboradorID} o no se actualizó ningún campo`);
    }

    return updated;
  } catch (error) {
    console.error('Error al actualizar cobro por colaborador:', error);
    throw error;
  }
};

module.exports = {
  getCobros,
  createCobro,
  updateCobro,
  deleteCobro,
  deleteCobroByColaborador,
  updateCobroByColaborador,
};
