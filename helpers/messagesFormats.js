const textPlainMessage = ({ toInput = '', message }) => {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toInput,

    text: {
      body: message
    }
  }
}

const mediaMessageById = (toInput, type, id) => {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toInput,
    type: type,
    [type]: {
      id: id
    }
  }
}


const documentMessageById = ({ toInput, type, id, filename }) => {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toInput,
    type,
    [type]: {
      id,
      filename
    }
  };
};


const listMessage = ({ toInput = '', sections = [], bodyText = '', headerText = '', footerText = '' }) => {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toInput,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: headerText 
      },
      body: {
        text: bodyText
      },
      footer: {
        text: footerText 
      },
      action: {
        button: 'Ver opciones', // Button text
        sections: sections.map((section) => ({
          title: section.title || '',
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description || '' // Description is optional
          }))
        }))
      }
    }
  };
};



module.exports = {
  textPlainMessage,
  listMessage,
  mediaMessageById,
  documentMessageById
}
