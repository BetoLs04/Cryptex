import {
  createAuthenticatedClient,
  OpenPaymentsClientError,
  isPendingGrant,
} from "@interledger/open-payments";
import { randomUUID } from "crypto";
import readline from "readline/promises";
import fetch from "node-fetch";

// TUS CREDENCIALES
const WALLET_ADDRESS = "https://ilp.interledger-test.dev/user";
const PRIVATE_KEY_PATH = "backend/private.key";
const KEY_ID = "0841b666-c298-4c5b-aab0-19eda3d697e6";
const RECEIVING_WALLET = "https://ilp.interledger-test.dev/gouber";

// Función con timeout mejorada
function withTimeout(promise, ms, errorMessage = "Timeout") {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), ms)
  );
  
  return Promise.race([promise, timeoutPromise]);
}

// Función para logging consistente
function logStep(step, message) {
  console.log(`\n${step} ${message}`);
}

async function main() {
  try {
    logStep("🔑", "Creando cliente autenticado...");
    const client = await createAuthenticatedClient({
      walletAddressUrl: WALLET_ADDRESS,
      privateKey: PRIVATE_KEY_PATH,
      keyId: KEY_ID,
    });

    logStep("📭", "Obteniendo wallet address...");
    const walletAddress = await withTimeout(
      client.walletAddress.get({ url: WALLET_ADDRESS }),
      10000,
      "Timeout obteniendo wallet address"
    );

    logStep("✅", `Wallet address obtenida: ${walletAddress.id}`);
    logStep("🌐", `Auth Server: ${walletAddress.authServer}`);

    // 1. Test de conectividad al endpoint de grants
    logStep("🔍", "Probando endpoint de grants...");
    await testGrantEndpoint(walletAddress.authServer);

    // 2. Intentar obtener grant
    logStep("🎫", "Solicitando grant para incoming payment...");
    await requestGrant(client, walletAddress.authServer);

  } catch (error) {
    handleError(error);
  }
}

// Función separada para testear endpoint
async function testGrantEndpoint(authServer) {
  try {
    const testResponse = await fetch(`${authServer}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: {
          access: [{ type: "incoming-payment", actions: ["create", "read"] }]
        }
      }),
      timeout: 15000
    });
    
    console.log(`✅ Endpoint /grant responde. Status: ${testResponse.status}`);
    
  } catch (testError) {
    console.error("❌ Error probando endpoint /grant:", testError.message);
    // No re-lanzamos el error, es solo un test
  }
}

// Función separada para solicitar grant
async function requestGrant(client, authServer) {
  try {
    const incomingGrant = await withTimeout(
      client.grant.request(
        { url: authServer },
        {
          access_token: {
            access: [{
              type: "incoming-payment",
              actions: ["list", "read", "read-all", "complete", "create"],
            }],
          },
        }
      ),
      30000,
      "Timeout: El servidor no respondió en 30 segundos"
    );

    logStep("✅", "¡GRANT OBTENIDO EXITOSAMENTE!");
    console.log(JSON.stringify({
      access_token: !!incomingGrant.access_token,
      interact: !!incomingGrant.interact,
      continue: !!incomingGrant.continue
    }, null, 2));

    return incomingGrant;

  } catch (grantError) {
    logStep("❌", "Error en la solicitud del grant:");
    console.error("Mensaje:", grantError.message);
    
    if (grantError.response) {
      console.error("Status:", grantError.response.status);
      console.error("URL:", grantError.response.config?.url);
    }
    
    throw grantError; // Re-lanzamos para manejo superior
  }
}

// Función centralizada para manejo de errores
function handleError(error) {
  logStep("💥", "Error general en el proceso:");
  
  if (error.response?.status === 401) {
    console.log("🔐 ERROR DE AUTENTICACIÓN - Verifica:");
    console.log("   • private.key path: backend/private.key");
    console.log("   • keyId: 0841b666-c298-4c5b-aab0-19eda3d697e6");
  } else if (error.message.includes("Timeout")) {
    console.log("⏰ TIMEOUT - El servidor no responde:");
    console.log("   • Servidores de Open Payments pueden estar caídos");
    console.log("   • Reintenta en unas horas");
  } else {
    console.error("Error details:", error.message);
  }
}

// Ejecutar la aplicación
main().catch(handleError);