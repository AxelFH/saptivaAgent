const express = require('express');
const router = express.Router();
const pool = require('../configs/db'); // Import the db pool

const { textPlainMessage } = require('../helpers/messagesFormats')
const { sendWhatsMessage } = require('../utils/whatsappEndpoints')
const { closeNewAcc, updateConvoStatus, closeLuzAdelanto } = require('../controllers/webhook.controller')

router.get('/chats', async (req, res) => {
  let connection;
  try {
    // Get a connection from the pool
    connection = await pool.getConnection();

    // SQL query to fetch all chats (Convos table)
    const query = `
      SELECT *
      FROM Convos
    `;

    // Execute the query
    const [rows] = await connection.query(query);

    // Return the results in JSON format
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching chat data:', error);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  } finally {
    if (connection) connection.release(); // Always release the connection back to the pool
  }
});

router.get('/documents', async (req, res) => {
  let connection;
  try {
    // Get a connection from the pool
    connection = await pool.getConnection();

    // SQL query to fetch all documents without the BLOB column
    const query = `
      SELECT ID, Convo, Type
      FROM Documents
    `;

    // Execute the query
    const [rows] = await connection.query(query);

    // Return the results in JSON format
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  } finally {
    if (connection) connection.release(); // Always release the connection back to the pool
  }
});

router.get('/document', async (req, res) => {
  const id = parseInt(req.query.id, 10); // Parse the id from the query string

  if (isNaN(id)) {
    // Return a 400 Bad Request if the id is not a valid number
    res.status(400).json({ message: 'Invalid document ID provided.' });
    return;
  }

  let connection;

  try {
    connection = await pool.getConnection();

    // SQL query to fetch the BLOB data for the specified document
    const query = `
      SELECT Document
      FROM Documents
      WHERE ID = ?
    `;

    // Execute the query with the dynamic parameter
    const [rows] = await connection.query(query, [id]);

    if (rows.length === 0) {
      // No document found with the given ID
      res.status(404).json({ message: 'Document not found.' });
      return;
    }

    const { Document } = rows[0];

    // Set headers for PDF response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=document.pdf`);

    // Send the PDF as a response
    res.status(200).send(Document);
  } catch (error) {
    console.error('Error fetching document BLOB:', error);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  } finally {
    if (connection) connection.release(); // Always release the connection back to the pool
  }
});

router.get('/cardReports', async (req, res) => {
  let connection;

  try {
    connection = await pool.getConnection();

    const query = `
      SELECT *
      FROM CardReports
    `;

    const [rows] = await connection.query(query);

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching card reports:', error);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  } finally {
    if (connection) connection.release();
  }
});

router.patch('/cardReports', async (req, res) => {
  const { id, newStatus } = req.body;

  if (!id || !newStatus) {
    return res.status(400).json({ message: 'Both ID and newStatus are required.' });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    // SQL query to update the status of the card report
    const query = `
      UPDATE CardReports
      SET Status = ?
      WHERE ID = ?
    `;

    const [result] = await connection.query(query, [newStatus, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Card report not found.' });
    }

    res.status(200).json({ message: 'Card report status updated successfully.' });
  } catch (error) {
    console.error('Error updating card report status:', error);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  } finally {
    if (connection) connection.release();
  }
});


router.get('/extracciones', async (req, res) => {
  let connection;
  try {
    // Get a connection from the pool
    connection = await pool.getConnection();

    // SQL query to fetch all chats (Convos table)
    const query = `
      SELECT *
      FROM extraccion
    `;

    // Execute the query
    const [rows] = await connection.query(query);

    // Return the results in JSON format
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching chat data:', error);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  } finally {
    if (connection) connection.release(); // Always release the connection back to the pool
  }
});

router.get('/extraccion', async (req, res) => {
  const id = parseInt(req.query.id, 10); // Parse the id from the query string

  if (isNaN(id)) {
    // Return a 400 Bad Request if the id is not a valid number
    res.status(400).json({ message: 'Invalid document ID provided.' });
    return;
  }

  let connection;

  try {
    connection = await pool.getConnection();

    // SQL query to fetch the BLOB data for the specified document
    const query = `
      SELECT *
      FROM extraccion
      WHERE ID = ?
    `;

    // Execute the query with the dynamic parameter
    const [rows] = await connection.query(query, [id]);

    if (rows.length === 0) {
      // No document found with the given ID
      res.status(404).json({ message: 'Document not found.' });
      return;
    }
    const { Document } = rows[0];

    // Send the PDF as a response
    res.status(200).send(Document);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  } finally {
    if (connection) connection.release(); // Always release the connection back to the pool
  }
});

router.post('/save-signature', async (req, res) => {
  const { userNumber, signatureData, doctype } = req.body; // Datos enviados en la solicitud

  let connection;
  try {
    // Obtener una conexión del pool
    connection = await pool.getConnection();

    // Iniciar transacción
    await connection.beginTransaction();

    // Consulta SQL para insertar los datos
    const insertQuery = `
      INSERT INTO Documents (Convo, Document, Type)
      VALUES (?, ?, ?)
    `;

    // Ejecutar la consulta de inserción
    const [insertResult] = await connection.query(insertQuery, [
      userNumber,
      signatureData, // Este debe ser la firma en formato base64 o binario
      doctype,
    ]);

    // Consulta SQL para actualizar la tabla newAcc
    const updateQuery = `
      UPDATE newAcc
      SET Form = true
      WHERE Convo = ? AND status = 'En proceso'
    `;

    // Ejecutar la consulta de actualización
    await connection.query(updateQuery, [userNumber]);

    // Confirmar transacción
    await connection.commit();

    // Responder con el ID del documento insertado
    res.status(201).json({
      documentId: insertResult.insertId,
      message: 'Firma guardada y estado actualizado exitosamente, puedes cerrar esta pestaña.'
    });

    const accFlow = await closeNewAcc(userNumber);
    await closeLuzAdelanto(userNumber);

    if (accFlow) {
      await sendWhatsMessage(
        "266873886499661",
        textPlainMessage({
          toInput: userNumber,
          message: "Tu firma ha sido guardada con exito!"
        })
      );

      await sendWhatsMessage(
        "266873886499661",
        textPlainMessage({
          toInput: userNumber,
          message: "¡Felicidades! Eres oficialmente miembro de la familia Saptibank. Puedes recoger tu tarjeta física directamente en sucursal, también podrás utilizar tu tarjeta virtual en la app. "
        })
      );

      await sendWhatsMessage(
        "266873886499661",
        textPlainMessage({
          toInput: userNumber,
          message: "¿Hay algo más en lo que te pueda ayudar?"
        })
      );
    } else {

      await sendWhatsMessage(
        "266873886499661",
        textPlainMessage({
          toInput: userNumber,
          message: "Tu firma ha sido guardada con exito!"
        })
      );

      await sendWhatsMessage(
        "266873886499661",
        textPlainMessage({
          toInput: userNumber,
          message: "Felicidades, tu dinero ya está disponible en la cuenta ****5554"
        })
      );

      await sendWhatsMessage(
        "266873886499661",
        textPlainMessage({
          toInput: userNumber,
          message: "¿Hay algo más en lo que te pueda ayudar?"
        })
      );
    }

    await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });

  } catch (error) {
    if (connection) await connection.rollback(); // Revertir la transacción en caso de error
    console.error('Error guardando la firma o actualizando el estado:', error);
    res.status(500).json({
      message: 'Error guardando la firma o actualizando el estado. Intente más tarde.'
    });
  } finally {
    if (connection) connection.release(); // Liberar la conexión
  }
});

module.exports = router;