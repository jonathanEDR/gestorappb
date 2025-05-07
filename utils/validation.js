const validatePrice = (price) => {
  const numPrice = parseFloat(price);
  return !isNaN(numPrice) && numPrice > 0;
};

const validateQuantity = (quantity) => {
  const numQuantity = parseInt(quantity, 10);
  return !isNaN(numQuantity) && numQuantity > 0;
};

const validateProductName = (name) => {
  return typeof name === 'string' && name.trim().length > 0;
};

module.exports = { validateProductName, validateQuantity, validatePrice };
