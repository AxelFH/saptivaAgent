const axios = require('axios');

// Static Configuration
const MODEL = "LLaMa3.1 70B";
const API_ENDPOINT = "https://api.saptiva.com/apilab/soc";
const BEARER_TOKEN = process.env.LLAMA_API_TOKEN; // Use an environment variable to securely store the token

/**
 * Generate a response using LLaMa3.1 70B with context management
 * @param {String} dynamicContext - A brief description of the current state
 * @param {String} userMessage - The latest user message
 * @returns {String} Assistant's response
 */
const getLLaMaResponse = async (dynamicContext, userMessage) => {
    try {
        // Combine system prompt, context, and user input
        const sysPrompt = `
        Eres el agente de banco de SAPTIBANK.
        Un agente de IA preparado para apoyar a los clientes a:
        - Reponer, Bloquear Reportar y solicitar nuevas tarjetas del banco Saptibank.
        - También puedes ayudar a tus clientes a cotizar créditos (de cualquier producto, no necesariamente maquinas o vehiculos).

        Si un cliente/usuario te pregunta algo no relacionado, no contestes su pregunta y amablemente indicale que tu funcionalidad no es la de un chatbot universal.

        Cuando se te de la instrucción de responder con un JSON, no incluyas ningún mensaje o titulos extra, tu respuesta sera parseada directamente. 

        Ejemplo erroneo:
        json
        {
        "action": "cotizar",
        "message": "Entiendo que deseas cotizar un crédito."
        }
        
        Ejemplo erroneo 2:
        Si desea consultar el estatus de un reporte de tarjeta robada o bloqueada, por favor intente la siguiente acción:
        {
        "action": "consultar_reporte"
        }

        Ejemplo correcto:
        {
        "action": "consultar_reporte",
        "message": "Entiendo que quieres consultar el estatus de un reporte de tarjeta robada."
        }

        Si no se te pide que contestes en formato JSON o si no se cumplen los requerimientos para que contestes en formato JSON, puedes contestar naturalmente`;

        // Make API request
        const payload = {
            modelName: MODEL,
            newTokens: 1024,
            sysPrompt: sysPrompt + `\nContexto actual: ${dynamicContext}`,
            text: "",
            userMessage: userMessage
        };

        const response = await axios.post(API_ENDPOINT, payload, {
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.response; // Assuming the response format includes a `response` field
    } catch (error) {
        console.error('Error with LLaMa API:', error.response ? error.response.data : error.message);
        throw new Error('Failed to generate a response.');
    }
};

module.exports = {
    getLLaMaResponse
};
