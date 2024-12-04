const axios = require('axios');
const FormData = require('form-data');
const pool = require('../configs/db');
const { saveMessage } = require('../controllers/webhook.controller')

const accessToken = process.env.WHATS_LONG_TOKEN;

const sendWhatsMessage = async (phonNumId, data) => {
  const config = (phonNumId, data) => {
    return {
      method: 'post',
      maxBodyLength: Infinity,
      url: `https://graph.facebook.com/v13.0/${phonNumId}/messages?access_token=${accessToken}`,
      headers: {
        'Content-Type': 'application/json'
      },
      data
    };
  };

  try {
    // Send the message to the WhatsApp API
    await axios(config(phonNumId, data));

    // Save the bot's message to the database
    if (data.text && data.text.body) {
      const botMessage = data.text.body;
      await saveMessage(data.to, "Bot", botMessage);
    }
  } catch (error) {
    console.error("Error sending WhatsApp message:", error.response ? error.response.data : error.message);
    throw new Error("Failed to send WhatsApp message.");
  }
};


const saveMedia = async ({ phonNumId, stringBits, filename }) => {
  const buffer = Buffer.from(stringBits, 'base64')
  const form = new FormData()

  form.append('file', buffer, { filename })
  form.append('messaging_product', 'whatsapp')

  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `https://graph.facebook.com/v13.0/${phonNumId}/media?access_token=${accessToken}`,
    headers: {
      ...form.getHeaders()
    },
    data: form

  }

  const res = await axios(config)

  return res.data
}

const saveImageMedia = async ({ phonNumId, stringBits }) => {
  const buffer = Buffer.from(stringBits, 'base64');
  const form = new FormData();

  // Append buffer with filename and content type
  form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
  form.append('messaging_product', 'whatsapp');

  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `https://graph.facebook.com/v13.0/${phonNumId}/media?access_token=${accessToken}`,
    headers: {
      ...form.getHeaders()
    },
    data: form
  };

  try {
    const res = await axios(config);
    return res.data;
  } catch (error) {
    console.error('Error uploading media:', error.response ? error.response.data : error.message);
    throw error;
  }
};



module.exports = {
  sendWhatsMessage,
  saveMedia,
  saveImageMedia
}
