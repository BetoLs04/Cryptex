import {
  createAuthenticatedClient,
  OpenPaymentsClientError,
  isPendingGrant,
  isFinalizedGrant
} from "@interledger/open-payments";
import { randomUUID } from "crypto";
import readline from "readline/promises";

// TUS CREDENCIALES
const WALLET_ADDRESS = "https://ilp.interledger-test.dev/user";
const RECEIVING_WALLET = "https://ilp.interledger-test.dev/gouber";
const PRIVATE_KEY_PATH = "backend/private.key";
const KEY_ID = "0841b666-c298-4c5b-aab0-19eda3d697e6";
const MONTO_A_ENVIAR = "1000";

// Timeout para evitar esperas eternas
const TIMEOUT_MS = 15000;

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
    console.log("🚀 INICIANDO TRANSFERENCIA OPEN PAYMENTS");
    console.log("=".repeat(50));

    // ==================== PASO 1 ====================
    console.log("\n1️⃣  PASO 1: Inicializando cliente de Open Payments");
    const client = await withTimeout(
      createAuthenticatedClient({
        walletAddressUrl: WALLET_ADDRESS,
        privateKey: PRIVATE_KEY_PATH,
        keyId: KEY_ID,
      }),
      TIMEOUT_MS,
      "Timeout creando cliente"
    );
    console.log("✅ Cliente inicializado correctamente");

    // ==================== PASO 2 ====================
    console.log("\n2️⃣  PASO 2: Obteniendo wallet address");
    const walletAddress = await withTimeout(
      client.walletAddress.get({
        url: WALLET_ADDRESS,
      }),
      TIMEOUT_MS,
      "Timeout obteniendo wallet address"
    );
    console.log("✅ Wallet address obtenida:", walletAddress.id);
    console.log("   Auth Server:", walletAddress.authServer);
    console.log("   Resource Server:", walletAddress.resourceServer);

    // ==================== PASO 3 ====================
    console.log("\n3️⃣  PASO 3: Solicitando grant para incoming payment");
    const incomingPaymentGrant = await withTimeout(
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
      TIMEOUT_MS,
      "Timeout solicitando grant para incoming payment"
    );
    console.log("✅ Grant para incoming payment obtenido");
    const INCOMING_PAYMENT_ACCESS_TOKEN = incomingPaymentGrant.access_token.value;

    // ==================== PASO 4 ====================
    console.log("\n4️⃣  PASO 4: Creando incoming payment");
    const receivingWallet = await withTimeout(
      client.walletAddress.get({
        url: RECEIVING_WALLET,
      }),
      TIMEOUT_MS,
      "Timeout obteniendo wallet receptor"
    );

    const incomingPayment = await withTimeout(
      client.incomingPayment.create(
        {
          url: receivingWallet.resourceServer,
          accessToken: INCOMING_PAYMENT_ACCESS_TOKEN,
        },
        {
          walletAddress: receivingWallet.id,
          incomingAmount: {
            value: MONTO_A_ENVIAR,
            assetCode: receivingWallet.assetCode,
            assetScale: receivingWallet.assetScale,
          },
          expiresAt: new Date(Date.now() + 60_000 * 10).toISOString(),
        }
      ),
      TIMEOUT_MS,
      "Timeout creando incoming payment"
    );
    console.log("✅ Incoming payment creado");
    console.log("   ID:", incomingPayment.id);
    console.log("   Monto a recibir:", MONTO_A_ENVIAR, receivingWallet.assetCode);
    const INCOMING_PAYMENT_URL = incomingPayment.id;

    // ==================== PASO 5 ====================
    console.log("\n5️⃣  PASO 5: Solicitando grant para quote");
    const quoteGrant = await withTimeout(
      client.grant.request(
        {
          url: walletAddress.authServer,
        },
        {
          access_token: {
            access: [
              {
                type: "quote",
                actions: ["create", "read", "read-all"],
              },
            ],
          },
        }
      ),
      TIMEOUT_MS,
      "Timeout solicitando grant para quote"
    );
    console.log("✅ Grant para quote obtenido");
    const QUOTE_ACCESS_TOKEN = quoteGrant.access_token.value;

    // ==================== PASO 6 ====================
    console.log("\n6️⃣  PASO 6: Creando quote");
    const quote = await withTimeout(
      client.quote.create(
        {
          url: walletAddress.resourceServer,
          accessToken: QUOTE_ACCESS_TOKEN,
        },
        {
          method: "ilp",
          walletAddress: walletAddress.id,
          receiver: INCOMING_PAYMENT_URL,
        }
      ),
      TIMEOUT_MS,
      "Timeout creando quote"
    );
    console.log("✅ Quote creado");
    console.log("   ID:", quote.id);
    console.log("   Debit Amount:", quote.debitAmount.value, quote.debitAmount.assetCode);
    console.log("   Receive Amount:", quote.receiveAmount.value, quote.receiveAmount.assetCode);
    const QUOTE_URL = quote.id;

    // ==================== PASO 7 ====================
    console.log("\n7️⃣  PASO 7: Solicitando grant interactivo para outgoing payment");
    const NONCE = randomUUID();
    
    const outgoingPaymentGrant = await withTimeout(
      client.grant.request(
        {
          url: walletAddress.authServer,
        },
        {
          access_token: {
            access: [
              {
                identifier: walletAddress.id,
                type: "outgoing-payment",
                actions: ["list", "list-all", "read", "read-all", "create"],
                limits: {
                  debitAmount: {
                    assetCode: quote.debitAmount.assetCode,
                    assetScale: quote.debitAmount.assetScale,
                    value: quote.debitAmount.value,
                  },
                },
              },
            ],
          },
          interact: {
            start: ["redirect"],
            finish: {
              method: "redirect",
              uri: "http://localhost:3344",
              nonce: NONCE,
            },
          },
        }
      ),
      TIMEOUT_MS,
      "Timeout solicitando grant interactivo"
    );

    if (!isPendingGrant(outgoingPaymentGrant)) {
      throw new Error("Expected interactive grant");
    }
    console.log("✅ Grant interactivo obtenido");
    console.log("\n🔗 URL para autorización:", outgoingPaymentGrant.interact.redirect);
    console.log("\n⚠️  Por favor visita esta URL en tu navegador,");
    console.log("   autoriza la transacción y luego regresa aquí");

    // Esperar interacción del usuario
    await readline
      .createInterface({ input: process.stdin, output: process.stdout })
      .question("🎯 Presiona Enter después de autorizar...");

    // ==================== PASO 8 ====================
    console.log("\n8️⃣  PASO 8: Continuando grant después de autorización");
    // En un caso real, obtendrías el interact_ref de la URL de callback
    const interactRef = "authorized_manually"; // Esto normalmente vendría del callback
    
    const finalizedGrant = await withTimeout(
      client.grant.continue(
        {
          accessToken: outgoingPaymentGrant.continue.access_token.value,
          url: outgoingPaymentGrant.continue.uri,
        },
        {
          interact_ref: interactRef,
        }
      ),
      TIMEOUT_MS,
      "Timeout continuando grant"
    );

    if (!isFinalizedGrant(finalizedGrant)) {
      throw new Error("Grant no fue finalizado correctamente");
    }
    console.log("✅ Grant finalizado correctamente");
    const OUTGOING_PAYMENT_ACCESS_TOKEN = finalizedGrant.access_token.value;

    // ==================== PASO 9 ====================
    console.log("\n9️⃣  PASO 9: Creando outgoing payment");
    const outgoingPayment = await withTimeout(
      client.outgoingPayment.create(
        {
          url: walletAddress.resourceServer,
          accessToken: OUTGOING_PAYMENT_ACCESS_TOKEN,
        },
        {
          walletAddress: walletAddress.id,
          quoteId: QUOTE_URL,
        }
      ),
      TIMEOUT_MS,
      "Timeout creando outgoing payment"
    );

    // ==================== ÉXITO ====================
    console.log("\n🎉 ¡¡¡TRANSFERENCIA COMPLETADA EXITOSAMENTE!!!");
    console.log("=".repeat(55));
    console.log("   📋 ID del pago:", outgoingPayment.id);
    console.log("   💰 Monto enviado:", quote.debitAmount.value, quote.debitAmount.assetCode);
    console.log("   📤 Desde:", walletAddress.id);
    console.log("   📥 Hacia:", receivingWallet.id);
    console.log("   ✅ Estado:", outgoingPayment.state);
    console.log("   🕒 Fecha:", new Date().toLocaleString());
    console.log("=".repeat(55));

  } catch (error) {
    console.error("\n❌ ERROR en el proceso:");
    console.error("   📌 Mensaje:", error.message);
    
    if (error.response) {
      console.error("   📊 Status HTTP:", error.response.status);
      console.error("   🔗 URL:", error.response.config?.url);
    }
    
    console.log("\n💡 Posibles soluciones:");
    console.log("   • Los servidores pueden estar caídos");
    console.log("   • Reintenta en unas horas");
    console.log("   • Verifica tus credenciales");
  } finally {
    process.exit();
  }
})();
