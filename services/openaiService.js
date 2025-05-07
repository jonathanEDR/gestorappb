const axios = require('axios');

// Asegúrate de que la variable esté definida en el .env
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('La API Key de OpenAI no está definida.');
  process.exit(1);
}

const interactWithOpenAI = async (message) => {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',  // Usa la URL para ChatGPT en lugar de "completions"
      {
        model: 'gpt-3.5-turbo',  // Actualiza el modelo a uno más reciente
        messages: [{ role: 'user', content: message }],  // La estructura de la solicitud para chat completions
        max_tokens: 50,
        temperature: 0.7,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        }
      }
    );
    
    if (response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content.trim();  // Extrae la respuesta del chatbot
    } else {
      throw new Error('No se recibió respuesta de OpenAI');
    }
  } catch (error) {
    console.error('Error en interactWithOpenAI:', error.response ? error.response.data : error.message);
    throw error;
  }
};

module.exports = { interactWithOpenAI };