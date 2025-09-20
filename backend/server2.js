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

// Función con timeout
function withTimeout(promise, ms, errorMessage = "Timeout") {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

(async () => {
  try {
    console.log("🔑 Creando cliente autenticado...");
    const client = await createAuthenticatedClient({
      walletAddressUrl: WALLET_ADDRESS,
      privateKey: PRIVATE_KEY_PATH,
      keyId: KEY_ID,
    });

    console.log("📭 Obteniendo wallet address...");
    const walletAddress = await withTimeout(
      client.walletAddress.get({ url: WALLET_ADDRESS }),
      10000,
      "Timeout obteniendo wallet address"
    );

    console.log("✅ Wallet address obtenida:", walletAddress.id);
    console.log("🌐 Auth Server:", walletAddress.authServer);

    // Probemos el endpoint específico de grants
    console.log("🔍 Probando endpoint de grants...");
    try {
      const testResponse = await fetch(`${walletAddress.authServer}/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: {
            access: [
              {
                type: "incoming-payment",
                actions: ["create", "read"]
              }
            ]
          }
        }),
        timeout: 15000
      });
      
      console.log("✅ Endpoint /grant responde. Status:", testResponse.status);
      if (testResponse.status !== 404) {
        console.log("📋 Headers:", JSON.stringify(Object.fromEntries(testResponse.headers.entries()), null, 2));
      }
    } catch (testError) {
      console.error("❌ Error probando endpoint /grant:", testError.message);
    }

    // Intentar la solicitud del grant con mejor manejo de errores
    console.log("🎫 Solicitando grant para incoming payment...");
    
    try {
      const incomingGrant = await withTimeout(
        client.grant.request(
          {
            url: walletAddress.authServer,
          },
          {
            access_token: {
              access: [
                {
                  type: "incoming-payment",
                  actions: ["list", "read", "read-all", "complete", "create"],
                },
              ],
            },
          }
        ),
        30000,
        "Timeout: El servidor no respondió en 30 segundos"
      );

      console.log("✅ ¡GRANT OBTENIDO EXITOSAMENTE!");
      console.log("📋 Respuesta del grant:", JSON.stringify({
        access_token: incomingGrant.access_token ? "PRESENTE" : "AUSENTE",
        interact: incomingGrant.interact ? "PRESENTE" : "AUSENTE",
        continue: incomingGrant.continue ? "PRESENTE" : "AUSENTE"
      }, null, 2));

      // CONTINUAR CON EL RESTO DEL PROCESO...

    } catch (grantError) {
      console.error("❌ Error detallado en la solicitud del grant:");
      console.error("📌 Mensaje:", grantError.message);
      
      // Información adicional para debugging
      if (grantError.response) {
        console.error("📊 Status HTTP:", grantError.response.status);
        console.error("🔗 URL:", grantError.response.config?.url);
        console.error("📝 Método:", grantError.response.config?.method);
        
        if (grantError.response.data) {
          try {
            console.error("📦 Datos de respuesta:", JSON.stringify(grantError.response.data, null, 2));
          } catch {
            console.error("📦 Datos de respuesta:", grantError.response.data);
          }
        }
        
        if (grantError.response.headers) {
          console.error("📨 Headers:", JSON.stringify(grantError.response.headers, null, 2));
        }
      }
      
      if (grantError.code) {
        console.error("🔢 Código de error:", grantError.code);
      }
      
      if (grantError.cause) {
        console.error("🎯 Causa:", grantError.cause);
      }

      console.log("\n🔧 Diagnosticando el problema...");
      
      // Verificar si es problema de autenticación
      if (grantError.response?.status === 401) {
        console.log("🔐 PROBLEMA DE AUTENTICACIÓN:");
        console.log("   - Verifica que private.key sea correcto");
        console.log("   - Verifica que keyId sea correcto");
        console.log("   - Verifica los permisos del wallet");
      } else if (grantError.response?.status === 404) {
        console.log("🔍 ENDPOINT NO ENCONTRADO:");
        console.log("   - La URL del auth server puede ser incorrecta");
        console.log("   - El endpoint /grant puede no existir");
      } else if (grantError.response?.status) {
        console.log("🚨 ERROR HTTP:", grantError.response.status);
      } else {
        console.log("🌐 PROBLEMA DE RED/CONECTIVIDAD");
      }
    }

  } catch (error) {
    console.error("💥 Error general:", error.message);
  }
})();