const mongoose = require("mongoose");

const ventaSchema = new mongoose.Schema({
  userId: {
    type: String,  // Asociar al ID del usuario autenticado
    required: true,
  },
  
  colaboradorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Colaborador', // Nombre del modelo de colaboradores
    required: true,
  },
  productoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto', // Nombre del modelo de productos
    required: true,
  },
  cantidad: { type: Number, required: true },
  montoTotal: { type: Number, required: true },
  estadoPago: {
    type: String,
    enum: ["Pendiente", "Pagado", "Parcial"],
    required: true,
  },
  cantidadPagada: { type: Number, default: 0 },
  debe: { type: Number, default: function() { return this.montoTotal - this.cantidadPagada; } }, // Calcular la deuda pendiente

  fechadeVenta: {
    type: Date,
    default: Date.now,  // Establecer fecha por defecto
  },

  cantidadDevuelta: {
    type: Number,
    default: 0,
    min: 0
  }

  },
  {
  timestamps: true, // Esto agrega createdAt y updatedAt automáticamente
  }
  );

// Validación adicional para estadoPago "Parcial"
ventaSchema.pre("save", function (next) {
  if (this.estadoPago === "Parcial" && this.cantidadPagada <= 0) {
    return next(
      new Error(
        "La cantidad pagada debe ser mayor a cero cuando el estado es Parcial"
      )
    );
  }
  next();
});

const Venta = mongoose.model("Venta", ventaSchema);

module.exports = Venta;
