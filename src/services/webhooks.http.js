const { request, response } = require('express')
const axios = require('axios')
const path = require('path');
const fs = require('fs');

const PDFDocument = require('pdfkit');
const FormData = require('form-data');

const { documentMessageById, textPlainMessage, mediaMessageById, listMessage } = require('../helpers/messagesFormats')
const { sendWhatsMessage, saveMedia } = require('../utils/whatsappEndpoints')
const { updateUserName, findOrCreateConvo, updateConvoStatus, checkForUserID, saveCardReport, saveUserDoc, checkForUserDocument, findOrCreateCotizacion, updateCotizacion, closeCotizacion, getClientAddress, getReportStatus, updateCotizacionCategoria, saveMessage, findOrCreateAdditionalCardInfo, updateAdditionalCard, closeAdditionalCard, findOrCreateBlockedCard, updateBlockedCard, closeBlockedCard, findOrCreateNewAcc, updateNewAcc, closeNewAcc, getUserDoc, flushUserData, findOrCreateLuzAdelanto, closeLuzAdelanto, updateLuzAdelanto } = require('../controllers/webhook.controller')
const { trimPrefixDigits } = require('../helpers/trimPrefixDigits')
const { getOpenAIResponse } = require('../utils/openai_api');



// Webhook callback function without token verification
const callback = (req = request, res = response) => {
  const webhookToken = process.env.WEBHOOK_TOKEN
  const mode = req.query['hub.mode']
  const challange = req.query['hub.challenge']
  const token = req.query['hub.verify_token']

  console.log(req.query)
  if (mode && token) {
    if (token === webhookToken && mode === 'subscribe') {
      console.log('WEBHOOK_VERIFIED')
      res.status(200).send(challange)
    } else {
      res.status(403)
    }
  } else {
    res.status(400)
  }
}


const postValues = async (req = request, res = response) => {
  const bodyParam = req.body;
  const whatsIdNum = process.env.WHATS_ID_NUMBER;

  if (bodyParam.object && isValidWhatsAppMessage(bodyParam, whatsIdNum)) {
    try {
      res.sendStatus(200);

      const { msgType, userMessage, phonNoId, userNumber, fromName } = extractUserMessage(bodyParam);
      const change = bodyParam.entry[0].changes[0].value;

      if (msgType !== 'text' && msgType !== 'document' && msgType !== 'image' && msgType !== 'interactive') {
        await handleUnsupportedMessageType(phonNoId, userNumber);
        return;
      }

      const { convo } = await findOrCreateConvo({ userPhone: userNumber, userName: fromName });
      const currentStatus = convo.status;

      await saveMessage(userNumber, "User", userMessage);

      if (await handleCancelIntent(currentStatus, userMessage, userNumber, phonNoId))
        return;

      const hasUserID = await checkForUserID(userNumber);
      const hasProofOfAddress = await checkForUserDocument(userNumber, "Comprobante de Domicilio");
      const hasProofOfIncome = await checkForUserDocument(userNumber, "Comprobante de Ingresos");
      const hasPic = await checkForUserDocument(userNumber, "Foto");


      switch (currentStatus) {
        case "Nuevo Chat":
          const userContext = `
          Nueva conversación con el usuario (o fin de una anterior).
          Si detectas que el usuario desea realizar alguna de las siguientes acciones, responde con un objeto JSON con un campo "action" y opcionalmente un campo "message":

          "hipotecario": Si el usuario desea información o iniciar el proceso de compra de una casa o terreno con un crédito hipotecario, mediante este método le hacemos una cotización.
          "automotriz": Si el usuario desea información o iniciar el proceso de compra de un vehiculo/auto/carro con un crédito automotriz, mediante este método le hacemos una cotización.
          "tarjeta_adicional": Si el usuario desea obtener una tarjeta de crédito adicional (es muy importante que utilices el término "adicional").
          "reportar_tarjeta_extraviada": Si el usuario desea reportar una tarjeta como extraviada.
          "desbloquear_tarjeta_extraviada": Si el usuario desea desbloquear una tarjeta reportada/bloqueada. Cuando un usuario te pide un desbloqueo, asume que se trata de esta operación.
          "horarios_sucursales": Si el usuario desea información sobre los horarios de las sucursales.
          "resumen_movimientos": Si el usuario desea un resumen de los últimos movimientos de su cuenta.
          "abrir_cuenta": Si el usuario desea información o iniciar el proceso de abrir una cuenta.
          "desactivar_tarjeta_adicional": Si el usuario desea desactivar una de las tarjetas adicionales en su cuenta.
          "pagar_luz": Si el usuario desea realizar un pago relacionado con el servicio de luz.
          "copia_estado_cuenta": Si el usuario desea obtener una copia de su último estado de cuenta.
          "adelanto_nomina": Si el usuario desea solicitar un adelanto de nómina.
          "ofertas_mes": Si el usuario desea conocer las ofertas del mes disponibles.
          "borrar_todo": Si el usuario desea borrar todos sus datos y reiniciar su usuario en el sistema, pregunta al usuario si esta seguro de realizar la operación, confirma su respuesta verificando el historial del chat.

          Por ejemplo:
          {
          "action": "hipotecario", //Este puede ser cualquiera de las acciones listadas arriba.
          }

          De lo contrario, responde de manera natural a la consulta explicando al usuario tus diferentes funciones. 
          
          Si detectas que el usuario te saluda, contesta su saludo con el mensaje "Bienvenido al asistente IA de Banorte. Dime ¿en qué puedo ayudarte hoy?"
          Si detectas que el usuario esta terminando de usar tus servicios (considera el historial de la conversación como contexto, por ejemplo, si tú ultimo mensaje fue "¿Hay algo más en lo que te pueda ayudar?" y el cliente dijo "No" ), dile "Que tengas excelente día."
          `;

          // Generate a response using OpenAI
          const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

          try {
            // Try parsing the response as JSON
            const parsedResponse = JSON.parse(assistantResponse);

            if (parsedResponse.action) {
              // Process the action
              await processAction(userMessage, parsedResponse, userNumber, phonNoId);
            } else {
              // Handle fallback if no action is detected
              await handleFallbackMessage(userNumber, phonNoId, assistantResponse);
            }
          } catch (e) {
            // Handle fallback if JSON parsing fails
            console.log("Failed to parse JSON, treating as plain response.");
            await handleFallbackMessage(userNumber, phonNoId, assistantResponse);
          }
          break;
        case "hipotecario":
          if ((msgType === 'document' || msgType === 'image') && !hasUserID) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "ID");
          } else if ((msgType === 'document' || msgType === 'image') && !hasProofOfAddress) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "Comprobante de Domicilio");
          } else if ((msgType === 'document' || msgType === 'image') && !hasProofOfIncome) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "Comprobante de Ingresos");
          }
          await handleCotizar(userMessage, userNumber, phonNoId, "hipotecario")
          break;
        case "automotriz":
          if ((msgType === 'document' || msgType === 'image') && !hasUserID) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "ID");
          } else if ((msgType === 'document' || msgType === 'image') && !hasProofOfAddress) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "Comprobante de Domicilio");
          } else if ((msgType === 'document' || msgType === 'image') && !hasProofOfIncome) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "Comprobante de Ingresos");
          }
          await handleCotizar(userMessage, userNumber, phonNoId, "automotriz")
          break;
        case "tarjetaAdicional":
          await handleTarjetaAdicional(userMessage, userNumber, phonNoId)
          break;
        case "adelantoNomina":
          await handleAdelantoNomina(userMessage, userNumber, phonNoId)
          break;

        case "tarjetaExtraviada":
          await handleReportarTarjetaExtraviada(userMessage, userNumber, phonNoId)
          break;
        case "resumenMovimientos":
          await handleResumenMovimientos(userMessage, userNumber, phonNoId)
          break;
        case "desactivarTarjetaAdicional":
          await handleDesactivarTarjetaAdicional(userMessage, userNumber, phonNoId)
          break;
        case "ofertasMes":
          await handleOfertasMes(userMessage, userNumber, phonNoId)
          break;
        case "pagarLuz":
          await handlePagarLuz(userMessage, userNumber, phonNoId)
          break;
        case "ultimoEstadoCuenta":
          await handleCopiaEstadoCuenta(userMessage, userNumber, phonNoId);
          break;
        case "nuevaCuenta":

          if ((msgType === 'document' || msgType === 'image') && !hasUserID) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "ID");
          } else if ((msgType === 'document' || msgType === 'image') && !hasProofOfAddress) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "Comprobante de Domicilio");
          } else if ((msgType === 'document' || msgType === 'image') && !hasPic) {
            await handleMediaMessage(phonNoId, userNumber, msgType, change.messages[0], "Foto");
          }
          await handleAbrirCuenta(userMessage, userNumber, phonNoId)
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error in postValues:', error);
      sendErrorMessage(res, 'Error processing message. Please try again later.');
    }
  }
};

function isValidWhatsAppMessage(bodyParam, whatsIdNum) {
  const change = bodyParam.entry[0].changes[0].value;
  return change.messages && change.metadata.phone_number_id === whatsIdNum;
}

function extractUserMessage(bodyParam) {
  const change = bodyParam.entry[0].changes[0].value;
  const msgType = change.messages[0].type;
  const phonNoId = change.metadata.phone_number_id;
  const userNumber = trimPrefixDigits(change.contacts[0].wa_id);
  const fromName = change.contacts[0].profile.name;
  let userMessage = '';

  if (msgType === 'text') {
    userMessage = change.messages[0].text.body;
  } else if (msgType === 'interactive') {
    const interactiveType = change.messages[0].interactive.type;
    if (interactiveType === 'list_reply') {
      userMessage = change.messages[0].interactive.list_reply.id; // Extract list reply ID
    } else if (interactiveType === 'button_reply') {
      userMessage = change.messages[0].interactive.button_reply.id; // Extract button reply ID
    }
  }

  return { msgType, userMessage, phonNoId, userNumber, fromName };
}


async function handleUnsupportedMessageType(phonNoId, userNumber) {
  const assistanceMessage = "En este momento solamente soy capaz de entender mensajes de texto, podrías por favor explicarme en que te puedo ayudar con un mensaje escrito?";
  await sendTextMessage(phonNoId, userNumber, assistanceMessage);
}

async function sendTextMessage(phonNoId, userNumber, message) {
  const resSmg = textPlainMessage({ toInput: userNumber, message });
  await sendWhatsMessage(phonNoId, resSmg);
}

function sendErrorMessage(res, message) {
  res.status(500).send(message);
}

async function processAction(userMessage, parsedResponse, userNumber, phonNoId) {
  switch (parsedResponse.action) {
    case "hipotecario":
      await handleCotizar(userMessage, userNumber, phonNoId, "hipotecario", parsedResponse);
      break;
    case "automotriz":
      await handleCotizar(userMessage, userNumber, phonNoId, "automotriz", parsedResponse);
      break;
    case "tarjeta_adicional":
      await handleTarjetaAdicional(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "reportar_tarjeta_extraviada":
      await handleReportarTarjetaExtraviada(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "desbloquear_tarjeta_extraviada":
      await handleDesbloqueo(userNumber, phonNoId);
      break;
    case "horarios_sucursales":
      await handleHorariosSucursales(userMessage, userNumber, phonNoId);
      break;
    case "resumen_movimientos":
      await handleResumenMovimientos(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "abrir_cuenta":
      await handleAbrirCuenta(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "desactivar_tarjeta_adicional":
      await handleDesactivarTarjetaAdicional(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "pagar_luz":
      await handlePagarLuz(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "copia_estado_cuenta":
      await handleCopiaEstadoCuenta(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "adelanto_nomina":
      await handleAdelantoNomina(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "ofertas_mes":
      await handleOfertasMes(userMessage, userNumber, phonNoId, parsedResponse);
      break;
    case "borrar_todo":
      await flushUserData(userNumber);
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: "Tus datos han sido eliminados."
        })
      );
      break;
    default:
      console.log("Unknown action received:", parsedResponse.action);
  }
}


async function handleCotizar(userMessage, userNumber, phonNoId, tipo, parsedResponse = null) {

  if (parsedResponse) {

    await updateConvoStatus({ userPhone: userNumber, newStatus: tipo });
    const messageType = (tipo == "hipotecario") ? "Entiendo, en Banorte contamos con el crédito hipotecario que necesitas." : "Entiendo, en Banorte contamos con el crédito automotriz que necesitas."
    const responseMessage = textPlainMessage({
      toInput: userNumber,
      message: messageType
    });

    await sendWhatsMessage(phonNoId, responseMessage);
    const messageType2 = (tipo == "hipotecario") ? "Indícame por favor el valor del inmueble." : "Indícame por favor el valor del vehículo."
    const responseMessage2 = textPlainMessage({
      toInput: userNumber,
      message: messageType2
    });

    await sendWhatsMessage(phonNoId, responseMessage2);
    return;
  }


  const cotizacion = await findOrCreateCotizacion(userNumber, tipo);

  const { ID } = cotizacion;

  let isComplete
  if (tipo === "automotriz") {
    const { Marca, Modelo, Precio, Año, Plazo } = cotizacion;
    if (Marca && Modelo && Precio && Año && Plazo) {
      isComplete = true;
    }
  } else {
    const { CP, Precio, Plazo } = cotizacion;
    if (CP && Precio && Plazo) {
      isComplete = true;
    }
  }

  let userContext;
  let assistantResponse;

  if (!isComplete) {
    userContext = generateCotizacionContext(cotizacion, tipo);
    assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);
  }

  try {
    const parsedData = JSON.parse(assistantResponse);

    if (tipo == "hipotecario") {
      if (
        parsedData.CP ||
        parsedData.Precio ||
        parsedData.Plazo
      ) {
        await updateCotizacion(userNumber, parsedData);
        isComplete = parsedData.Precio && parsedData.CP && parsedData.Plazo;
      }
    } else {
      if (
        parsedData.Modelo ||
        parsedData.Marca ||
        parsedData.Precio ||
        parsedData.Año ||
        parsedData.Plazo
      ) {
        await updateCotizacion(userNumber, parsedData);
        isComplete = parsedData.Modelo && parsedData.Marca && parsedData.Precio && parsedData.Año && parsedData.Plazo;
      }
    }

    if (tipo == "hipotecario") {
      isComplete = parsedData.Precio != null && parsedData.Precio !== "" &&
        parsedData.CP != null && parsedData.CP !== "" &&
        parsedData.Plazo != null && parsedData.Plazo !== "";
    } else {
      isComplete = parsedData.Modelo != null && parsedData.Modelo !== "" &&
        parsedData.Marca != null && parsedData.Marca !== "" &&
        parsedData.Precio != null && parsedData.Precio !== "" &&
        parsedData.Año != null && parsedData.Año !== "" &&
        parsedData.Plazo != null && parsedData.Plazo !== "";
    }




    if (!isComplete) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedData.Mensaje
        })
      );
    } else {

      let pdfURL = ""

      if (tipo == "hipotecario") {
        pdfURL = await generatePDFHipoteca(parsedData.Precio, parsedData.Plazo, parsedData.CP, userNumber)
      } else {
        pdfURL = await generatePDF(parsedData.Modelo, parsedData.Marca, parsedData.Precio, parsedData.Plazo, userNumber)
      }


      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedData.Mensaje
        })
      );


      await sendDocument(phonNoId, userNumber, pdfURL, tipo)

      await delay(6000);
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: "¿Te gustaría completar la solicitud? Es un proceso corto de validación."
        })
      );

      return;
    }

  } catch (e) {
    if (!isComplete) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: assistantResponse
        })
      );
    } else {


      const missingDocs = await checkUserDocuments(userNumber, userMessage, "Estas ayudando a un cliente a realizar una cotización");

      if (missingDocs) {
        await sendWhatsMessage(
          phonNoId,
          textPlainMessage({
            toInput: userNumber,
            message: missingDocs
          })
        );
      } else {
        await sendWhatsMessage(
          phonNoId,
          textPlainMessage({
            toInput: userNumber,
            message: `Ya se tienen tus documentos en base de datos.\nTu proceso de solicitud se ha completado con el número de seguimiento ${ID}`
          })
        );

        await sendWhatsMessage(
          phonNoId,
          textPlainMessage({
            toInput: userNumber,
            message: `¡Felicidades! Tu crédito ha sido pre-aprobado. Por favor acude a tu sucursal más cercana con tu identificación oficial y el número de seguimiento para completar el proceso.`
          })
        );

        await sendWhatsMessage(
          phonNoId,
          textPlainMessage({
            toInput: userNumber,
            message: `Hay algo más en lo que te pueda ayudar?`
          })
        );

        await closeCotizacion(userNumber);
        await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });
      }

    }

  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function handleAbrirCuenta(userMessage, userNumber, phonNoId, parsedResponse = null) {

  if (parsedResponse) {
    await updateConvoStatus({ userPhone: userNumber, newStatus: "nuevaCuenta" });
    const responseMessage = textPlainMessage({
      toInput: userNumber,
      message: "Claro, con mucho gusto puedo ayudarte. Empecemos: ¿Tienes alguna cuenta con Banorte?"
    });

    await sendWhatsMessage(phonNoId, responseMessage);
    return;
  }


  const nuevaCuenta = await findOrCreateNewAcc(userNumber);

  const { Tipo, Nuevo, Form } = nuevaCuenta;

  let isComplete;
  let docStage;

  if (Tipo && Nuevo) {
    docStage = true;
  }

  if (docStage) {

    const missingDocs = await checkUserDocuments(userNumber, userMessage, "estas ayudando a un usuario a crear una cuenta nueva", {
      checkID: true,
      checkProofOfAddress: true,
      checkProofOfIncome: false,
      checkFoto: true
    });

    if (missingDocs) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: missingDocs
        })
      );
      return;
    }
  }

  const userContext = generateNewAccContext(nuevaCuenta);
  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

  try {
    const parsedData = JSON.parse(assistantResponse);
    if (
      parsedData.Tipo ||
      parsedData.Profesion ||
      parsedData.Monto ||
      parsedData.Transacciones ||
      parsedData.Nuevo ||
      parsedData.PEP
    ) {
      await updateNewAcc(userNumber, parsedData);
      isComplete =
        parsedData.Tipo &&
        parsedData.Profesion &&
        parsedData.Transacciones &&
        parsedData.Monto &&
        parsedData.Nuevo &&
        parsedData.PEP;

      docStage =
        parsedData.Tipo &&
        parsedData.Nuevo
    }

    if (isComplete && !Form) {
      //done
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: "Gracias! Tu cuenta está lista. Por favor coloca tu firma en el formulario del siguiente link para la apertura de tu cuenta."
        })
      );
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: "Link al formulario de firma: https://firmasaptiva.vulcanics.mx/firma?convo=" + userNumber
        })
      );
      return;
    } else {

      if (docStage) {

        const missingDocs = await checkUserDocuments(userNumber, userMessage, "estas ayudando a un usuario a crear una cuenta nueva", {
          checkID: true,
          checkProofOfAddress: true,
          checkProofOfIncome: false,
          checkFoto: true
        });

        if (missingDocs) {
          await sendWhatsMessage(
            phonNoId,
            textPlainMessage({
              toInput: userNumber,
              message: missingDocs
            })
          );
          return;
        } else {

          //not done
          await sendWhatsMessage(
            phonNoId,
            textPlainMessage({
              toInput: userNumber,
              message: parsedData.Mensaje
            })
          );
          return;

        }
      } else {

        //not done
        await sendWhatsMessage(
          phonNoId,
          textPlainMessage({
            toInput: userNumber,
            message: parsedData.Mensaje
          })
        );
        return;

      }
    }
  } catch (e) {
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: assistantResponse
      })
    );
  }
}

async function handleTarjetaAdicional(userMessage, userNumber, phonNoId, parsedResponse = null) {

  if (parsedResponse) {
    await updateConvoStatus({ userPhone: userNumber, newStatus: "tarjetaAdicional" });
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "Desde luego, como tarjeta adicional estará vinculada a tu cuenta ****5554. ¿Es correcto?"
      })
    );
    return;
  }

  const AdditionalCardInfo = await findOrCreateAdditionalCardInfo(userNumber);
  const userContext = await generateAdditionalCardContext(AdditionalCardInfo)

  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);
  let isComplete;

  try {
    const parsedData = JSON.parse(assistantResponse);

    if (
      parsedData.Name ||
      parsedData.Relation ||
      parsedData.Limite ||
      parsedData.RFC
    ) {
      await updateAdditionalCard(userNumber, parsedData);
      isComplete = parsedData.Name && parsedData.Relation && parsedData.Limite && parsedData.RFC;
    }

    if (!isComplete) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedData.Mensaje
        })
      );
    } else {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedData.Mensaje
        })
      );

      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: "Recuerda que como titular la deberás recoger tú presentando tu identificación oficial."
        })
      );

      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `¿Hay algo más en lo que te pueda ayudar?`
        })
      );

      await closeAdditionalCard(userNumber)
      await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });
    }

  } catch (e) {
    console.log(e)
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: assistantResponse
      })
    );
  }
}

async function handleReportarTarjetaExtraviada(userMessage, userNumber, phonNoId, parsedResponse = null) {

  if (parsedResponse) {
    await updateConvoStatus({ userPhone: userNumber, newStatus: "tarjetaExtraviada" });
  }

  const blockedCardInfo = await findOrCreateBlockedCard(userNumber);
  const userContext = await generateBlockedCardContext(blockedCardInfo)

  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

  let isComplete;
  try {
    const parsedData = JSON.parse(assistantResponse);

    if (
      parsedData.Number ||
      parsedData.Tipo
    ) {
      await updateBlockedCard(userNumber, parsedData);
      isComplete = parsedData.Tipo && parsedData.Number;
    }

    if (!isComplete) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedData.Mensaje
        })
      );
    } else {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedData.Mensaje
        })
      );

      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `Puedes desbloquearla en cualquier momento si me lo indicas.`
        })
      );
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `¿Hay algo más en lo que te pueda ayudar?`
        })
      );

      await closeBlockedCard(userNumber)
      await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });
    }

  } catch (e) {
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: assistantResponse
      })
    );
  }
}

async function handleHorariosSucursales(userMessage, userNumber, phonNoId) {

  const userContext = `
  El usuario esta preguntando cuales son los horarios de atención de una de nuestras sucursales. Preguntale cual Sucursal.
  Todas las sucursales tienen el mismo horario de atención y teléfono, de 7AM a 7AM, 5557773333. Pero aseguremonos de contestarle de manera completa, algo como "El horario de atención de Banorte Paseo de Las Lomas es de Lunes a Viernes de 7am a 7pm. El teléfono es 5557773333". Si te contestan con un número, se trata de la HQ en Paseo de Las Lomas.

  Si puedes detectar en el mensaje del usuario una locación, por favor contesta con un json como este:
  {
    "location": "Toluca",
    "message": "El horario de atención de Banorte Toluca es de Lunes a Viernes de 7am a 7pm. El teléfono es 5557773333, estariamos encantados recibirte!"//Este mensaje es solo un ejemplo formula uno similar, intenta ser amable y coordial.
  }

  Si no puedes identificar claramente la sucursal que el cliente busca, preguntale amablemente que te proporcione la locación.
  `;

  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

  try {
    const parsedResponseLocal = JSON.parse(assistantResponse);

    if (parsedResponseLocal.location && parsedResponseLocal.message) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedResponseLocal.message
        })
      );

      await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });

    }
  } catch (e) {
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: assistantResponse
      })
    );
  }
}

async function handleResumenMovimientos(userMessage, userNumber, phonNoId) {
  await updateConvoStatus({ userPhone: userNumber, newStatus: "resumenMovimientos" });

  const userContext = `
  El usuario esta preguntando por un resumen de los últimos movimientos de su cuenta.
  Esta es una operación demostrativa, así que vamos a pedir y envíar datos falsos, no hace falta que le digas esto al usuario, pues ya lo sabe y queremos emular un flujo real. Estos son los pasos:
  1-Pidele al cliente que te proporcione un número de cliente o número de tarjeta de débito o crédito Banorte. Acepta cualquier respuesta que se vea minimamente valida. Si no te dice si es tarjeta de crédito o débito, asume que te esta enviando un número de cuenta.
  2-Si el cliente te da un número de cuenta, preguntale si quiere usar su cuenta de débito o la de crédito, algo como: "¿Quiéres ver los movimientos de tu cuenta de débito que finaliza en 1234?" , si dice que sí, utilizaremos ese número, si no, asume que usara su tarjeta de crédito ****5554.
  
  En cualquier caso contesta con un JSON cuando tengas el número de tarjeta y termines este corto flujo, algo así: 

  {
    "finalMessage": "A continuación te presento los últimos 10 movimientos de tu tarjeta de crédito/débito **** "//Aquí pon los ultimos números de la tarjeta.
  }

  Para poder ejecutar este flujo, pon mucha atención al historial de conversación donde podras ver los últimos 5 mensajes con el usuario.
  `;

  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

  try {
    const parsedResponseLocal = JSON.parse(assistantResponse);

    if (parsedResponseLocal.finalMessage) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedResponseLocal.finalMessage
        })
      );

      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `Compra - WalMart Insurgentes - $2,333\nCompra - OXXO - $200.00\nCargo Dom - Telmex - $999.00\nDonativo - Teletón - $50.00\nCompra - Liverpool Santa Fe - $3,240.00\nCompra MSI - Liverpool - $18,545.00\nPago Recibido (Gracias) - $5,000.00\nCompra - WalMart Coyoacán - $2,333\nCompra - OXXO - $200.00\nCargo Dom - SKY - $999.00
          `
        })
      );

      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `Si deseas conocer más detalles de tu cuenta, no dudes en hacérmelo saber.
          `
        })
      );

      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `¿Hay algo más en lo que te pueda ayudar?`
        })
      );

      await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });
    }
  } catch (e) {
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: assistantResponse
      })
    );
  }
}

async function handleDesactivarTarjetaAdicional(userMessage, userNumber, phonNoId) {
  await updateConvoStatus({ userPhone: userNumber, newStatus: "desactivarTarjetaAdicional" });

  const userContext = `
  El usuario esta pidiendo la desactivación de una de sus tarjetas adicionales.
  Esta es una operación demostrativa, así que vamos a pedir y envíar datos falsos, no hace falta que le digas esto al usuario, pues ya lo sabe y queremos emular un flujo real. Estos son los pasos:
  Pidele al cliente que te proporcione una tarjeta a desactivar, actualmente tiene 2 adicionales con terminaciones falsas, usa 5555, 5552, etc. Inventa 2 terminaciones X.
  
  En cualquier caso contesta con un JSON cuando tengas el número y termines este corto flujo, algo así: 

  {
    "number": "5552"//Aquí pon los ultimos números de la tarjeta.
  }

  Para poder ejecutar este flujo, pon mucha atención al historial de conversación donde podras ver los últimos 5 mensajes con el usuario.
  `;

  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

  try {
    const parsedResponseLocal = JSON.parse(assistantResponse);

    if (parsedResponseLocal.number) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `La tarjeta ****` + parsedResponseLocal.number + `está ahora desactivada. Para reactivarla puedes indicármelo según lo necesites.`
        })
      );

      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `¿Hay algo más en lo que te pueda ayudar?
          `
        })
      );
      await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });
    }
  } catch (e) {
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: assistantResponse
      })
    );
  }
}

async function handleAdelantoNomina(userMessage, userNumber, phonNoId, parsedResponse = null) {

  if (parsedResponse) {
    await updateConvoStatus({ userPhone: userNumber, newStatus: "adelantoNomina" });
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "Desde luego. ¿Por qué cantidad deseas el adelanto? Te prestamos hasta 10 veces tu nómina."
      })
    );
    return;
  }
  const adelantoInfo = await findOrCreateLuzAdelanto(userNumber);
  const userContext = await generateAdelantoContext(adelantoInfo);
  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

  try {
    JSON.parse(assistantResponse);
    const stageReturn = await updateLuzAdelanto(userNumber);

    const stage = stageReturn.newStage;
    let stageResponse;

    switch (stage) {
      case 2:
        stageResponse = "Qué plazo deseas elegir entre 2 y 12 meses";
        break;
      case 3:
        stageResponse = "La tasa de interés es del 37% CAT 40% anual. Te queda un pago mensual de $3,950.00";
        break;
      case 4:
        stageResponse = "Tu adelanto a nómina está listo. Por favor firma con tu dedo el siguiente documento para recibirlo.";
        break;
      default:
        stageResponse = "error", stage;
        break;
    }

    // Use the stageResponse in your code


    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: stageResponse
      })
    );

    if (stage == 3) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: "¿Deseas continuar?"
        })
      );
    }

    if (stage == 4) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: "Link al formulario de firma: https://firmasaptiva.vulcanics.mx/firma?convo=" + userNumber
        })
      );
    }

  } catch (e) {
    console.log(e)
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: assistantResponse
      })
    );
  }
}

async function handlePagarLuz(userMessage, userNumber, phonNoId, parsedResponse = null) {

  if (parsedResponse) {
    await updateConvoStatus({ userPhone: userNumber, newStatus: "pagarLuz" });
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "Claro. con gusto te ayudo a realizar el pago. "
      })
    );

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "Tienes registrado en tu cuenta el servicio CFE 278376187231. ¿Es el que deseas pagar?"
      })
    );
    return;
  }

  const luzInfo = await findOrCreateLuzAdelanto(userNumber);
  const userContext = await generateLuzContext(luzInfo);
  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

  try {
    JSON.parse(assistantResponse);
    const stageReturn = await updateLuzAdelanto(userNumber);

    const stage = stageReturn.newStage;
    let stageResponse;

    switch (stage) {
      case 2:
        stageResponse = "Tienes un saldo pendiente de $448 pesos.  ¿Quieres pagar este monto? Te recomiendo redondear la cantidad hacia arriba.";
        break;
      case 3:
        stageResponse = "El pago será aplicado en tu cuenta terminación ****4242. ¿Deseas proceder?";
        break;
      case 4:
        stageResponse = "Para continuar por favor ingresa tu clave Banorte";
        break;
      case 5:
        stageResponse = "Listo, tu pago ha sido aplicado con la clave de confirmación 2973298.";
        break;
      default:
        stageResponse = "error", stage;
        break;
    }

    // Use the stageResponse in your code


    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: stageResponse
      })
    );

    if (stage == 5) {
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: "¿Hay algo más en lo que te pueda ayudar?"
        })
      );
      await closeLuzAdelanto(userNumber)
      await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });
    }
  } catch (e) {
    console.log(e)
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: assistantResponse
      })
    );
  }
}


async function handleCopiaEstadoCuenta(userMessage, userNumber, phonNoId, parsedResponse = null) {

  if (parsedResponse) {
    await updateConvoStatus({ userPhone: userNumber, newStatus: "ultimoEstadoCuenta" });
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "Desde luego, por favor indícame tu clave Banorte."
      })
    );
    return;
  }

  const claveValida = true;

  if (!claveValida) {
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "Lo siento, la clave ingresada no es válida. Por favor verifica e inténtalo de nuevo."
      })
    );
    return;
  }

  try {
    

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "A continuación el último estado de cuenta generado:"
      })
    );


    const pdfFilePath = '/var/www/saptibank/saptibankAgent/src/documents/Edo_Cta_Banorte.pdf';
    let filename = "Edo_Cta_Banorte.pdf"

    await simpleSendFile(phonNoId,userNumber,pdfFilePath,filename)

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "Si deseas conocer más detalles de tu cuenta, no dudes en hacérmelo saber."
      })
    );

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "¿Hay algo más en lo que te pueda ayudar?"
      })
    );
    await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });

  } catch (e) {
    console.log(e);
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: "Lo siento, ocurrió un error al generar tu estado de cuenta. Por favor intenta más tarde."
      })
    );
  }
}



async function handleOfertasMes(userMessage, userNumber, phonNoId, parsedResponse = null) {

  const promoHeader = `🌟 *¡Promociones Banorte!* 🌟`;

  const promoOne = `1️⃣ *Hasta 24 Meses sin Intereses*
  📅 *Vigencia:* Hasta el 10 de diciembre.
  🛍️ *Aplica en:* Compras del Buen Fin.
  💳 *Beneficio:* Diferir tus compras a 24 meses sin intereses.`;

  const promoTwo = `2️⃣ *10% en Restaurantes*
  🍽️ *Aplica en:* Establecimientos participantes.
  💳 *Beneficio:* Obtén un *10% de descuento* al usar tu tarjeta Banorte.`;

  const promoThree = `3️⃣ *10% en Viajes Internacionales*
  ✈️ *Destino:* Viajes internacionales.
  💳 *Beneficio:* *10% de descuento* al pagar con tu tarjeta de crédito.`;

  const promoFooter = `¿Hay alguna promoción de la que requieras más detalles?`;

  const promotionsMessage = `${promoHeader}\n\n${promoOne}\n\n${promoTwo}\n\n${promoThree}\n\n${promoFooter}`;

  if (parsedResponse) {
    await updateConvoStatus({ userPhone: userNumber, newStatus: "ofertasMes" });

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: promoHeader
      })
    );

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: promoOne
      })
    );

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: promoTwo
      })
    );

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: promoThree
      })
    );

    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: promoFooter
      })
    );


    return;
  }



  const userContext = `
  El usuario acaba de preguntar por las promociones de la empresa: ${promotionsMessage}
  Si te pide más información sobre alguna promocion, dile que se dirija a Banorte.com/promocionXYZ (inventa la URL) y algún mensaje de promoción generico.
  En cualquier caso, dile al usuario que tenga un buen día y "¿Hay algo más en lo que te pueda ayudar?".
  `;

  const assistantResponse = await getOpenAIResponse(userContext, userMessage, userNumber);

  await sendWhatsMessage(
    phonNoId,
    textPlainMessage({
      toInput: userNumber,
      message: assistantResponse
    })
  );
  await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });
}

async function handleDesbloqueo(userNumber, phonNoId) {

  await sendWhatsMessage(
    phonNoId,
    textPlainMessage({
      toInput: userNumber,
      message: `Por supuesto, tu tarjeta quedó desbloqueada\n¿Hay algo más en lo que te pueda ayudar?`
    })
  );
}

async function handleFallbackMessage(userNumber, phonNoId, assistantResponse) {
  const fallbackMessage = textPlainMessage({ toInput: userNumber, message: assistantResponse });
  await sendWhatsMessage(phonNoId, fallbackMessage);
}

const handleMediaMessage = async (phonNoId, userNumber, msgType, message, doctype) => {
  try {
    // Extract media details from the message
    const mediaId = message[msgType].id;
    const mimeType = message[msgType].mime_type;
    const mediaType = msgType === 'document' ? 'PDF/Document' : 'Image';

    // Fetch the media file from WhatsApp
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v12.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATS_LONG_TOKEN}`,
        },
      }
    );

    // Download the media file
    const mediaResponse = await axios.get(mediaUrlResponse.data.url, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${process.env.WHATS_LONG_TOKEN}`,
      },
    });

    // Save the media to the database
    const resultiD = await saveUserDoc(userNumber, mediaResponse.data, doctype);

    if (resultiD >= 0) {
      console.log("saved");

      // Fetch the saved document using the resultiD to get the BLOB
      const documentBuffer = await getUserDoc(resultiD);

      // Prepare the file and other data for the extractor endpoint
      const formData = new FormData();
      formData.append('doc_type', doctype); // Add document type
      formData.append('document', documentBuffer, {
        filename: 'uploaded-document.pdf',
        contentType: mimeType, // This should be a valid mime type like 'application/pdf'
      });
      formData.append('convo', userNumber); // Conversation ID or related field
      formData.append('document_id', resultiD); // Unique document identifier

      try {
        // Send the data to the extractor endpoint
        const uploadResponse = await axios.post(
          'https://xtractor.saptiva.vulcanics.mx/upload',
          formData,
          {
            headers: formData.getHeaders(),
          }
        );

        // Handle successful upload
        console.log('Upload successful:', uploadResponse.data);
      } catch (error) {
        console.error('Error during upload:', error);
      }

      // Send confirmation message to user
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: `Gracias, hemos recibido tu ${doctype}.`,
        })
      );
    }
  } catch (error) {
    console.error('Error handling media message:', error);
    await sendWhatsMessage(
      phonNoId,
      textPlainMessage({
        toInput: userNumber,
        message: 'Lo siento, hubo un problema procesando tu archivo. Por favor, inténtalo de nuevo.',
      })
    );
  }
};


const generateCotizacionContext = (cotizacion, tipo) => {
  let context = `
  Estas realizando una cotización del tipo ${tipo} ahora mismo.
  Pide al usuario que te dé los datos que faltan, no puede quedar ninguno en blanco.
  Si encuentras que el usuario está actualizando cualquiera de los datos de su cotización actualiza el dato en el JSON, contesta siempre en formato JSON con todos los datos y un mensaje, si falta un dato deja en blanco, no llenes con datos placeholder o ceros, si ya tienes un dato no lo borres, solo actualizalo si es necesario. Te dejo ejemplos de como hacer las preguntas al cliente, pero formula tus propias preguntas, se amable.

  Estos son los datos que llevas recolectados, no los borres, solo actualizalos si lo ves necesario:
  `
  if (tipo == "automotriz") {
    const { Marca, Modelo, Precio, Año, Plazo } = cotizacion;
    context += `
      - Marca: ${Marca || ""}
      - Modelo: ${Modelo || ""}
      - Año: ${Año || ""}
      - Precio: ${Precio || ""}
      - Plazo: ${Plazo || ""}
      
      Ejemplos de flujo:
      Mensaje usuario: Quiero un vehiculo nuevo de 200 mil pesos.
      Respuesta:
      {
        "Marca": "",
        "Modelo": "",
        "Año": "",
        "Precio": "200000.00",
        "Plazo": "",
        "Mensaje": "Puedes indícarme la marca, modelo y año del vehículo?
      }
      
      Mensaje 2 de usuario: Claro, es un Honda Civic del 2020. 
      Respuesta 2:
      {
        "Marca": "Honda",
        "Modelo": "Civic",
        "Año": "2020",
        "Precio": "200000.00",
        "Plazo": "",
        "Mensaje": "Puedes decirme la cantidad de Plazos de tu cotización? Puede ser a 12, 24 o 36 meses." // estos plazos son fijos.
      }
      `;

  } else {
    const { CP, Precio, Plazo } = cotizacion;
    context += `
      - Código Postal: ${CP || ""}
      - Precio: ${Precio || ""}
      - Plazo: ${Plazo || ""}
      
      Ejemplos de flujo:
      Mensaje usuario: Quiero un terreno de 200 mil pesos.
      Respuesta:
      {
        "CP": "",
        "Precio": "200000.00",
        "Plazo": "",
        "Mensaje": "Puedes decirme la cantidad de Plazos de tu cotización?. Puede ser a 10, 15 o 20 años" // estos plazos son fijos.
      }
      
      Mensaje 2 de usuario: Claro, seria a 10 años. 
      Respuesta 2:
      {
        "CP": "",
        "Precio": "200000.00",
        "Plazo": "15",
        "Mensaje": "Indícame el código postal del inmueble por favor".
      }
      `;
  }
  context += `Si en tu retorno cuentas con todos los datos, en el mensaje final informale al cliente que se le entregara en breve un documento pdf con su cotización, que espere un momento.`;

  return context;

};

const generateNewAccContext = (nuevaCuenta) => {
  const { Tipo, Nuevo, Profesion, Transacciones, Monto, PEP, Form } = nuevaCuenta;
  if (!Form && (Tipo && Nuevo && Profesion && Transacciones && Monto && PEP)) {
    return `Estas ayudando a un usuario a crear una nueva cuenta Banorte, tu cliente esta en el último paso el cual consite en realizar una firma electronica, le acabas de proporcionar un link para que firme. Por favor, indicale que para completar su proceso, debe entrar al link, firmar en el recuadro con su firma electronica y hacer click en "Guardar Firma".
    
    Añade tu mensaje a este JSON y envia dicho JSON como respuesta:

    {
      "Tipo": ${Tipo || ""},
      "Profesion": ${Profesion || ""},
      "Transacciones": ${Transacciones || ""},
      "Monto": ${Monto || ""},
      "PEP": ${PEP || ""},
      "Nuevo": ${Nuevo || ""},
      "Mensaje": "" //Agrega tu mensaje aqui.
    }
    `
  }

  let context = `
  Estas ayudando a un usuario a crear una nueva cuenta.
  Pide al usuario que te dé los datos que faltan, no puede quedar ninguno en blanco.
  Si encuentras que el usuario está actualizando cualquiera de los datos de su cotización, envíame un JSON con todos los datos actualizados y un mensaje, si falta un dato deja en blanco, no llenes con datos placeholder o ceros. Te dejo ejemplos de como hacer las preguntas al cliente, pero formula tus propias preguntas, se amable.

  Estos son los datos que llevas recolectados:
  `
  context += `
      - Tipo: ${Tipo || ""}
      - Nuevo: ${Nuevo || ""}
      - Profesión: ${Profesion || ""}
      - Transacciones: ${Transacciones || ""}
      - Monto: ${Monto || ""}
      - PEP: ${PEP || ""}

      Ejemplos de flujo:
      Mensaje usuario: No tengo cuenta con uds
      Respuesta inicial (Como se detecto que el usuario es nuevo, enviame un JSON con todos los datos.):
      {
        "Tipo": "",//Ahorro, inversión o nómina. Siempre debe ser la segunda pregunta.
        "Profesion": "",
        "Transacciones": "", // Por mes
        "Monto": "", // Mensual
        "PEP": "",// Si el cliente es PEP o no.
        "Nuevo": "Si" //Esto es un si o no, es la primera pregunta que debes conocer, si es un nuevo usuario o si ya tiene alguna cuenta con nosotros. Siempre pregunta esto si no tienes el dato, nunca lo asumas.
        "Mensaje": "Entiendo, te ayudare a abrir tu primera cuenta. Puedes decirme que tipo de cuenta sera?"
      }

      Mensaje 2 de usuario: Claro, sería una cuenta de ahorro.
      Respuesta 2 (Como se detecto que el usuario quiere una cuenta de ahorro, enviame un JSON con todos los datos, en este caso se agrega el tipo.):
      {
        "Tipo": "Ahorro",
        "Profesion": "",
        "Transacciones": "",
        "Monto": "",
        "PEP": "",
        "Nuevo": "Si",
        "Mensaje": "¿Cuál es tu profesión?"
      }
      `;

  return context + `Recuerda, si cualquiera de los datos se actualiza, incluso si es solo 1, debes actualizar el campo en el JSON con TODOS los datos, así mismo, jamas remuevas un dato que ya tienes, un JSON terminado se ve así:
      {
        "Tipo": "Ahorro",
        "Profesion": "Contador",
        "Transacciones": "20",
        "Monto": "30000",
        "PEP": "No",
        "Nuevo": "Si",
        "Mensaje": "Terminamos!"
      }
      Siempre contesta en formato JSON. MUY IMPORTANTE JAMAS BORRES INFORMACIón QUE YA TENGAS.
  `;

};

const generateAdditionalCardContext = (newCardInfo) => {

  let context = `
  Estas ayudando a un cliente a solicitar una tarjeta adicional ahora mismo.
  Pide al usuario que te dé los datos que faltan, no puede quedar ninguno en blanco.
  Si encuentras que el usuario está actualizando cualquiera de los datos de su cotización actualiza el dato en el JSON, contesta siempre en formato JSON con todos los datos y un mensaje, si falta un dato deja en blanco, no llenes con datos placeholder o ceros, si ya tienes un dato no lo borres, solo actualizalo si es necesario. Te dejo ejemplos de como hacer las preguntas al cliente, pero formula tus propias preguntas, se amable.

  Estos son los datos que llevas recolectados:
  `
  const { Name, Relation, Limite, RFC } = newCardInfo;
  context += `
      - A nombre de quien esta la tarjeta: ${Name || ""}
      - Cual es la relación con la persona a quien se nombra en la tarjeta: ${Relation || ""}
      - Límite de crédito: ${Limite || ""}
      - RFC de la persona: ${RFC || ""}
      
      Ejemplos de flujo:
      Mensaje usuario: Quiero una tarjeta nueva para mi hijo
      Respuesta:
      {
        "Name": "",
        "Relation": "Hijo",
        "Limite": "",
        "RFC": "",
        "Mensaje": "Puedes indícarme cual es su nombre y RFC?
      }
      
      Mensaje 2 de usuario: Si claro, se llama Tomás Aguilar, su RFC es JJCA900425KKK
      Respuesta 2:
      {
        "Name": "Tomás Aguilar",
        "Relation": "Hijo",
        "Limite": "",
        "RFC": "JJCA900425KKK",
        "Mensaje": "Gracias, puedes decirme cual es el límite de crédito que planeas otorgarle?
      }
      `;
  context += `Si en tu retorno cuentas con todos los datos, en el mensaje final informale al cliente que el proceso finalizo y Su tarjeta estará disponible para recoger en la sucursal 556 (Prado Norte) en los siguientes 10 días hábiles.`;

  return context;

};

const generateAdelantoContext = (adelantoInfo) => {

  const { Stage } = adelantoInfo;

  let context = `Estas trabajando en una funcion DEMO, la cual es meramente demostrativa. Actualmente, el cliente esta solicitando el servicio adelanto de nómina. Para avanzar el flujo, nos basaremos en estadios "Stages", si el cliente te contesta una respuesta valida, envía como respuesta un JSON así:
  {
    "advance": "true"
  }

  De lo contrario, envía un mensaje normal sin el formato JSON.

  Te recomiendo prestar atención al historial de conversación para manejar bien el contexto. A continuación te digo los criterios para avanzar el estadio actual:
  `
  switch (Stage) {
    case '1':
      context += `Stage 1: Cantidad a adelantar: Le preguntamos al usuario que confirme la cantidad que desea adelantar, no podemos avanzar este estadio hasta que el usuario nos confirme una cantiadad númerica o decimal valida (es dinero)`;
      return context;
    case '2':
      context += `Stage 2: Plazo: Le preguntamos al usuario que plazo desea elegir, no podemos avanzar este estadio hasta que el usuario nos confirme un plazo valido (entre 2 y 12 meses)`;
      return context;
    case '3':
      context += `Stage 3: Interés del CAT: Le preguntamos al usuario que confirme si acepta la tasa de interés, no podemos avanzar este estadio hasta que el usuario nos confirme si lo acepta.`;
      return context;
    case '4':
      context += `Stage 4: En este punto el usuario necesita otorgar su firma digital en un portal externo, cuado lo haga, este stage avanzara automaticamente. No importa lo que el usuario te conteste, indicale que para continuar, necesita firmar el formulario adjunto. Jamás lo dejes continuar, si el usuario esta en este stage, significa que no ha llenado el formulario.`;
      return context;
    default:
      return "error";
  }

};
const generateLuzContext = (luzInfo) => {

  const { Stage } = luzInfo;

  let context = `Estas trabajando en una funcion DEMO, la cual es meramente demostrativa. Actualmente, el cliente esta solicitando el servicio de pago de luz. Para avanzar el flujo, nos basaremos en estadios "Stages", si el cliente te contesta una respuesta valida, envía como respuesta un JSON así:
  {
    "advance": "true"
  }

  De lo contrario, envía un mensaje normal sin el formato JSON.

  Te recomiendo prestar atención al historial de conversación para manejar bien el contexto. A continuación te digo los criterios para avanzar el estadio actual:
  `
  switch (Stage) {
    case '1':
      context += `Stage 1: Cuenta de servicio de CFE: Le preguntamos al usuario que confirme su cuenta de servicio de CFE, no podemos avanzar este estadio hasta que el usuario nos confirme un número`;
      return context;
    case '2':
      context += `Stage 2: Saldo pendiente: Le preguntamos al usuario que confirme su saldo pendiente, no podemos avanzar este estadio hasta que el usuario nos confirme un monto`;
      return context;
    case '3':
      context += `Stage 3: Ejecución del pago sobre una cuenta: Le preguntamos al usuario que confirme que se complete el proceso, no podemos avanzar este estadio hasta que el usuario nos confirme una cuenta (4 números al final de su tarjeta) o diga que sí a la que le recomendamos.`;
      return context;
    case '4':
      context += `Stage 4: Clave de Banorte: Le preguntamos al usuario nos proporcione su clave de Banorte, no podemos avanzar este estadio hasta que el usuario nos confirme una cuenta (cualquier cadena de números)`;
      return context;
    default:
      return "error";
  }

};

const generateBlockedCardContext = (blockedCardInfo) => {

  let context = `
  Estas ayudando a un cliente a bloquear una tarjera extraviada.
  Pide al usuario que te dé los datos que faltan, no puede quedar ninguno en blanco.
  Si encuentras que el usuario está actualizando cualquiera de los datos de su cotización actualiza el dato en el JSON, contesta siempre en formato JSON con todos los datos y un mensaje, si falta un dato deja en blanco, no llenes con datos placeholder o ceros, si ya tienes un dato no lo borres, solo actualizalo si es necesario. Te dejo ejemplos de como hacer las preguntas al cliente, pero formula tus propias preguntas, se amable.

  Estos son los datos que llevas recolectados:
  `
  const { Tipo, Number } = blockedCardInfo;
  context += `
      - Número de la tarjeta, incialmente pide el propio número de la tarjeta, pero si el clientente no lo tiene, puede ser el número de cuenta: ${Number || ""}
      - Tipo de tarjeta: ${Tipo || ""}, El cliente tiene 2 tarjetas, una de débito y una de crédito oro, pregunta cual de las 2 es la que quiere bloquear, despues de conocer el número.
      
      Ejemplos de flujo:
      Mensaje usuario: Perdí mi tarjeta
      Respuesta:
      {
        "Number": "",
        "Tipo": "",
        "Mensaje": "Lamento escuchar eso. ¿Puedes confirmar tu últimos 4 dígitos de la tarjeta a bloquear?"
      }
      
      Mensaje 2 de usuario: No los tengo, no lo puedo recordar mí número de cliente es 123456
      Respuesta 2:
      {
        "Number": "123456",
        "Tipo": "",
        "Mensaje": "No hay problema, podemos utilizar tu número de cliente. Tienes 2 tarjetas activas, una de débito y una de crédito oro. ¿Cuál es la que te gustaría deshabilitar?"
      }

      Mensaje 3 de usuario: La Oro
      Respuesta 2:
      {
        "Number": "123456",
        "Tipo": "Crédito Oro",
        "Mensaje": "Gracias. Tu tarjeta ha quedado bloqueada temporalmente." //Envía un mensaje similar cuando tengas toda la info, no existe un proceso de repocición así que no des más detalles fuera de este mensaje
      }
      `;

  return context;

};

const generateNominaAdvanceContext = (nominaAdvanceInfo) => {
  let context = `
  Estas ayudando a un cliente a solicitar un adelanto de nómina ahora mismo.
  Pide al usuario que te dé los datos que faltan, no puede quedar ninguno en blanco.
  Si encuentras que el usuario está actualizando cualquier dato, actualiza el JSON. Contesta siempre en formato JSON con todos los datos y un mensaje. Si falta un dato, déjalo en blanco; no llenes con datos placeholder o ceros. Si ya tienes un dato, no lo borres, solo actualízalo si es necesario.

  Estos son los datos que llevas recolectados, recuerda que MonthlyPayment tu lo calculas internamente una vez que tengas el Monto y el Plazo:
  `;
  const { Monto, Plazo } = nominaAdvanceInfo;
  context += `
      - Monto solicitado: ${Monto || ""}
      - Plazo (en meses): ${Plazo || ""}
      
      Ejemplos de flujo:
      Mensaje usuario: Quiero un adelanto de nómina
      Respuesta:
      {
        "Monto": "",
        "Plazo": "",
        "MonthlyPayment": "",
        "Mensaje": "¿Por qué cantidad deseas el adelanto? Te prestamos hasta 10 veces tu nómina."
      }
      
      Mensaje 2 de usuario: 30,000
      Respuesta 2:
      {
        "Monto": "30,000",
        "Plazo": "",
        "MonthlyPayment": "",
        "Mensaje": "Qué plazo deseas elegir entre 2 y 12 meses?"
      }

      Mensaje 3 de usuario: 12
      Respuesta 3:
      {
        "Monto": "30,000",
        "Plazo": "12",
        "MonthlyPayment": "$3,950.00",
        "Mensaje": "La tasa de interés es del 37% CAT 40% anual. Te queda un pago mensual de $3,950.00. ¿Deseas continuar?"
      }

      Mensaje 4 de usuario: Sí
      Respuesta 4:
      {
        "Monto": "30,000",
        "Plazo": "12",
        "MonthlyPayment": "$3,950.00",
        "Mensaje": "Por favor firma con tu dedo el siguiente documento para recibir tu adelanto: https://www.saptiva.com"
      }

      Mensaje 5 de usuario: (firma cargada)
      Respuesta 5:
      {
        "Monto": "30,000",
        "Plazo": "12",
        "MonthlyPayment": "$3,950.00",
        "Signature": "Firma recibida",
        "Mensaje": "Felicidades, tu adelanto a nómina está listo. Tu dinero ya está disponible en la cuenta ****5554."
      }
  `;

  return context;
};



async function sendDocument(phonNoId, userNumber, url, tipo) {
  const pdfFilePath = url;
  await delay(3000);

  if (fs.existsSync(pdfFilePath)) {
    await sendFile(phonNoId, userNumber, pdfFilePath, 'document', `Cotización ${tipo}.pdf`);
    return true;
  }
  return false;
}

async function sendFile(phonNoId, userNumber, filePath, type, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileBase64 = fileBuffer.toString('base64');

  const fileId = await saveMedia({ phonNumId: phonNoId, stringBits: fileBase64, filename: filename });

  const fileMessage = type === 'document'
    ? documentMessageById({ toInput: userNumber, type: 'document', id: fileId.id, filename: filename })
    : mediaMessageById(userNumber, 'image', fileId.id);

  await sendWhatsMessage(phonNoId, fileMessage);
}

async function handleCancelIntent(currentStatus, userMessage, userNumber, phonNoId) {
  if (currentStatus === "Nuevo Chat") return;

  const cancelContext = `
  Revisa el mensaje del usuario e infiere si desea cancelar el proceso que esta realizando, reiniciar el flujo de conversación y en general, reiniciar la conversación.
  Si consideras que esa es su intención, regresa un JSON como el siguiente:
  {
    "action": "cancel" // Para cancelar el proceso actual y reiniciar.
    "message": "Ok podemos parar el proceso actual, ¿Hay algo más en lo que te pueda ayudar?"// mensaje que quieras enviar al usuario
  }

  Utiliza el historial como contexto para decidir si un usuario quiere realmente terminar un proceso, por ejemplo, se le puede estar preguntando anteriormente a un usuario si quiere realizar el proceso de validación de su cotización. Si respondió/responde que no, debes contestarle algo como "De acuerdo, no realizaremos el proceso de validación de la solicitud. ¿Hay algo más en lo que te pueda ayudar?"
  Si no detectas la intención de reiniciar la convesación / cancelar el proceso actual, envía un "OK". Se bastante estricto con tus deducciones, un cliente preguntando si un crédito puede ser a un plazo diferente no se considera como querer cancelar, tampoco si un cliente tiene alguna queja o si te pregunta sobre un paso anterior, asegurate de que el cliente verdaderamente quiera detener su flujo.

  No te confundas, cuando un usuario pida el borrado de sus datos, no significa que quiera realizar esta operacion.
  `;

  try {
    // Send the user message to the LLM for intent detection
    const assistantResponse = await getOpenAIResponse(cancelContext, userMessage, userNumber);

    // Attempt to parse the assistant's response as JSON
    const parsedResponse = JSON.parse(assistantResponse);

    if (parsedResponse.action === "cancel") {
      // Reset conversation to "Nuevo Chat"
      await updateConvoStatus({ userPhone: userNumber, newStatus: "Nuevo Chat" });
      await closeCotizacion(userNumber);
      await closeAdditionalCard(userNumber);
      await closeBlockedCard(userNumber);
      await closeNewAcc(userNumber);
      await closeLuzAdelanto(userNumber);

      // Respond to the user
      await sendWhatsMessage(
        phonNoId,
        textPlainMessage({
          toInput: userNumber,
          message: parsedResponse.message
        })
      );

      return true; // Indicates that the conversation was reset
    }
  } catch (error) {
  }

  return false; // Indicates that no cancellation occurred
}

async function checkUserDocuments(userNumber, userMessage, usageText, checkFlags = { checkID: true, checkProofOfAddress: true, checkProofOfIncome: true, checkFoto: false }) {
  const requiredDocuments = [
    {
      name: "Identificación Oficial (INE)",
      check: checkFlags.checkID,
      checkFunction: async () => await checkForUserID(userNumber),
      prompt: usageText + ", necesitamos que nos envíe su identificación oficial (INE)"
    },
    {
      name: "Comprobante de Domicilio",
      check: checkFlags.checkProofOfAddress,
      checkFunction: async () => await checkForUserDocument(userNumber, "Comprobante de Domicilio"),
      prompt: usageText + ", necesitamos que nos envíe un comprobante de domicilio (recibo de luz CFE)"
    },
    {
      name: "Comprobante de Ingresos",
      check: checkFlags.checkProofOfIncome,
      checkFunction: async () => await checkForUserDocument(userNumber, "Comprobante de Ingresos"),
      prompt: usageText + ", necesitamos un comprobante de ingresos para continuar con el proceso (estado de cuenta bancario)"
    },
    {
      name: "Foto",
      check: checkFlags.checkFoto,
      checkFunction: async () => await checkForUserDocument(userNumber, "Foto"),
      prompt: usageText + ", necesitamos una foto para validar la identidad del usuario (foto de la cara)"
    }
  ];

  for (const document of requiredDocuments) {
    if (document.check) {
      const hasDocument = await document.checkFunction();
      if (!hasDocument) {
        document.prompt += "Considera que si te llega un mensaje en blanco, es muy posiblemente un documento"
        return await getOpenAIResponse(document.prompt, userMessage, userNumber);
      }
    }
  }

  return false;
}


async function generatePDF(modelo, marca, precio, periodo, number) {


  const doc = new PDFDocument({ margin: 30 });


  // Obtener el timestamp actual
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0'); // Día con dos dígitos
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Mes con dos dígitos
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0'); // Horas con dos dígitos
  const minutes = now.getMinutes().toString().padStart(2, '0'); // Minutos con dos dígitos

  // Crear el nombre del archivo
  const fileName = `cotizacion-${day}${month}${year}-${hours}-${minutes}.pdf`;

  // Definir el archivo de salida
  const filePath = `/var/www/saptibank/saptibankAgent/src/documents/${fileName}`;

  // Datos iniciales
  const valorTotal = precio;
  const ivaRate = 0.16;
  const tasaAnual = 0.12;
  const plazo = periodo;
  const enganche = 0.10;

  const iva = valorTotal * ivaRate;

  const valorparcial = valorTotal - iva;

  const valorConIva = valorTotal;
  const engancheTotal = valorConIva * enganche;
  const valorFinanciado = valorConIva - engancheTotal;

  function calcularAmortizacion(valor, tasaAnual, plazo) {
    const tasaMensual = tasaAnual / 12;
    const rentaMensual = valor * (tasaMensual / (1 - Math.pow(1 + tasaMensual, -plazo)));
    let saldoInicial = valor;
    const rows = [];

    for (let i = 1; i <= plazo; i++) {
      const interes = saldoInicial * tasaMensual;
      const abonoCapital = rentaMensual - interes;
      const saldoFinal = saldoInicial - abonoCapital;

      rows.push([
        i,
        saldoInicial.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        rentaMensual.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        interes.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        abonoCapital.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        saldoFinal > 0 ? saldoFinal.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00',
      ]);

      saldoInicial = saldoFinal;
    }

    return rows;
  }

  function drawTable(doc, startX, startY, headers, rows) {
    const cellWidth = 90;
    const cellHeight = 20;
    const pageHeight = doc.page.height;
    const marginBottom = 50;

    let currentY = startY;

    headers.forEach((header, i) => {
      const x = startX + i * cellWidth;
      doc
        .rect(x, currentY, cellWidth, cellHeight)
        .fillAndStroke('#ed1629', '#ed1629')
        .fillColor('white')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(header, x + 5, currentY + 5, { width: cellWidth - 10, align: 'center' });
    });

    currentY += cellHeight;

    rows.forEach((row, rowIndex) => {
      if (currentY + cellHeight > pageHeight - marginBottom) {
        doc.addPage();
        currentY = 50;

        headers.forEach((header, i) => {
          const x = startX + i * cellWidth;
          doc
            .rect(x, currentY, cellWidth, cellHeight)
            .fillAndStroke('#ed1629', '#ed1629')
            .fillColor('white')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(header, x + 5, currentY + 5, { width: cellWidth - 10, align: 'center' });
        });

        currentY += cellHeight;
      }

      const backgroundColor = rowIndex % 2 === 0 ? '#f8f8f8' : '#ffffff';

      row.forEach((cell, colIndex) => {
        const x = startX + colIndex * cellWidth;

        doc
          .rect(x, currentY, cellWidth, cellHeight)
          .fill(backgroundColor)
          .fillColor('black')
          .font('Helvetica')
          .fontSize(8)
          .text(cell, x + 5, currentY + 5, { width: cellWidth - 10, align: 'center' });
      });

      currentY += cellHeight;
    });
  }

  doc.pipe(fs.createWriteStream(filePath));

  doc
    .image('/var/www/saptibank/saptibankAgent/src/services/img/Logo_de_Banorte_neutral.png', 20, 10, { width: 100 });

  doc

    .image('/var/www/saptibank/saptibankAgent/src/services/img/Banorte-logo.png', 160, 70, { width: 300 });

  doc
    .moveDown(10)
    .fontSize(20)
    .font('Helvetica-Bold')
    .fillColor('#ed1629')
    .text('Cotización a:', { indent: 20 });


  doc
    .moveDown(.5)
    .fontSize(12)
    .fillColor('black')
    .font('Helvetica-Bold')
    .text('Nombre del Cliente: ', { continued: true, indent: 20 })
    .font('Helvetica')
    .text(number, { indent: 20 })
    .moveDown(0.5)
    .font('Helvetica-Bold')
    .text('Marca: ', { continued: true, indent: 20 })
    .font('Helvetica')
    .text(marca, { indent: 20 })
    .moveDown(0.5)
    .font('Helvetica-Bold')
    .text('Modelo: ', { continued: true, indent: 20 })
    .font('Helvetica')
    .text(modelo, { indent: 20 });

  doc
    .moveDown(1)
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('Valor Parcial: ', { continued: true, indent: 20 })
    .font('Helvetica')
    .text(`$${valorparcial.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { indent: 20 })
    .moveDown(0.5)
    .font('Helvetica-Bold')
    .text('IVA (16%): ', { continued: true, indent: 20 })
    .font('Helvetica')
    .text(`$${iva.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { indent: 20 })
    .moveDown(0.5)
    .font('Helvetica-Bold')
    .text('Valor del equipo con IVA: ', { continued: true, indent: 20 })
    .font('Helvetica')
    .text(`$${valorConIva.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { indent: 20 })
    .moveDown(0.5)
    .font('Helvetica-Bold')
    .text('Enganche (20%): ', { continued: true, indent: 20 })
    .font('Helvetica')
    .text(`$${engancheTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { indent: 20 })
    .moveDown(0.5)
    .font('Helvetica-Bold')
    .text('Monto a financiar: ', { continued: true, indent: 20 })
    .font('Helvetica')
    .text(`$${valorFinanciado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, { indent: 20 });

  const amortizacion = calcularAmortizacion(valorFinanciado, tasaAnual, plazo);

  doc
    .moveDown(2)
    .fontSize(14)
    .font('Helvetica-Bold')
    .fillColor('#ed1629')
    .text(`Tabla de Amortización - ${plazo} meses`, { align: 'center' });

  const headers = ['Periodo', 'Saldo Inicial', 'Pago Mensual', 'Interés', 'Abono Capital', 'Saldo Final'];
  drawTable(doc, 50, doc.y + 10, headers, amortizacion);

  doc
    .fontSize(10)
    .fillColor('gray')
    .text('Banorte - Todos los derechos reservados.', 50, doc.page.height - 50, { align: 'center' });

  doc.end();
  return `/var/www/saptibank/saptibankAgent/src/documents/${fileName}`;
}


async function generatePDFHipoteca(precio, plazo, cp, nombreCliente) {
  const PDFDocument = require("pdfkit");
  const fs = require("fs");

  const doc = new PDFDocument({ margin: 30 });

  // Obtener timestamp actual
  const now = new Date();
  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");

  const fileName = `cotizacion-hipoteca-${day}${month}${year}-${hours}-${minutes}.pdf`;
  const filePath = `/var/www/saptibank/saptibankAgent/src/documents/${fileName}`;

  // Datos iniciales
  const ivaRate = 0.16;
  const tasaAnual = 0.12;
  const engancheRate = 0.10;

  const iva = precio * ivaRate;
  const valorConIva = precio + iva;
  const engancheTotal = precio * engancheRate;
  const valorFinanciado = precio - engancheTotal;
  plazo = plazo * 12;

  // Función para calcular tabla de amortización
  function calcularAmortizacion(valor, tasaAnual, plazo) {
    const tasaMensual = tasaAnual / 12;
    const rentaMensual = valor * (tasaMensual / (1 - Math.pow(1 + tasaMensual, -plazo)));
    let saldoInicial = valor;
    const rows = [];

    for (let i = 1; i <= plazo; i++) {
      const interes = saldoInicial * tasaMensual;
      const abonoCapital = rentaMensual - interes;
      const saldoFinal = saldoInicial - abonoCapital;

      rows.push([
        i,
        saldoInicial.toLocaleString("en-US", { minimumFractionDigits: 2 }),
        rentaMensual.toLocaleString("en-US", { minimumFractionDigits: 2 }),
        interes.toLocaleString("en-US", { minimumFractionDigits: 2 }),
        abonoCapital.toLocaleString("en-US", { minimumFractionDigits: 2 }),
        saldoFinal > 0 ? saldoFinal.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0.00",
      ]);

      saldoInicial = saldoFinal;
    }

    return rows;
  }

  // Función para dibujar tabla
  function drawTable(doc, startX, startY, headers, rows) {
    const cellWidth = 90;
    const cellHeight = 20;
    const pageHeight = doc.page.height;
    const marginBottom = 50;

    let currentY = startY;

    headers.forEach((header, i) => {
      const x = startX + i * cellWidth;
      doc
        .rect(x, currentY, cellWidth, cellHeight)
        .fillAndStroke('#ed1629', '#ed1629')
        .fillColor('white')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(header, x + 5, currentY + 5, { width: cellWidth - 10, align: 'center' });
    });

    currentY += cellHeight;

    rows.forEach((row, rowIndex) => {
      if (currentY + cellHeight > pageHeight - marginBottom) {
        doc.addPage();
        currentY = 50;

        headers.forEach((header, i) => {
          const x = startX + i * cellWidth;
          doc
            .rect(x, currentY, cellWidth, cellHeight)
            .fillAndStroke('#ed1629', '#ed1629')
            .fillColor('white')
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(header, x + 5, currentY + 5, { width: cellWidth - 10, align: 'center' });
        });

        currentY += cellHeight;
      }

      const backgroundColor = rowIndex % 2 === 0 ? '#f8f8f8' : '#ffffff';

      row.forEach((cell, colIndex) => {
        const x = startX + colIndex * cellWidth;

        doc
          .rect(x, currentY, cellWidth, cellHeight)
          .fill(backgroundColor)
          .fillColor('black')
          .font('Helvetica')
          .fontSize(8)
          .text(cell, x + 5, currentY + 5, { width: cellWidth - 10, align: 'center' });
      });

      currentY += cellHeight;
    });
  }

  // Inicio del PDF
  doc.pipe(fs.createWriteStream(filePath));

  doc.image('/var/www/saptibank/saptibankAgent/src/services/img/Logo_de_Banorte_neutral.png', 20, 10, { width: 100 });
  doc.image('/var/www/saptibank/saptibankAgent/src/services/img/Banorte-logo.png', 160, 70, { width: 300 });

  doc
    .moveDown(10)
    .fontSize(20)
    .font("Helvetica-Bold")
    .fillColor("#2E5DF5")
    .text("Cotización Hipoteca:", { indent: 20 });

  // Información del cliente
  doc
    .moveDown(1)
    .fontSize(12)
    .fillColor("black")
    .font("Helvetica-Bold")
    .text("Cliente: ", { continued: true, indent: 20 })
    .font("Helvetica")
    .text(nombreCliente, { indent: 20 })
    .moveDown(0.5)
    .font("Helvetica-Bold")
    .text("Código Postal: ", { continued: true, indent: 20 })
    .font("Helvetica")
    .text(cp, { indent: 20 });

  // Información financiera
  doc
    .moveDown(1)
    .font("Helvetica-Bold")
    .text("Monto Total: ", { continued: true, indent: 20 })
    .font("Helvetica")
    .text(`$${precio.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { indent: 20 })
    .moveDown(0.5)
    .font("Helvetica-Bold")
    .text("Enganche (10%): ", { continued: true, indent: 20 })
    .font("Helvetica")
    .text(`$${engancheTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { indent: 20 })
    .moveDown(0.5)
    .font("Helvetica-Bold")
    .text("Monto Financiado: ", { continued: true, indent: 20 })
    .font("Helvetica")
    .text(`$${valorFinanciado.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { indent: 20 });

  // Generar y dibujar tabla de amortización
  const amortizacion = calcularAmortizacion(valorFinanciado, tasaAnual, plazo);

  doc
    .moveDown(2)
    .fontSize(14)
    .font("Helvetica-Bold")
    .fillColor('#ed1629')
    .text(`Tabla de Amortización - ${plazo} meses`, { align: "center" });

  const headers = ["Periodo", "Saldo Inicial", "Pago Mensual", "Interés", "Abono Capital", "Saldo Final"];
  drawTable(doc, 50, doc.y + 10, headers, amortizacion);

  doc
    .fontSize(10)
    .fillColor('gray')
    .text('Banorte - Todos los derechos reservados.', 50, doc.page.height - 50, { align: 'center' });

  doc.end();
  return `/var/www/saptibank/saptibankAgent/src/documents/${fileName}`;
}

async function simpleSendFile(phonNoId, userNumber, filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileBase64 = fileBuffer.toString('base64');

  const fileId = await saveMedia({ phonNumId: phonNoId, stringBits: fileBase64, filename});

  const fileMessage = documentMessageById({ toInput: userNumber, type: 'document', id: fileId.id, filename})

  await sendWhatsMessage(phonNoId, fileMessage);
}


module.exports = {
  callback,
  postValues
}
