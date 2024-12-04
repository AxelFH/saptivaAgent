const axios = require('axios');
const { getRecentMessages } = require('../controllers/webhook.controller'); // Import getRecentMessages

// Static Configuration
const openaiApiKey = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4o";

const SYSTEM_PROMPT = `
Eres el asistente IA de Banorte
Un agente de IA preparado para apoyar a los clientes del banco Banorte a realizar diferentes operaciones.

Si un cliente/usuario te pregunta algo no relacionado, contesta su pregunta y amablemente regresa al flujo.
Cuando se te de la instrucción de responder con un JSON, no incluyas ningún mensaje o titulos extra, symbolos o texto. Tu respuesta sera parseada directamente. Dispones de los ultimos 5 mensajes que intercambiaste con el usuario, pudedes utilizar esa información como contexto.

Ejemplo erroneo de respuesta:
json
{
  "action": "",
  "message": ""
}

Correcto:
{
  "action": "",
  "message": ""
}

Cuando pidas información del cliente, intenta no abrumarlo, no le pidas toda la información de golpe.
`;

const DEFAULT_SETTINGS = {
    temperature: 0.7,
    max_tokens: 200,
    top_p: 1.0,
    frequency_penalty: 0,
    presence_penalty: 0
};

/**
 * Generate a response using OpenAI with context management
 * @param {String} convoId - Conversation ID to fetch recent messages
 * @param {String} dynamicContext - A brief description of the current state
 * @param {String} userMessage - The latest user message
 * @returns {String} Assistant's response
 */
const getOpenAIResponse = async (dynamicContext, userMessage, convoId) => {
    try {
        // Fetch recent messages from the database
        const recentMessages = await getRecentMessages(convoId);

        // Format recent messages into conversation history
        const conversationHistory = recentMessages
            .map(msg => `${msg.Origin === 'User' ? 'Usuario' : 'Bot'}: ${msg.Message}`)
            .join('\n');

        // Combine system prompt, recent messages, dynamic context, and user input
        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "system", content: `Historial de conversación (Últimos 5 mensajes):\n${conversationHistory}` },
            { role: "system", content: `Contexto actual: ${dynamicContext}` },
            { role: "user", content: userMessage }
        ];

        // Make API request
        const payload = {
            model: MODEL,
            messages: messages,
            ...DEFAULT_SETTINGS
        };

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const timestamp = new Date().toISOString(); // Current timestamp in ISO format


        let content = response.data.choices[0].message.content;

        // Check if the string contains "json" and remove it if it does
        if (content.includes("json")) {
            content = content.replace(/json/g, ''); // Removes all occurrences of "json"
        }

        console.log({ messages, convoId, content, timestamp });

        return content;
    } catch (error) {
        console.error('Error with OpenAI API:', error.response ? error.response.data : error.message);
        throw new Error('Failed to generate a response.');
    }
};

module.exports = {
    getOpenAIResponse
};
