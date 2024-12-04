const pool = require('../configs/db');

const findOrCreateConvo = async ({ userPhone, userName }) => {
  try {
    // First, try to find an existing conversation
    const [existingConvo] = await pool.execute(
      `
      SELECT Status
      FROM Convos
      WHERE userPhone = ?
      `,
      [userPhone]
    );

    // If a conversation is found, return its status
    if (existingConvo.length > 0) {
      return {
        success: true,
        message: 'Conversation found',
        convo: {
          status: existingConvo[0].Status,
        },
      };
    }

    // If no conversation exists, create a new one
    const [newConvo] = await pool.execute(
      `
      INSERT INTO Convos (userPhone, Status, userName)
      VALUES (?, ?, ?)
      `,
      [userPhone, 'Nuevo Chat', userName]
    );

    // Return the newly created conversation's details
    return {
      success: true,
      message: 'New conversation created',
      convo: {
        id: newConvo.insertId,
        status: 'Nuevo Chat',
      },
    };
  } catch (error) {
    console.error('Error in findOrCreateConvo:', error);
    return { success: false, error };
  }
};

const updateUserName = async (userPhone, userName) => {
  try {
    const [result] = await pool.execute(
      `
      UPDATE Convos
      SET userName = ?
      WHERE userPhone = ?
      `,
      [userName, userPhone]
    );

    // Check if any row was updated
    if (result.affectedRows === 0) {
      return { success: false, message: 'No record found to update' };
    }

    return { success: true, message: 'User Name updated successfully' };
  } catch (error) {
    console.error('Error updating User Name:', error);
    return { success: false, error };
  }
};

const updateLuzAdelanto = async (userPhone) => {
  try {
    // Fetch the current stage value
    const [rows] = await pool.execute(
      `
      SELECT Stage
      FROM LuzAdelanto
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (rows.length === 0) {
      return { success: false, message: 'No record found to update' };
    }

    // Parse the current Stage value as a number and increment it
    let currentStage = parseInt(rows[0].Stage, 10);
    if (isNaN(currentStage)) {
      return { success: false, message: 'Stage is not a valid number' };
    }

    currentStage++; // Increment the stage value

    // Update the stage value back in the database
    const [result] = await pool.execute(
      `
      UPDATE LuzAdelanto
      SET Stage = ?
      WHERE Convo = ?
      `,
      [currentStage.toString(), userPhone]
    );

    if (result.affectedRows === 0) {
      return { success: false, message: 'No record found to update' };
    }

    return {
      success: true,
      message: 'LuzAdelanto updated successfully',
      newStage: currentStage
    };
  } catch (error) {
    console.error('Error updating LuzAdelanto:', error);
    return { success: false, error };
  }
};



const getUserDoc = async (documentId) => {
  try {
    // Fetch the document from the database using the document ID
    const [rows] = await pool.execute(
      `SELECT Document FROM Documents WHERE ID = ?`,
      [documentId] // Assuming DocumentID is the primary key or identifier
    );

    if (rows.length === 0) {
      throw new Error('Document not found.');
    }

    // Return the BLOB as a Buffer
    return rows[0].Document;
  } catch (error) {
    console.error("Error fetching document:", error);
    throw new Error("Failed to fetch document.");
  }
};


const updateConvoStatus = async ({ userPhone, newStatus }) => {
  try {
    const [result] = await pool.execute(
      `
      UPDATE Convos
      SET Status = ?
      WHERE userPhone = ?
      `,
      [newStatus, userPhone]
    );

    // Check if any row was updated
    if (result.affectedRows === 0) {
      return {
        success: false,
        message: 'No conversation found for the given phone number',
      };
    }

    return {
      success: true,
      message: 'Status updated successfully',
    };
  } catch (error) {
    console.error('Error updating status:', error);
    return { success: false, error };
  }
};

const checkForUserID = async (userPhone) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT ID
      FROM Documents
      WHERE Convo = ? AND Type = 'ID'
      `,
      [userPhone]
    );

    return rows.length > 0; // Returns true if a record exists, otherwise false
  } catch (error) {
    console.error("Error checking for user ID:", error);
    throw new Error("Failed to check for user ID.");
  }
};

const checkForUserDocument = async (userPhone, doctype) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT ID
      FROM Documents
      WHERE Convo = ? AND Type = ?
      `,
      [userPhone, doctype]
    );

    return rows.length > 0; // Returns true if a record exists, otherwise false
  } catch (error) {
    console.error("Error checking for user ID:", error);
    throw new Error("Failed to check for user ID.");
  }
};

async function saveCardReport(userNumber, cardNumber) {
  try {
    const [result] = await pool.execute(
      `
      INSERT INTO CardReports (Timestamp, Status, CardNumber, Convo)
      VALUES (NOW(), 'Tarjeta Bloqueada', ?, ?)
      `,
      [cardNumber, userNumber]
    );

    // Return the ID of the inserted record
    return result.insertId;
  } catch (error) {
    console.error("Error saving card report:", error);
    throw new Error("Failed to save card report.");
  }
}


const saveUserDoc = async (userNumber, fileData, doctype) => {
  try {
    // Insert the file data into the Documents table
    const [result] = await pool.execute(
      `
      INSERT INTO Documents (Convo, Document, Type)
      VALUES (?, ?, ?)
      `,
      [userNumber, fileData, doctype] // userNumber links the document to the convo, and fileData is the binary data
    );

    return result.insertId // Return true if the insertion was successful
  } catch (error) {
    console.error("Error saving user ID:", error);
    throw new Error("Failed to save user ID.");
  }
};

async function findOrCreateAdditionalCardInfo(userPhone) {
  try {
    // Check if a record exists
    const [rows] = await pool.execute(
      `
      SELECT  Name, Relation, Limite, RFC
      FROM AdditionalCards
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (rows.length > 0) {
      // Return the existing record
      return rows[0];
    }

    // Create a new record if none exists
    await pool.execute(
      `
      INSERT INTO AdditionalCards (Convo)
      VALUES (?)
      `,
      [userPhone]
    );

    // Return the newly created record
    const [newRows] = await pool.execute(
      `
      SELECT  Name, Relation, Limite, RFC
      FROM AdditionalCards
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    return newRows[0];
  } catch (error) {
    console.error("Error finding or creating AdditionalCard:", error);
    throw new Error("Failed to find or create AdditionalCard.");
  }
}

async function findOrCreateLuzAdelanto(userPhone) {
  try {
    // Check if a record exists
    const [rows] = await pool.execute(
      `
      SELECT Stage
      FROM LuzAdelanto
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (rows.length > 0) {
      // Return the existing record
      return rows[0];
    }

    // Create a new record if none exists
    await pool.execute(
      `
      INSERT INTO LuzAdelanto (Convo)
      VALUES (?)
      `,
      [userPhone]
    );

    // Return the newly created record
    const [newRows] = await pool.execute(
      `
      SELECT Stage
      FROM LuzAdelanto
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    return newRows[0];
  } catch (error) {
    console.error("Error finding or creating LuzAdelanto:", error);
    throw new Error("Failed to find or create LuzAdelanto.");
  }
}

async function findOrCreateBlockedCard(userPhone) {
  try {
    // Check if a record exists
    const [rows] = await pool.execute(
      `
      SELECT Number, Tipo
      FROM BlockedCards
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (rows.length > 0) {
      // Return the existing record
      return rows[0];
    }

    // Create a new record if none exists
    await pool.execute(
      `
      INSERT INTO BlockedCards (Convo)
      VALUES (?)
      `,
      [userPhone]
    );

    // Return the newly created record
    const [newRows] = await pool.execute(
      `
      SELECT Number, Tipo
      FROM BlockedCards
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    return newRows[0];
  } catch (error) {
    console.error("Error finding or creating BlockedCard:", error);
    throw new Error("Failed to find or create BlockedCard.");
  }
}

async function findOrCreateCotizacion(userPhone, tipo) {
  try {
    // Check if a record exists
    const [rows] = await pool.execute(
      `
      SELECT ID, Convo, Modelo, Marca, Precio, Plazo, Tasa, Enganche, Categoria, Año, CP
      FROM Cotizaciones
      WHERE Convo = ? AND Status = 'En Proceso' AND Categoria = ?
      `,
      [userPhone, tipo]
    );

    if (rows.length > 0) {
      // Return the existing record
      return rows[0];
    }

    // Create a new record if none exists
    await pool.execute(
      `
      INSERT INTO Cotizaciones (Convo, Categoria)
      VALUES (?,?)
      `,
      [userPhone, tipo]
    );

    // Return the newly created record
    const [newRows] = await pool.execute(
      `
      SELECT ID, Convo, Modelo, Marca, Precio, Plazo, Tasa, Enganche, Categoria, Año, CP
      FROM Cotizaciones
      WHERE Convo = ? AND Status = 'En Proceso' AND Categoria = ?
      `,
      [userPhone, tipo]
    );

    return newRows[0];
  } catch (error) {
    console.error("Error finding or creating cotización:", error);
    throw new Error("Failed to find or create cotización.");
  }
}

async function findOrCreateNewAcc(userPhone) {
  try {
    // Check if a record exists
    const [rows] = await pool.execute(
      `
      SELECT ID, Convo, Status, Nuevo, Tipo, Profesion, Transacciones, Monto, PEP, Form
      FROM newAcc
      WHERE Convo = ? AND Status = 'En Proceso' 
      `,
      [userPhone]
    );

    if (rows.length > 0) {
      // Return the existing record
      return rows[0];
    }

    // Create a new record if none exists
    await pool.execute(
      `
      INSERT INTO newAcc (Convo, Status)
      VALUES (?, 'En Proceso')
      `,
      [userPhone]
    );

    // Return the newly created record
    const [newRows] = await pool.execute(
      `
      SELECT ID, Convo, Status, Nuevo, Tipo, Profesion, Transacciones, Monto, PEP, Form
      FROM newAcc
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    return newRows[0];
  } catch (error) {
    console.error("Error finding or creating newAcc record:", error);
    throw new Error("Failed to find or create newAcc record.");
  }
}

async function updateCotizacion(userPhone, updatedData) {
  try {
    // Filter out fields with null, undefined, or empty values
    const filteredData = Object.keys(updatedData)
      .filter(
        (key) =>
          key !== "Mensaje" && // Exclude the "Mensaje" field
          updatedData[key] !== null &&
          updatedData[key] !== undefined &&
          updatedData[key] !== ""
      )
      .reduce((obj, key) => {
        obj[key] = updatedData[key];
        return obj;
      }, {});

    // If there's no valid data to update, exit early
    if (Object.keys(filteredData).length === 0) {
      throw new Error("No valid data provided to update.");
    }


    // Build the update query dynamically
    const fields = Object.keys(filteredData)
      .map((field) => `${field} = ?`)
      .join(", ");
    const values = Object.values(filteredData);

    // Add userPhone to the end for the WHERE clause
    values.push(userPhone);

    // Execute the update query
    await pool.execute(
      `
      UPDATE Cotizaciones
      SET ${fields}
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      values
    );

    return true;
  } catch (error) {
    console.error("Error updating cotización:", error);
    throw new Error("Failed to update cotización.");
  }
}

async function updateNominaAdvance(userPhone, updatedData) {
  try {
    // Filter out fields with null, undefined, or empty values
    const filteredData = Object.keys(updatedData)
      .filter(
        (key) =>
          key !== "Mensaje" && // Exclude the "Mensaje" field
          updatedData[key] !== null &&
          updatedData[key] !== undefined &&
          updatedData[key] !== ""
      )
      .reduce((obj, key) => {
        obj[key] = updatedData[key];
        return obj;
      }, {});

    // If there's no valid data to update, exit early
    if (Object.keys(filteredData).length === 0) {
      throw new Error("No valid data provided to update.");
    }

    // Build the update query dynamically
    const fields = Object.keys(filteredData)
      .map((field) => `${field} = ?`)
      .join(", ");
    const values = Object.values(filteredData);

    // Add userPhone to the end for the WHERE clause
    values.push(userPhone);

    // Execute the update query
    await pool.execute(
      `
      UPDATE NominaAdvance
      SET ${fields}
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      values
    );

    return true;
  } catch (error) {
    console.error("Error updating NominaAdvance:", error);
    throw new Error("Failed to update addcard.");
  }
}

async function closeNominaAdvance(userPhone) {
  try {
    const [result] = await pool.execute(
      `
      UPDATE NominaAdvance
      SET Status = 'Enviado'
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (result.affectedRows > 0) {
      console.log(`NominaAdvance for user ${userPhone} has been marked as 'Enviado'.`);
      return true; // Success
    } else {
      console.log(`No active NominaAdvance found for user ${userPhone}.`);
      return false; // No record to update
    }
  } catch (error) {
    console.error(`Error closing NominaAdvance for user ${userPhone}:`, error);
    throw new Error("Failed to close NominaAdvance.");
  }
}

async function findOrCreateNominaAdvanceInfo(userPhone) {
  try {
    // Check if a record exists
    const [rows] = await pool.execute(
      `
      SELECT Monto, Plazo
      FROM NominaAdvance
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (rows.length > 0) {
      // Return the existing record
      return rows[0];
    }

    // Create a new record if none exists
    await pool.execute(
      `
      INSERT INTO NominaAdvance (Convo)
      VALUES (?)
      `,
      [userPhone]
    );

    // Return the newly created record
    const [newRows] = await pool.execute(
      `
      SELECT Monto, Plazo
      FROM NominaAdvance
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    return newRows[0];
  } catch (error) {
    console.error("Error finding or creating NominaAdvance:", error);
    throw new Error("Failed to find or create NominaAdvance.");
  }
}

async function updateAdditionalCard(userPhone, updatedData) {
  try {
    // Filter out fields with null, undefined, or empty values
    const filteredData = Object.keys(updatedData)
      .filter(
        (key) =>
          key !== "Mensaje" && // Exclude the "Mensaje" field
          updatedData[key] !== null &&
          updatedData[key] !== undefined &&
          updatedData[key] !== ""
      )
      .reduce((obj, key) => {
        obj[key] = updatedData[key];
        return obj;
      }, {});

    // If there's no valid data to update, exit early
    if (Object.keys(filteredData).length === 0) {
      throw new Error("No valid data provided to update.");
    }

    // Build the update query dynamically
    const fields = Object.keys(filteredData)
      .map((field) => `${field} = ?`)
      .join(", ");
    const values = Object.values(filteredData);

    // Add userPhone to the end for the WHERE clause
    values.push(userPhone);

    // Execute the update query
    await pool.execute(
      `
      UPDATE AdditionalCards
      SET ${fields}
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      values
    );

    return true;
  } catch (error) {
    console.error("Error updating addcard:", error);
    throw new Error("Failed to update addcard.");
  }
}

async function updateBlockedCard(userPhone, updatedData) {
  try {
    // Filter out fields with null, undefined, or empty values
    const filteredData = Object.keys(updatedData)
      .filter(
        (key) =>
          key !== "Mensaje" && // Exclude the "Mensaje" field
          updatedData[key] !== null &&
          updatedData[key] !== undefined &&
          updatedData[key] !== ""
      )
      .reduce((obj, key) => {
        obj[key] = updatedData[key];
        return obj;
      }, {});

    // If there's no valid data to update, exit early
    if (Object.keys(filteredData).length === 0) {
      throw new Error("No valid data provided to update.");
    }
    // Build the update query dynamically
    const fields = Object.keys(filteredData)
      .map((field) => `${field} = ?`)
      .join(", ");
    const values = Object.values(filteredData);

    // Add userPhone to the end for the WHERE clause
    values.push(userPhone);

    // Execute the update query
    await pool.execute(
      `
      UPDATE BlockedCards
      SET ${fields}
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      values
    );

    return true;
  } catch (error) {
    console.error("Error updating BlockedCard:", error);
    throw new Error("Failed to update BlockedCard.");
  }
}

async function updateNewAcc(userPhone, updatedData) {
  try {
    // Filter out fields with null, undefined, or empty values
    const filteredData = Object.keys(updatedData)
      .filter(
        (key) =>
          key !== "Mensaje" && // Exclude the "Mensaje" field
          updatedData[key] !== null &&
          updatedData[key] !== undefined &&
          updatedData[key] !== ""
      )
      .reduce((obj, key) => {
        obj[key] = updatedData[key];
        return obj;
      }, {});

    // If there's no valid data to update, exit early
    if (Object.keys(filteredData).length === 0) {
      throw new Error("No valid data provided to update.");
    }

    // Build the update query dynamically
    const fields = Object.keys(filteredData)
      .map((field) => `${field} = ?`)
      .join(", ");
    const values = Object.values(filteredData);

    // Add userPhone to the end for the WHERE clause
    values.push(userPhone);

    // Execute the update query
    await pool.execute(
      `
      UPDATE newAcc
      SET ${fields}
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      values
    );

    return true;
  } catch (error) {
    console.error("Error updating newAcc record:", error);
    throw new Error("Failed to update newAcc record.");
  }
}

async function closeCotizacion(userPhone) {
  try {
    const [result] = await pool.execute(
      `
      UPDATE Cotizaciones
      SET Status = 'Enviado'
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (result.affectedRows > 0) {
      console.log(`Cotización for user ${userPhone} has been marked as 'Enviado'.`);
      return true; // Success
    } else {
      console.log(`No active cotización found for user ${userPhone}.`);
      return false; // No record to update
    }
  } catch (error) {
    console.error(`Error closing cotización for user ${userPhone}:`, error);
    throw new Error("Failed to close cotización.");
  }
}

async function closeBlockedCard(userPhone) {

  try {
    const [result] = await pool.execute(
      `
      UPDATE BlockedCards
      SET Status = 'Enviado'
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (result.affectedRows > 0) {
      console.log(`BlockedCard for user ${userPhone} has been marked as 'Enviado'.`);
      return true; // Success
    } else {
      console.log(`No active BlockedCard found for user ${userPhone}.`);
      return false; // No record to update
    }
  } catch (error) {
    console.error(`Error closing BlockedCard for user ${userPhone}:`, error);
    throw new Error("Failed to close BlockedCard.");
  }
}

async function closeAdditionalCard(userPhone) {
  try {
    const [result] = await pool.execute(
      `
      UPDATE AdditionalCards
      SET Status = 'Enviado'
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (result.affectedRows > 0) {
      console.log(`AddCard for user ${userPhone} has been marked as 'Enviado'.`);
      return true; // Success
    } else {
      console.log(`No active AddCard found for user ${userPhone}.`);
      return false; // No record to update
    }
  } catch (error) {
    console.error(`Error closing AddCard for user ${userPhone}:`, error);
    throw new Error("Failed to close AddCard.");
  }
}

async function closeNewAcc(userPhone) {
  try {
    const [result] = await pool.execute(
      `
      UPDATE newAcc
      SET Status = 'Enviado'
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (result.affectedRows > 0) {
      console.log(`Record in newAcc for user ${userPhone} has been marked as 'Enviado'.`);
      return true; // Success
    } else {
      console.log(`No active record found in newAcc for user ${userPhone}.`);
      return false; // No record to update
    }
  } catch (error) {
    console.error(`Error closing record in newAcc for user ${userPhone}:`, error);
    throw new Error("Failed to close newAcc record.");
  }
}

async function closeLuzAdelanto(userPhone) {
  try {
    const [result] = await pool.execute(
      `
      UPDATE LuzAdelanto
      SET Status = 'Enviado'
      WHERE Convo = ? AND Status = 'En Proceso'
      `,
      [userPhone]
    );

    if (result.affectedRows > 0) {
      console.log(`Record in LuzAdelanto for user ${userPhone} has been marked as 'Enviado'.`);
      return true; // Success
    } else {
      console.log(`No active record found in LuzAdelanto for user ${userPhone}.`);
      return false; // No record to update
    }
  } catch (error) {
    console.error(`Error closing record in LuzAdelanto for user ${userPhone}:`, error);
    throw new Error("Failed to close LuzAdelanto record.");
  }
}

async function getClientAddress(userPhone) {
  try {
    const [rows] = await pool.execute(
      `
      SELECT Dom
      FROM Convos
      WHERE userPhone = ?
      `,
      [userPhone]
    );

    if (rows.length > 0) {
      return rows[0].Dom; // Return the address if found
    } else {
      return null; // No address found
    }
  } catch (error) {
    console.error("Error fetching client address:", error);
    throw new Error("Failed to fetch client address.");
  }
}

async function getReportStatus(reportId) {
  try {
    const [rows] = await pool.execute(
      `
      SELECT Status
      FROM CardReports
      WHERE ID = ?
      `,
      [reportId]
    );

    return rows.length > 0 ? rows[0].Status : null; // Return the status if found, otherwise null
  } catch (error) {
    console.error("Error fetching report status:", error);
    throw new Error("Failed to fetch report status.");
  }
}

async function updateCotizacionCategoria(userPhone, categoria) {
  try {
    let query = `
      UPDATE Cotizaciones
      SET Categoria = ?
    `;
    const values = [categoria];

    // If it's a mortgage (Hipoteca), default "Modelo" and "Marca"
    if (categoria === "Hipoteca") {
      query += `, Modelo = ?, Marca = ?`;
      values.push("No aplica para hipoteca", "No aplica para hipoteca");
    }

    query += `
      WHERE Convo = ? AND Status = 'En Proceso'
    `;
    values.push(userPhone);

    await pool.execute(query, values);
  } catch (error) {
    console.error("Error updating cotización categoria:", error);
    throw new Error("Failed to update cotización categoria.");
  }
}

async function saveMessage(convoId, origin, message) {
  try {
    await pool.execute(
      `
      INSERT INTO Messages (Convo, Origin, Message)
      VALUES (?, ?, ?)
      `,
      [convoId, origin, message]
    );
  } catch (error) {
    console.error("Error saving message:", error);
    throw new Error("Failed to save message.");
  }
}

async function getRecentMessages(convoId) {
  try {
    const [rows] = await pool.execute(
      `
      SELECT Origin, Message
      FROM Messages
      WHERE Convo = ?
      ORDER BY Timestamp DESC
      LIMIT 5
      `,
      [convoId]
    );

    // Reverse the order so the conversation flows naturally (oldest to newest)
    return rows.reverse();
  } catch (error) {
    console.error("Error retrieving messages:", error);
    throw new Error("Failed to retrieve recent messages.");
  }
}

const flushUserData = async (userPhone) => {
  try {
    // Start a transaction to ensure atomicity
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    // Delete from Documents
    await connection.execute(
      `
      DELETE FROM Documents
      WHERE Convo = ?
      `,
      [userPhone]
    );

    // Delete from Messages
    await connection.execute(
      `
      DELETE FROM Messages
      WHERE Convo = ?
      `,
      [userPhone]
    );

    // Commit the transaction
    await connection.commit();
    connection.release();

    console.log(`All user data for ${userPhone} has been flushed.`);
    return { success: true, message: `User data for ${userPhone} has been successfully deleted.` };
  } catch (error) {
    console.error("Error flushing user data:", error);
    throw new Error("Failed to flush user data.");
  }
};

module.exports = {
  updateUserName,
  findOrCreateConvo,
  updateConvoStatus,
  checkForUserID,
  saveCardReport,
  saveUserDoc,
  checkForUserDocument,
  findOrCreateCotizacion,
  updateCotizacion,
  closeCotizacion,
  getClientAddress,
  getReportStatus,
  updateCotizacionCategoria,
  saveMessage,
  getRecentMessages,
  findOrCreateAdditionalCardInfo,
  updateAdditionalCard,
  closeAdditionalCard,
  findOrCreateBlockedCard,
  updateBlockedCard,
  updateNominaAdvance,
  findOrCreateNominaAdvanceInfo,
  closeNominaAdvance,
  closeBlockedCard,
  findOrCreateNewAcc,
  updateNewAcc,
  getUserDoc,
  closeNewAcc,
  flushUserData,
  findOrCreateLuzAdelanto,
  updateLuzAdelanto,
  closeLuzAdelanto
};
