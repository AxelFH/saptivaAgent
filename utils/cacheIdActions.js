const NodeCache = require('node-cache');
const myCache = new NodeCache();
const warningCache = new NodeCache(); // New cache for session warnings

const { sendWhatsMessage } = require('../utils/whatsappEndpoints');
const { textPlainMessage } = require('../helpers/messagesFormats');
const pool = require('../configs/db');

const timeouts = new Map();

const storeIdAction = ({ userNumber, data }) => {
  // Tiempo de expiración ajustado a 4 horas (14400 segundos)
  const success = myCache.set(userNumber, data, 14400);
  console.log({ success });
  if (!success) {
    return null;
  }

  // Clear any existing timeouts for this userNumber
  if (timeouts.has(userNumber)) {
    clearTimeout(timeouts.get(userNumber).warningTimeout);
    clearTimeout(timeouts.get(userNumber).deleteTimeout);
  }

  // Set a warning message after 15 minutes
  const warningTimeout = setTimeout(() => {
    const warningMessage = textPlainMessage({ toInput: userNumber, message: "Hola! Sigues ahí? Tu sesión expirará en 5 minutos" });
    sendWhatsMessage(process.env.WHATS_ID_NUMBER, warningMessage);
  }, 15 * 60 * 1000);

  // Set the deletion of action after 20 minutes
  const deleteTimeout = setTimeout(() => {
    const warningMessage = textPlainMessage({ toInput: userNumber, message: "Gracias por consultar S.O.S Seguros!" });
    sendWhatsMessage(process.env.WHATS_ID_NUMBER, warningMessage);
    deleteIdAction({ userNumber });
  }, 20 * 60 * 1000);

  // Store the timeouts in the map
  timeouts.set(userNumber, { warningTimeout, deleteTimeout });

  const action = data.currentAction;

  if (action && action != "survey") {
    try {
      pool.query(
        'UPDATE Incidencias SET action = ? WHERE userPhone = ? and active = "yes"',
        [action, userNumber]
      );
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }
  return success;
};


const addData = ({ userNumber, data = {} }) => {
  // Tiempo de expiración ajustado a 4 horas (14400 segundos)
  const value = myCache.get(userNumber);
  const obj = {
    ...data,
    ...value
  };
  const success = myCache.set(userNumber, obj, 14400);
  console.log({ success });
  if (!success) {
    return null;
  }

  return success;
};

const getIdActionId = ({ userNumber }) => {
  try {
    const value = myCache.get(userNumber);

    return value;
  } catch (error) {
    return null;
  }
};

const deleteIdAction = ({ userNumber }) => {
  const numDeleted = myCache.del(userNumber);
  console.log({ numDeleted });

  if (numDeleted === 0) {
    return false;
  }

  // Also delete from the warning cache if it exists
  warningCache.del(userNumber);
  // Delete data from cache
  myCache.del(userNumber);

  // Clear timeouts if they exist
  if (timeouts.has(userNumber)) {
    clearTimeout(timeouts.get(userNumber).warningTimeout);
    clearTimeout(timeouts.get(userNumber).deleteTimeout);
    timeouts.delete(userNumber);
  }

  return true;
};

module.exports = {
  storeIdAction,
  getIdActionId,
  addData,
  deleteIdAction
};
