const express = require('express');
const router = express.Router();
const { interactWithOpenAI } = require('../services/openaiService'); // Para respuestas generales
const {getProductos, createProducto, deleteProductoC, updateProductoC, } = require('../services/productService');  // Funciones de productos
const { getCobros, createCobro, updateCobro, deleteCobro } = require('../services/cobroService');
const { getVentas, createVentaC, updateVenta, deleteVenta, deleteVentaByColaborador, updateVentaByColaborador, updateVentaC } = require('../services/ventaService');
const { createColaborador,updateColaborador  } = require('../services/colaboradorService');  // Correcto
const Producto = require('../models/Producto');  // Asegúrate de usar la ruta correcta del archivo
const Venta = require('../models/Venta');  // Asegúrate de usar la ruta correcta del archivo
const Cobro = require('../models/Cobro')
const Colaborador = require('../models/Colaborador');
const { validateProductName, validateQuantity, validatePrice } = require('../utils/validation');
const validateCobroMonto = (monto) => !isNaN(monto) && parseFloat(monto) >= 0;
const validateCobroEstado = (estado) => ['parcial','total'].includes(estado.toLowerCase());
const { authenticate } = require('../middleware/authenticate');


router.post('/interact', authenticate, async (req, res) => {
  const userId = req.user.id;
  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado.' });
  }
  const { message } = req.body;
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ message: 'El mensaje del usuario es requerido.' });
  }

  // Función para validar el campo que se desea actualizar
  const validateUpdateField = (field) => {
    const validFields = ['precio', 'cantidad'];  // Los campos válidos para actualización
    return validFields.includes(field.toLowerCase());
  };


  // Asegurarse de que req.session.chatFlow existe y se inicializa correctamente
  if (!req.session.chatFlow) {
    req.session.chatFlow = {};
  }
  const flow = req.session.chatFlow;

  console.log(`User "${userId}" envió: ${message}`);
  console.log('Estado actual de la sesión:', flow);


  
  // Y modificar la verificación de cancelación:
  if (/^cancelar$/i.test(message.trim()) && flow[userId]) {
    const flowType = flow[userId].flowType;
    const flowName = flowNames[flowType] || flowType;
    delete flow[userId];
    return res.json({ 
      reply: `Se ha cancelado la operación de ${flowName}. ¿En qué más puedo ayudarte?` 
    });
  }

  // Detecta la intención de agregar colaborador
  if (/(agregar|registrar|añadir|sumar).*(colaborador|colaborador\s+#\d+|colaborador\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'agregar_colaborador', step: 'waitingForColaboradorName' };
    return res.json({ reply: '¿Cuál es el nombre del colaborador que deseas agregar?' });
  }

  // Si ya se está en el flujo de agregar colaborador
  if (flow[userId] && flow[userId].flowType === 'agregar_colaborador') {
    console.log('Flujo de sesión después de agregar nombre del colaborador:', flow);

    if (flow[userId].step === 'waitingForColaboradorName') {
      flow[userId].colaboradorName = message;
      flow[userId].step = 'waitingForColaboradorTelefono';  // Avanzar al siguiente paso
      console.log('Flujo después de agregar el nombre:', flow);
      return res.json({ reply: `Perfecto, ahora dime el teléfono del colaborador ${message}.` });
    }

    if (flow[userId].step === 'waitingForColaboradorTelefono') {
      flow[userId].colaboradorTelefono = message;
      flow[userId].step = 'waitingForColaboradorEmail';  // Avanzar al siguiente paso
      console.log('Flujo después de agregar el teléfono:', flow);
      return res.json({ reply: `Gracias, ahora ingresa el correo electrónico de ${flow[userId].colaboradorName}.` });
    }

    if (flow[userId].step === 'waitingForColaboradorEmail') {
      flow[userId].colaboradorEmail = message;

      // Verificar los datos antes de enviarlos a la base de datos
      const colaboradorData = {
        userId: userId,
        nombre: flow[userId].colaboradorName,
        telefono: flow[userId].colaboradorTelefono,
        email: flow[userId].colaboradorEmail,
      };

      console.log('Datos del colaborador a guardar:', colaboradorData); // Verifica los datos

      try {
        const result = await createColaborador(colaboradorData);  // Guardamos el colaborador
        console.log('Colaborador agregado con éxito:', result);
        const nombreColaborador = colaboradorData.nombre;

        delete flow[userId]; // Limpiar el flujo después de completar
        return res.json({ reply: `Colaborador ${colaboradorData.nombre} agregado exitosamente.` });
      } catch (error) {
        console.error('Error al agregar colaborador:', error); // Log detallado
        return res.status(500).json({ message: 'Error al agregar el colaborador.', error: error.message });
      }
    }
  }

  // Flujo para eliminar colaborador
  if (flow[userId] && flow[userId].flowType === 'eliminar_colaborador') {
    if (flow[userId].step === 'waitingForColaboradorName') {
      flow[userId].colaboradorName = message;

      try {
        // Buscar el colaborador por nombre
        const colaborador = await Colaborador.findOne({ nombre: flow[userId].colaboradorName });

        if (!colaborador) {
          return res.json({ reply: `No se encontró un colaborador con el nombre ${message}. Intenta nuevamente.` });
        }

        // Eliminar colaborador de la base de datos
        await Colaborador.findOneAndDelete({ nombre: flow[userId].colaboradorName });

        // Limpiar flujo después de la eliminación
        delete flow[userId];

        return res.json({ reply: `El colaborador ${colaborador.nombre} ha sido eliminado exitosamente.` });
      } catch (error) {
        console.error('Error al eliminar colaborador:', error);
        return res.status(500).json({ message: 'Error al eliminar el colaborador.', error: error.message });
      }
    }
  }

  // Detectar intención de actualizar colaborador
  if (/(actualizar|modificar|cambiar|reemplazar).*(colaborador|colaborador\s+#\d+|colaborador\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { 
      flowType: 'actualizar_colaborador', 
      step: 'waitingForColaboradorName' 
    };
    return res.json({ 
      reply: '¿Cuál es el nombre del colaborador que deseas actualizar?' 
    });
  }

  // Manejar flujo de actualización de colaborador
  if (flow[userId]?.flowType === 'actualizar_colaborador') {
    // Paso 1: Esperar nombre del colaborador
    if (flow[userId].step === 'waitingForColaboradorName') {
      try {
        const colaborador = await Colaborador.findOne({ 
          nombre: new RegExp(`^${message}$`, 'i') 
        });

        if (!colaborador) {
          return res.json({ 
            reply: `No encontré ningún colaborador con el nombre "${message}". ¿Podrías verificar el nombre?` 
          });
        }

        flow[userId].colaboradorId = colaborador._id;
        flow[userId].colaboradorName = colaborador.nombre;
        flow[userId].step = 'waitingForField';

        return res.json({ 
          reply: '¿Qué campo deseas actualizar? (correo electronico o telefono)' 
        });
      } catch (error) {
        console.error('Error al buscar colaborador:', error);
        return res.json({ 
          reply: 'Hubo un error al buscar el colaborador. Por favor, intenta nuevamente.' 
        });
      }
    }

    // Paso 2: Esperar campo a actualizar
    if (flow[userId].step === 'waitingForField') {
      const camposPermitidos = ['correo electronico', 'telefono'];
      const campo = message.toLowerCase();

      if (!camposPermitidos.includes(campo)) {
        return res.json({ 
          reply: 'Por favor, elige "correo electronico" o "telefono".' 
        });
      }

      flow[userId].colaboradorField = campo;
      flow[userId].step = 'waitingForNewValue';

      return res.json({ 
        reply: `Por favor, ingresa el nuevo ${campo} para ${flow[userId].colaboradorName}.` 
      });
    }

    // Paso 3: Esperar nuevo valor y actualizar
    if (flow[userId].step === 'waitingForNewValue') {
      const fieldMapping = {
        'correo electronico': 'email',
        'telefono': 'telefono'
      };

      const dbField = fieldMapping[flow[userId].colaboradorField];
      
      if (!dbField) {
        return res.json({ 
          reply: 'Campo no válido para actualización.' 
        });
      }

      let updateData = {};
      updateData[dbField] = message;

      // Validar email si es el campo a actualizar
      if (dbField === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(message)) {
          return res.json({ 
            reply: 'Por favor, ingresa un correo electrónico válido.' 
          });
        }
      }

      try {
        const updatedColaborador = await updateColaborador(
          flow[userId].colaboradorId, 
          updateData,
          userId
        );

        if (!updatedColaborador) {
          return res.json({ 
            reply: 'No se pudo actualizar el colaborador. Por favor, intenta nuevamente.' 
          });
        }

        console.log('Colaborador actualizado:', updatedColaborador);

        const response = `El colaborador ${updatedColaborador.nombre} ha sido actualizado exitosamente.\nNuevo ${flow[userId].colaboradorField}: ${updatedColaborador[dbField]}`;

        // Limpiar el flujo después de la actualización exitosa
        delete flow[userId];
        
        return res.json({ reply: response });

      } catch (error) {
        console.error('Error al actualizar colaborador:', error);
        return res.status(500).json({ 
          reply: 'Hubo un error al actualizar el colaborador. Por favor, intenta nuevamente.' 
        });
      }
    }
  }

  // Detecta la intención de eliminar colaborador
  if (/(eliminar|borrar|suprimir|quitar).*(colaborador|colaborador\s+#\d+|colaborador\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'eliminar_colaborador', step: 'waitingForColaboradorName' };
      return res.json({ reply: '¿Cuál es el nombre del colaborador que deseas eliminar?' });
    }



  // ************** FLUJO PARA AGREGAR PRODUCTO **************
  if (flow[userId] && flow[userId].flowType === 'agregar') {
    // Esperando nombre
    if (flow[userId].step === 'waitingForProductName') {
      if (validateProductName(message)) {
        flow[userId].productName = message;
        flow[userId].step = 'waitingForQuantity';
        console.log(`Flujo agregar producto para ${userId}: nombre recibido (${message}).`);
        return res.json({ reply: `Perfecto, ahora dime la cantidad de ${message} que deseas agregar.` });
      } else {
        return res.json({ reply: 'Por favor, ingresa un nombre de producto válido.' });
      }
    }
    // Esperando cantidad
    if (flow[userId].step === 'waitingForQuantity') {
      if (validateQuantity(message)) {
        flow[userId].quantity = parseInt(message, 10);
        flow[userId].step = 'waitingForPrice';
        console.log(`Flujo agregar producto para ${userId}: cantidad recibida (${message}).`);
        return res.json({ reply: `Ahora, dime el precio de ${flow[userId].productName}.` });
      } else {
        return res.json({ reply: 'Por favor, ingresa una cantidad válida (un número mayor a cero).' });
      }
    }
    // Esperando precio
    if (flow[userId].step === 'waitingForPrice') {
      if (validatePrice(message)) {
        flow[userId].price = parseFloat(message);

        const newProduct = {
          userId: userId,
          nombre: flow[userId].productName,
          cantidad: flow[userId].quantity,
          precio: flow[userId].price,
        };
        console.log(`Flujo agregar producto para ${userId}: precio recibido (${message}). Producto:`, newProduct);
        try {
          await createProducto(newProduct);
          delete flow[userId];
          return res.json({ reply: `Producto ${newProduct.nombre} agregado exitosamente con ${newProduct.cantidad} unidades a ${newProduct.precio} cada una.` });
        } catch (error) {
          console.error('Error al crear producto:', error);
          return res.status(500).json({ message: 'Hubo un error al guardar el producto.' });
        }
      } else {
        return res.json({ reply: 'Por favor, ingresa un precio válido para el producto.' });
      }
    }
  }
  
  // ************** FLUJO PARA ELIMINAR PRODUCTO **************
  if (flow[userId] && flow[userId].flowType === 'eliminar') {
    if (flow[userId].step === 'waitingForProductNameToDelete') {
      // Usamos el mensaje como nombre del producto a eliminar
      const nombreAEliminar = message;
      try {
        await deleteProductoC(nombreAEliminar, userId);
        delete flow[userId];
        return res.json({ reply: `Producto ${nombreAEliminar} eliminado exitosamente.` });
      } catch (error) {
        console.error('Error al eliminar producto:', error);
        return res.status(500).json({ message: 'Error al eliminar el producto.' });
      }
    }
  }
  
  // Si el usuario quiere actualizar producto
  if (/(actualizar|modificar|cambiar|reemplazar).*(producto|producto\s+#\d+|producto\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'actualizar', step: 'waitingForProductNameToUpdate' };
    console.log(`Inicio del flujo para actualizar producto para ${userId}`);
    console.log('Estado de sesión actualizado:', flow[userId]);
    return res.json({ reply: 'Por favor, indica el nombre del producto que deseas actualizar.' });
  }
  
  // ************** FLUJO PARA ACTUALIZAR PRODUCTO **************
  if (flow[userId] && flow[userId].flowType === 'actualizar') {
    // Paso 1: Esperar nombre del producto
    if (flow[userId].step === 'waitingForProductNameToUpdate') {
      try {
        // Verificar que el producto existe antes de continuar
        const producto = await Producto.findOne({ 
          nombre: new RegExp(`^${message}$`, 'i') 
        });

        if (!producto) {
          return res.json({ 
            reply: `No se encontró ningún producto con el nombre "${message}". Por favor, verifica el nombre.` 
          });
        }

        flow[userId].productName = producto.nombre;
        flow[userId].step = 'waitingForUpdateField';
        
        return res.json({ 
          reply: `Producto encontrado: ${producto.nombre}\n` +
                `Precio actual: $${producto.precio}\n` +
                `Cantidad actual: ${producto.cantidad}\n\n` +
                `¿Qué deseas actualizar? (precio o cantidad)`
        });
      } catch (error) {
        console.error('Error al buscar producto:', error);
        return res.json({ 
          reply: 'Hubo un error al buscar el producto. Por favor, intenta nuevamente.' 
        });
      }
    }

    // Paso 2: Esperar campo a actualizar
    if (flow[userId].step === 'waitingForUpdateField') {
      const field = message.toLowerCase();
      if (!['precio', 'cantidad'].includes(field)) {
        return res.json({ 
          reply: 'Por favor, elige "precio" o "cantidad".' 
        });
      }

      flow[userId].updateField = field;
      flow[userId].step = 'waitingForNewValue';
      
      return res.json({ 
        reply: `Por favor, ingresa el nuevo ${field} para ${flow[userId].productName}.` 
      });
    }

    // Paso 3: Esperar nuevo valor
    if (flow[userId].step === 'waitingForNewValue') {
      try {
        const field = flow[userId].updateField;
        let newValue;

        if (field === 'precio') {
          if (!validatePrice(message)) {
            return res.json({ 
              reply: 'Por favor, ingresa un precio válido (número mayor a 0).' 
            });
          }
          newValue = parseFloat(message);
        } 
        
        else if (field === 'cantidad') {
          if (!validateQuantity(message)) {
            return res.json({ 
              reply: 'Por favor, ingresa una cantidad válida (número entero mayor a 0).' 
            });
          }
          newValue = parseInt(message, 10);
        }

        // Verificar si el producto existe antes de realizar la actualización
        const producto = await Producto.findOne({ nombre: flow[userId].productName, userId });
        if (!producto) {
          return res.json({
            reply: `No se encontró un producto con el nombre "${flow[userId].productName}" para actualizar.`
          });
        }

    // Crear el objeto updateData con el campo correspondiente y userId
    const updateData = {
      [field]: newValue,  // Actualizamos el campo especificado
      userId: userId      // Aseguramos que el producto pertenezca al usuario
    };

      console.log('nombreProducto:', flow[userId].productName);  // Depuración
      console.log('userId:', userId);  // Depuración

      // Llamada a la función de backend para actualizar el producto
      const productoActualizado = await updateProductoC(flow[userId].productName, updateData, userId);

        // Limpiar el flujo y responder
        delete flow[userId];
        
        return res.json({ 
          reply: `Producto actualizado exitosamente:\n` +
                `- Nombre: ${productoActualizado.nombre}\n` +
                `- Precio: $${productoActualizado.precio}\n` +
                `- Cantidad: ${productoActualizado.cantidad}`
        });

      } catch (error) {
        console.error('Error al actualizar producto:', error);
        return res.json({ 
          reply: 'Hubo un error al actualizar el producto. Por favor, intenta nuevamente.' 
        });
      }
    }
  }

  // Flujo para agregar cobro: pedir colaborador (por nombre), montoPagado y asignar estado automáticamente
  if (flow[userId] && flow[userId].flowType === 'cobro_add') {
    // Paso 1: Esperar el nombre del colaborador (en vez de "ID")
    if (flow[userId].step === 'waitingForColaboradorId') {
      const colaboradorName = message.trim();
      if (!colaboradorName) {
        return res.json({ reply: 'Por favor, ingresa un nombre válido de colaborador.' });
      }
      try {
        const colaborador = await require('../models/Colaborador').findOne({
          nombre: new RegExp('^' + colaboradorName + '$', 'i')
        });
        if (!colaborador) {
          return res.json({ reply: `No se encontró colaborador con el nombre ${colaboradorName}.` });
        }
        
        // Asigna el _id del colaborador (ObjectId) al flujo
        flow[userId].colaboradorId = colaborador._id;
        // Guardar también el nombre del colaborador para usarlo en mensajes
        flow[userId].colaboradorNombre = colaborador.nombre;
        flow[userId].step = 'waitingForMonto';

        // **Obtenemos la deuda pendiente del colaborador**
        const cobrosExistentes = await require('../models/Cobro').find({ colaboradorId: flow[userId].colaboradorId });
        const ventas = await require('../models/Venta').find({ colaboradorId: flow[userId].colaboradorId });

        // Calcular la deuda pendiente
        const deudaPendiente = ventas.reduce((sum, venta) => sum + venta.montoTotal, 0) - 
        cobrosExistentes.reduce((sum, cobro) => sum + cobro.montoPagado, 0);

        flow[userId].deudaPendiente = deudaPendiente;

        console.log(`Deuda pendiente para el colaborador ${colaboradorName}: ${deudaPendiente}`);

        return res.json({ reply: `Colaborador ${colaboradorName} encontrado. ¿Cuál es el monto pagado? (Deuda pendiente: ${deudaPendiente})` });
      } catch (error) {
        console.error('Error al buscar colaborador:', error);
        return res.status(500).json({ message: 'Error al buscar el colaborador.' });
      }
    }
    
    // Paso 2: Esperar montoPagado y validar si no excede la deuda pendiente
    if (flow[userId].step === 'waitingForMonto') {
      // Verificar que flow[userId] esté completamente inicializado
      if (!flow[userId] || !flow[userId].colaboradorId || typeof flow[userId].deudaPendiente !== 'number') {
        return res.json({ reply: 'Error en el flujo de trabajo. Faltan datos esenciales como el colaborador o la deuda pendiente.' });
      }
      
      const montoPagado = parseFloat(message);
      if (isNaN(montoPagado) || montoPagado <= 0) {
        return res.json({ reply: 'Por favor, ingresa un monto válido (un número mayor a cero).' });
      }
      
      // Verificar si el monto excede la deuda pendiente
      if (montoPagado > flow[userId].deudaPendiente) {
        return res.json({ 
          reply: `El monto pagado (${montoPagado}) excede la deuda pendiente (${flow[userId].deudaPendiente}). No se puede registrar este cobro.`
        });
      }
      
      // Si el monto es válido, proceder a agregar el cobro
      flow[userId].montoPagado = montoPagado;
      flow[userId].estadoPago = 'parcial'; // Si deseas cambiar esto a 'total' según algún criterio, puedes hacerlo
      const newCobro = {
        userId: userId,
        colaboradorId: flow[userId].colaboradorId,
        montoPagado: flow[userId].montoPagado,
        estadoPago: flow[userId].estadoPago
      };
      console.log(`Flujo agregar cobro para ${userId}: montoPagado recibido (${message}). Cobro:`, newCobro);
      
      try {
        await createCobro(userId, newCobro);  // Pasamos el userId y el objeto nuevo
        
        // Usar el nombre del colaborador en lugar de su ID para el mensaje de confirmación
        const nombreColaborador = flow[userId].colaboradorNombre;
        delete flow[userId];
        return res.json({ reply: `Cobro para el colaborador ${nombreColaborador} creado exitosamente.` });
      } catch (error) {
        console.error('Error al crear cobro:', error);
        return res.status(500).json({ message: 'Error al crear el cobro.' });
      }
    }
  }

  // Detecta intenciones para agregar cobro (sin distinguir mayúsculas/minúsculas)
  if (/(agregar|registrar|añadir|sumar).*(cobro|cobro\s+#\d+|cobro\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'cobro_add', step: 'waitingForColaboradorId' };
    console.log(`Inicio del flujo para agregar cobro para ${userId}`);
    console.log(`Estado de sesión actualizado:`, flow[userId]);
    return res.json({ reply: '¿Cuál es el nombre del colaborador para el cobro?' });
  }

  // Flujo para eliminar cobro (por colaborador)
  if (flow[userId] && flow[userId].flowType === 'cobro_delete') {
    // Paso 1: Esperar el nombre del colaborador
    if (flow[userId].step === 'waitingForColaboradorNameToDelete') {
      const colaboradorName = message.trim();
      
      // Validar si el nombre del colaborador es válido
      if (!colaboradorName) {
        return res.json({ reply: 'El nombre proporcionado no es válido. Por favor, verifica el nombre del colaborador.' });
      }

      try {
        // Buscar el colaborador por nombre
        const colaborador = await require('../models/Colaborador').findOne({
          nombre: new RegExp('^' + colaboradorName + '$', 'i')
        });

        if (!colaborador) {
          return res.json({ reply: `No se encontró colaborador con el nombre ${colaboradorName}.` });
        }

      // Buscar los 5 cobros más recientes asociados al colaborador
      const cobros = await require('../models/Cobro').find({ colaboradorId: colaborador._id })
        .sort({ createdAt: -1 }) // Ordena los cobros por fecha de creación, de más reciente a más antiguo
        .limit(5); // Limita los resultados a los 5 cobros más recientes

        

        if (cobros.length === 0) {
          return res.json({ reply: `No se encontraron cobros para el colaborador ${colaboradorName}.` });
        }

        // Almacena el _id del colaborador y los cobros en el flujo para el siguiente paso
        flow[userId].colaboradorId = colaborador._id;
        flow[userId].cobros = cobros;
        console.log("Cobros disponibles:", flow[userId].cobros);

        // Actualizamos el flujo para que el siguiente paso sea esperar el índice del cobro
        flow[userId].step = 'waitingForCobroIndexToDelete';

        // Construir un mensaje mostrando los cobros encontrados
        let listado = 'Se encontraron los siguientes cobros:\n';
        cobros.forEach((cobro, index) => {
          listado += `${index + 1}. Monto: ${cobro.montoPagado}, Estado: ${cobro.estadoPago}\n`;
        });
        listado += 'Por favor, ingresa el número del cobro que deseas eliminar.';
        
        return res.json({ reply: listado });
      } catch (error) {
        console.error('Error al buscar cobros por colaborador:', error);
        return res.status(500).json({ message: 'Error al buscar cobros.' });
      }
    }

    // Paso 2: Esperar el número del cobro a eliminar
    if (flow[userId].step === 'waitingForCobroIndexToDelete') {
      const index = parseInt(message, 10) - 1; // El usuario ingresa un número basado en 1, pero los índices son basados en 0

      console.log("Índice calculado:", index);

      // Validar que el índice esté dentro del rango de cobros disponibles
      if (isNaN(index) || index < 0 || index >= flow[userId].cobros.length) {
        return res.json({ reply: 'Número inválido. Por favor, ingresa un número válido de la lista mostrada.' });
      }

      // Obtener el cobro a eliminar
      const cobroToDelete = flow[userId].cobros[index];

      try {
        // Eliminar el cobro seleccionado utilizando la función deleteCobro
        await deleteCobro(userId, cobroToDelete._id);
        
        // Limpiar el flujo del usuario
        delete flow[userId];

        // Responder al usuario con el éxito de la eliminación
        return res.json({ reply: `Cobro con monto ${cobroToDelete.montoPagado} eliminado exitosamente.` });
      } catch (error) {
        console.error('Error al eliminar cobro seleccionado:', error);
        return res.status(500).json({ message: 'Error al eliminar el cobro seleccionado.' });
      }
    }
  }

  // Si el usuario envía "eliminar cobro" y no hay flujo activo
  if (/(eliminar|borrar|suprimir|quitar).*(cobro|cobro\s+#\d+|cobro\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'cobro_delete', step: 'waitingForColaboradorNameToDelete' };
    console.log(`Inicio del flujo para eliminar cobro para ${userId}`);
    console.log(`Estado de sesión actualizado:`, flow[userId]);
    return res.json({ reply: 'Por favor, indica el nombre del colaborador para el cobro que deseas eliminar.' });
  }

  // Flujo para actualizar cobro (por colaborador)
  if (flow[userId] && flow[userId].flowType === 'cobro_update') {
    // Paso 1: Esperar nombre del colaborador del cobro a actualizar
    if (flow[userId].step === 'waitingForColaboradorNameToUpdate') {
      if (message.trim()) {
        flow[userId].colaboradorName = message.trim();
        flow[userId].step = 'waitingForCobroField';
        console.log(`Flujo actualizar cobro para ${userId}: nombre recibido (${message}).`);
        return res.json({ reply: '¿Qué campo deseas actualizar? (monto or estado)' });
      } else {
        return res.json({ reply: 'Por favor, ingresa un nombre válido de colaborador.' });
      }
    }
    // Paso 2: Esperar el campo a actualizar
    if (flow[userId].step === 'waitingForCobroField') {
      const field = message.toLowerCase();
      if (field === 'monto' || field === 'estado') {
        flow[userId].updateField = field;
        flow[userId].step = 'waitingForCobroNewValue';
        console.log(`Flujo actualizar cobro para ${userId}: campo recibido (${message}).`);
        return res.json({ reply: `Dime el nuevo valor para ${field} del cobro.` });
      } else {
        return res.json({ reply: 'El campo a actualizar debe ser "monto" o "estado".' });
      }
    }
    // Paso 3: Esperar el nuevo valor y actualizar
    if (flow[userId].step === 'waitingForCobroNewValue') {
      let newValue;
      if (flow[userId].updateField === 'monto') {
        if (validateCobroMonto(message)) {
          newValue = parseFloat(message);
        } else {
          return res.json({ reply: 'Por favor, ingresa un monto válido.' });
        }
      }
      if (flow[userId].updateField === 'estado') {
        if (validateCobroEstado(message)) {
          newValue = message.toLowerCase();
        } else {
          return res.json({ reply: 'El estado debe ser "parcial" o "total".' });
        }
      }
      try {
        // Nota: Se debe crear en el servicio una función que encuentre y actualice el cobro en base al nombre del colaborador.
        await updateCobroByColaborador(flow[userId].colaboradorName, { 
          [flow[userId].updateField === 'monto' ? 'montoPagado' : 'estadoPago']: newValue 
        });
        delete flow[userId];
        return res.json({ reply: `Cobro para el colaborador ${flow[userId].colaboradorName} actualizado exitosamente.` });
      } catch (error) {
        console.error('Error al actualizar cobro:', error);
        return res.status(500).json({ message: 'Error al actualizar el cobro.' });
      }
    }
  }

  if (message.toLowerCase().includes('actualizar cobro')) {
    flow[userId] = { flowType: 'cobro_update', step: 'waitingForColaboradorNameToUpdate' };
    console.log(`Inicio del flujo para actualizar cobro para ${userId}`);
    console.log(`Estado de sesión actualizado:`, flow[userId]);
    return res.json({ reply: 'Indica el nombre del colaborador cuyo cobro deseas actualizar.' });
  }

// Si el usuario solicita consultar los cobros (por ejemplo: "consultar cobro", "qué cobros tenemos", etc.)
  if (/(consultar|mostrar|ver|verificar|que).*cobros?(.*)/i.test(message)) {
    try {
      const userId = req.user.id;  // El userId debería estar disponible después del middleware de autenticación

      const cobros = await getCobros(userId);
      if (cobros.length === 0) {
        return res.json({ reply: 'No hay cobros registrados.' });
      }
      // Para cada cobro, se obtiene el nombre del colaborador correspondiente.
      const resumenArray = await Promise.all(
        cobros.map(async (cobro) => {
          const colaborador = await require('../models/Colaborador').findById(cobro.colaboradorId);
          const nombreColaborador = colaborador ? colaborador.nombre : 'Desconocido';
          return `Colaborador: ${nombreColaborador} - Cobro: ${cobro.montoPagado} (Estado: ${cobro.estadoPago})`;
        })
      );
      return res.json({ reply: `Cobros registrados: ${resumenArray.join(', ')}` });
    } catch (error) {
      console.error('Error al obtener cobros:', error);
      return res.status(500).json({ message: 'Error al obtener los cobros.' });
    }
  }

  // ************** INTENCIONES SIN FLUJO ACTIVO **************
  // Si el usuario quiere agregar producto
  if (/(agregar|añadir|sumar|incorporar).*(producto|producto\s+#\d+|producto\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'agregar', step: 'waitingForProductName' };
    console.log(`Inicio del flujo para agregar producto para ${userId}`);
    console.log(`Estado de sesión actualizado:`, flow[userId]);
    return res.json({ reply: '¿Qué producto deseas agregar?' });
  }
  
  // Si el usuario quiere eliminar producto
  if (/(eliminar|borrar|suprimir|quitar).*(producto|producto\s+#\d+|producto\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'eliminar', step: 'waitingForProductNameToDelete' };
    console.log(`Inicio del flujo para eliminar producto para ${userId}`);
    console.log('Estado de sesión actualizado:', flow[userId]);
    return res.json({ reply: 'Por favor, indica el nombre del producto que deseas eliminar.' });
  }

  if (/(inventario|productos\s+disponibles|existencias|artículos\s+en\s+stock|qué\s+(tenemos|hay\s+en\s+el\s+inventario))/i.test(message)) {
  try {
      const userId = req.user.id;  // El userId debería estar disponible después del middleware de autenticación

      const productos = await getProductos(userId);
      if (!productos.length) {
        return res.json({ reply: 'El inventario está vacío.' });
      }
      // Construir un listado formateado, con cada producto en una línea separada
      const listado = productos
        .map(prod => `- ${prod.nombre}: ${prod.cantidadRestante} unidades a ${prod.precio} c/u`)
        .join('\n');
      return res.json({ reply: `Inventario Disponible:\n${listado}` });
    } catch (error) {
      console.error('Error al obtener inventario:', error);
      return res.status(500).json({ message: 'Error al obtener el inventario.' });
    }
  }

  // PUNTO DE INICIO: Si el usuario envía un mensaje que contenga "vender" o "registrar venta"
  if (/(vender|registrar|realizar|hacer|agregar).*(venta|venta\s+#\d+|venta\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'venta_add', step: 'waitingForVentaColaboradorName' };
    console.log(`Inicio del flujo para registrar venta para ${userId}`);
    console.log(`Estado de sesión actualizado:`, flow[userId]);
    return res.json({ reply: 'Por favor, indica el nombre del colaborador para la venta.' });
  }

  // FLUJO PARA REGISTRAR VENTA
  if (flow[userId] && flow[userId].flowType === 'venta_add') {
// Paso 1: Esperar el nombre del colaborador
if (flow[userId].step === 'waitingForVentaColaboradorName') {
  const colaboradorName = message.trim();
  if (!colaboradorName) {
    return res.json({ reply: 'Por favor, ingresa un nombre válido de colaborador.' });
  }
  try {
    const colaborador = await require('../models/Colaborador').findOne({
      nombre: new RegExp('^' + colaboradorName + '$', 'i')
    });
    if (!colaborador) {
      return res.json({ reply: `No se encontró colaborador con el nombre ${colaboradorName}.` });
    }
    flow[userId].colaboradorId = colaborador._id;

    // Aquí pasamos el userId a la función getProductos
    const productos = await getProductos(userId);  // Modificación: agregar userId

    // Filtrar productos con stock disponible
    const productosDisponibles = productos.filter(prod => prod.cantidadRestante > 0);
    
    if (productosDisponibles.length === 0) {
      return res.json({ reply: 'El inventario está vacío. No se puede proceder con la venta.' });
    }
    flow[userId].productos = productos;
    flow[userId].step = 'waitingForVentaProductSelection';

    // Construir mensaje con el listado de productos
    let listado = 'Productos disponibles:\n';
    productos.forEach((prod, index) => {
      listado += `${index + 1}. ${prod.nombre} - Precio: ${prod.precio}, Disponibles: ${prod.cantidadRestante}\n`;
    });
    listado += 'Por favor, selecciona el producto que deseas vender (ingresa el número correspondiente).';
    return res.json({ reply: listado });
  } catch (error) {
    console.error('Error al buscar colaborador:', error);
    return res.status(500).json({ message: 'Error al buscar el colaborador.' });
  }
}
    
    // Paso 2: Esperar la selección del producto
    if (flow[userId].step === 'waitingForVentaProductSelection') {
      const index = parseInt(message, 10) - 1;
      if (isNaN(index) || index < 0 || index >= flow[userId].productos.length) {
        return res.json({ reply: 'Selección inválida. Por favor, ingresa un número correspondiente a uno de los productos.' });
      }
      const productoSeleccionado = flow[userId].productos[index];

            // Verificar stock actual
      const productoActual = await Producto.findById(productoSeleccionado._id);
      if (!productoActual || productoActual.cantidadRestante <= 0) {
        return res.json({ reply: 'Lo sentimos, este producto ya no tiene stock disponible.' });
      }

      flow[userId].productoId = productoSeleccionado._id;
      flow[userId].productoPrecio = productoSeleccionado.precio;
      flow[userId].productoStock = productoSeleccionado.cantidad;
      flow[userId].step = 'waitingForVentaQuantity';
      return res.json({ reply: `Has seleccionado ${productoSeleccionado.nombre}. ¿Cuántas unidades deseas vender? (Disponibles: ${productoSeleccionado.cantidadRestante})` });
    }

// Paso 3: Esperar la cantidad a vender y registrar la venta
if (flow[userId].step === 'waitingForVentaQuantity') {
  const cantidad = parseInt(message, 10);
  
  // Verificación de cantidad válida
  if (isNaN(cantidad) || cantidad <= 0) {
    return res.json({ reply: 'Por favor, ingresa una cantidad válida (un número mayor a cero).' });
  }

  // Verificar si el producto existe
  const producto = await Producto.findById(flow[userId].productoId);
  if (!producto) {
    return res.status(404).json({ reply: 'Producto no encontrado en el inventario.' });
  }

  // Verificar si hay suficiente stock antes de proceder
  if (cantidad > producto.cantidadRestante) {
    return res.json({ 
      reply: `No hay suficiente stock. Solo quedan ${producto.cantidadRestante} unidades disponibles.` 
    });
  }

  // Actualizar el inventario del producto primero
  producto.cantidadVendida += cantidad; // Incrementar la cantidad vendida
  producto.cantidadRestante -= cantidad; // Decrementar la cantidad restante

  // Verificación de los valores después de actualizar el inventario
  if (isNaN(producto.cantidadRestante) || isNaN(producto.cantidadVendida)) {
    return res.json({ reply: 'Error en la actualización de inventario. Verifique los valores.' });
  }

  try {
    await producto.save(); // Guardar los cambios en el inventario

    // Calcular el monto total
    const montoTotal = flow[userId].productoPrecio * cantidad;

    // Crear la venta después de actualizar el inventario
    const newVenta = {
      userId: userId,
      colaboradorId: flow[userId].colaboradorId,
      productoId: flow[userId].productoId,
      cantidad: cantidad,
      montoTotal: montoTotal,
      estadoPago: "Pendiente"
    };

    console.log(`Flujo registrar venta para ${userId}: venta creada:`, newVenta);

    const { createVenta } = require('../services/ventaService');

    // Crear la venta en la base de datos
    await createVenta(newVenta);

    delete flow[userId]; // Limpiar el flujo
    return res.json({ reply: `Venta registrada exitosamente. Monto total: ${montoTotal}.` });
  } catch (error) {
    console.error('Error al registrar venta:', error);
    return res.status(500).json({ message: 'Error al registrar la venta.' });
  }
}
  }

  // Inicia el flujo si el mensaje contiene "eliminar venta"
  if (/(eliminar|borrar|suprimir|quitar).*(venta|venta\s+#\d+|venta\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'venta_delete', step: 'waitingForVentaColaboradorNameToDelete' };
    console.log(`Inicio del flujo para eliminar venta para ${userId}`);
    return res.json({ reply: 'Por favor, indica el nombre del colaborador de la venta que deseas eliminar.' });
  }

  // FLUJO PARA ELIMINAR VENTA
  if (flow[userId] && flow[userId].flowType === 'venta_delete') {
    // Paso 1: Esperar el nombre del colaborador
    if (flow[userId].step === 'waitingForVentaColaboradorNameToDelete') {
      const colaboradorName = message.trim();
      if (!colaboradorName) {
        return res.json({ reply: 'Por favor, ingresa un nombre válido de colaborador.' });
      }
      try {
        const Colaborador = require('../models/Colaborador');
        const colaborador = await Colaborador.findOne({
          nombre: new RegExp('^' + colaboradorName + '$', 'i')
        });
        if (!colaborador) {
          return res.json({ reply: `No se encontró colaborador con el nombre ${colaboradorName}.` });
        }
        
      // Modificación aquí para filtrar por colaboradorId en lugar de userId
      const ventas = await Venta.find({ colaboradorId: colaborador._id }) // Cambiado a `colaboradorId`
        .populate('colaboradorId', 'nombre')
        .populate('productoId', 'nombre precio')
        .sort({ createdAt: -1 })  
        .limit(5);  // Limitamos los resultados a los 5 primeros
        
        if (ventas.length === 0) {
          return res.json({ reply: `No se encontraron ventas para el colaborador ${colaboradorName}.` });
        }
  
        flow[userId].colaboradorId = colaborador._id;
        flow[userId].ventas = ventas;
        flow[userId].step = 'waitingForVentaIndexToDelete';
        
        let listado = 'Se encontraron las siguientes ventas:\n';
        ventas.forEach((venta, index) => {
          listado += `${index + 1}. Producto: ${venta.productoId.nombre}, Cantidad: ${venta.cantidad}, MontoTotal: ${venta.montoTotal}, Estado: ${venta.estadoPago}\n`;
        });
        listado += 'Por favor, ingresa el número de la venta que deseas eliminar.';
        
        return res.json({ reply: listado });
  
      } catch (error) {
        console.error('Error al buscar ventas:', error);
        return res.status(500).json({ message: 'Error al obtener las ventas del colaborador.' });
      }
    }

    // Paso 2: Esperar la selección de la venta a eliminar
    if (flow[userId].step === 'waitingForVentaIndexToDelete') {
      const index = parseInt(message, 10) - 1;
      if (isNaN(index) || index < 0 || index >= flow[userId].ventas.length) {
          return res.json({ reply: 'Selección inválida. Por favor, ingresa un número válido.' });
      }
      const ventaToDelete = flow[userId].ventas[index];
      try {
          const { deleteVenta } = require('../services/ventaService');
          const Producto = require('../models/Producto');

          // Buscar el producto relacionado con la venta
          const producto = await Producto.findById(ventaToDelete.productoId);
          if (!producto) {
              return res.status(404).json({ reply: 'Producto relacionado con la venta no encontrado.' });
          }

          // Actualizar el inventario del producto
          producto.cantidadVendida -= ventaToDelete.cantidad; // Restar la cantidad vendida
          producto.cantidadRestante = producto.cantidad - producto.cantidadVendida; // Recalcular la cantidad restante
          await producto.save(); // Guardar los cambios en el producto

          // Eliminar la venta
          await deleteVenta(ventaToDelete._id);


        // Usar global.io en lugar de req.io
        if (global.io) {
          global.io.emit('ventaActualizada');
        }


          delete flow[userId];
          return res.json({ reply: 'Venta eliminada exitosamente y el inventario actualizado.' });
      } catch (error) {
          console.error('Error al eliminar venta:', error);
          return res.status(500).json({ message: 'Error al eliminar la venta.' });
      }
    }
  }
  
  // Inicia el flujo si el mensaje contiene "actualizar venta"
  if (/(actualizar|modificar|editar|cambiar).*(venta|venta\s+#\d+|venta\s+de\s+[a-zA-Z0-9]+)/i.test(message)) {
    flow[userId] = { flowType: 'venta_update', step: 'waitingForVentaColaboradorNameToUpdate' };
    console.log(`Inicio del flujo para actualizar venta para ${userId}`);
    return res.json({ reply: 'Por favor, indica el nombre del colaborador de la venta que deseas actualizar.' });
  }

  // FLUJO PARA ACTUALIZAR VENTA
  if (flow[userId] && flow[userId].flowType === 'venta_update') {
    // Paso 1: Esperar el nombre del colaborador
    if (flow[userId].step === 'waitingForVentaColaboradorNameToUpdate') {
        const colaboradorName = message.trim();
        if (!colaboradorName) {
            return res.json({ reply: 'Por favor, ingresa un nombre válido de colaborador.' });
        }
        try {
            const Colaborador = require('../models/Colaborador');
            const colaborador = await Colaborador.findOne({
                nombre: new RegExp('^' + colaboradorName + '$', 'i')
            });
            if (!colaborador) {
                return res.json({ reply: `No se encontró colaborador con el nombre ${colaboradorName}.` });
            }
            
      // Modificación aquí para filtrar por colaboradorId en lugar de userId
      const ventas = await Venta.find({ colaboradorId: colaborador._id }) // Cambiado a `colaboradorId`
        .populate('colaboradorId', 'nombre')
        .populate('productoId', 'nombre precio')
        .sort({ createdAt: -1 })
        .limit(5);  

            if (ventas.length === 0) {
                return res.json({ reply: `No se encontraron ventas para el colaborador ${colaboradorName}.` });
            }
            
            flow[userId].colaboradorId = colaborador._id;
            flow[userId].ventas = ventas;
            flow[userId].step = 'waitingForVentaIndexToUpdate';
            
            let listado = `Ventas registradas para ${colaboradorName}:\n\n`;
            ventas.forEach((venta, index) => {
                listado += `${index + 1}. ───────────────────\n`;
                listado += `   Producto: ${venta.productoId.nombre}\n`;
                listado += `   Cantidad: ${venta.cantidad} unidades\n`;
                listado += `   Precio total: $${venta.montoTotal}\n`;
                listado += `   Estado: ${venta.estadoPago}\n`;
            });
            listado += '\nPor favor, ingresa el número de la venta que deseas actualizar.';
            
            return res.json({ reply: listado });
        } catch (error) {
            console.error('Error al buscar ventas:', error);
            return res.status(500).json({ message: 'Error al obtener las ventas del colaborador.' });
        }
    }

    // Paso 2: Esperar la selección de la venta a actualizar
    if (flow[userId].step === 'waitingForVentaIndexToUpdate') {
        const index = parseInt(message, 10) - 1;
        if (isNaN(index) || index < 0 || index >= flow[userId].ventas.length) {
            return res.json({ reply: 'Selección inválida. Por favor, ingresa un número válido.' });
        }
        flow[userId].ventaToUpdate = flow[userId].ventas[index];
        flow[userId].step = 'waitingForVentaUpdateField';
        return res.json({ reply: '¿Qué campo deseas actualizar? (cantidad o estadoPago)' });
    }

    // Paso 3: Esperar el campo a actualizar
    if (flow[userId].step === 'waitingForVentaUpdateField') {
        const field = message.toLowerCase();
        if (field !== 'cantidad' && field !== 'estadopago') {
            return res.json({ reply: 'El campo a actualizar debe ser "cantidad" o "estadoPago".' });
        }
        
        flow[userId].updateField = field;
        flow[userId].step = 'waitingForVentaNewValue';

        if (field === 'cantidad') {
            const producto = await Producto.findById(flow[userId].ventaToUpdate.productoId);
            const cantidadDisponible = producto.cantidad - producto.cantidadVendida + flow[userId].ventaToUpdate.cantidad;
            return res.json({ 
                reply: `Ingresa la nueva cantidad (Stock disponible: ${cantidadDisponible} unidades).` 
            });
        }
        
        return res.json({ reply: `Ingresa el nuevo valor para ${field}.` });
    }

// Paso 4: Esperar el nuevo valor y actualizar la venta
if (flow[userId].step === 'waitingForVentaNewValue') {
  try {
    const ventaActual = flow[userId].ventaToUpdate;
    const updateField = flow[userId].updateField; // Guardar el campo antes de eliminar el flow
    let newValue;
    
    if (flow[userId].updateField === 'cantidad') {
      newValue = parseInt(message, 10);
      if (isNaN(newValue) || newValue <= 0) {
        return res.json({ reply: 'Por favor, ingresa una cantidad válida (número mayor a 0).' });
      }
      
      // Obtener el producto para verificar stock
      const producto = await Producto.findById(ventaActual.productoId);
      if (!producto) {
        return res.status(404).json({ reply: 'Producto no encontrado.' });
      }
      
      // Calcular stock disponible considerando la venta actual
      const stockDisponible = producto.cantidad + ventaActual.cantidad - producto.cantidadVendida;
      if (newValue > stockDisponible) {
        return res.json({
          reply: `No hay suficiente stock. Solo hay ${stockDisponible} unidades disponibles.`
        });
      }
      
      // Actualizar la venta usando el servicio (que ahora maneja toda la lógica)
      const { updateVentaC } = require('../services/ventaService');
      const updatedVentaC = await updateVentaC(ventaActual._id, {
        cantidad: newValue
      }, userId);
      
      console.log("Venta actualizada:", updatedVentaC);
      
      // Asegúrate de que la venta también esté siendo devuelta correctamente
      if (!updatedVentaC) {
        return res.status(500).json({ reply: 'Error al actualizar la venta.' });
      }
    } else if (flow[userId].updateField === 'estadopago') {
      const allowed = ["pendiente", "pagado", "parcial"];
      if (!allowed.includes(message.toLowerCase())) {
        return res.json({ reply: 'El estado debe ser "Pendiente", "Pagado" o "Parcial".' });
      }
      newValue = message.charAt(0).toUpperCase() + message.slice(1).toLowerCase();
      
      // Actualizar solo el estado usando el servicio
      const { updateVentaC } = require('../services/ventaService');
      const updatedVentaC = await updateVentaC(ventaActual._id, { 
        estadoPago: newValue 
      }, userId);
      
      if (!updatedVentaC) {
        return res.status(500).json({ reply: 'Error al actualizar la venta.' });
      }
    }
    
    // Primero construir el mensaje de respuesta
    const responseMessage = `Venta actualizada exitosamente.\nNuevo valor de ${updateField}: ${newValue}`;
    
    // Luego eliminar el flow
    delete flow[userId];
    
    // Finalmente enviar la respuesta
    return res.json({ reply: responseMessage });
    
  } catch (error) {
    console.error('Error al actualizar venta:', error);
    return res.status(500).json({ reply: `Error al actualizar la venta: ${error.message}` });
  }
}
  }

  if (/(consultar|mostrar|ver|verificar|que).*ventas?(.*)/i.test(message)) {
    try {
      const ventas = await getVentas(userId);
      if (ventas.length === 0) {
        return res.json({ reply: 'No hay ventas registradas.' });
      }
      // Para cada venta, se obtiene el nombre del colaborador y del producto correspondiente.
      const resumenArray = await Promise.all(
        ventas.map(async (venta) => {
          const colaborador = await require('../models/Colaborador').findById(venta.colaboradorId);
          const producto = await require('../models/Producto').findById(venta.productoId);
          const nombreColaborador = colaborador ? colaborador.nombre : 'Desconocido';
          const nombreProducto = producto ? producto.nombre : 'Producto Desconocido';
          return `Colaborador: ${nombreColaborador} - Producto: ${nombreProducto} - Cantidad: ${venta.cantidad} - MontoTotal: ${venta.montoTotal} (Estado: ${venta.estadoPago})`;
        })
      );
      return res.json({ reply: `Ventas registradas: ${resumenArray.join(', ')}` });
    } catch (error) {
      console.error('Error al obtener ventas:', error);
      return res.status(500).json({ message: 'Error al obtener las ventas.' });
    }
  }

  // Caso por defecto: si no se reconoce la intención, usar OpenAI para responder
  try {
    const botReply = await interactWithOpenAI(message);
    return res.json({ reply: botReply });
  } catch (error) {
    console.error('Error en interactWithOpenAI:', error);
    return res.status(500).json({ message: 'Error al procesar el mensaje del Chatbot.' });
  }
});




module.exports = router;