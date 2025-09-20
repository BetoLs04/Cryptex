import {
  createAuthenticatedClient,
  OpenPaymentsClientError,
  isFinalizedGrant,
} from "@interledger/open-payments";
import readline from "readline/promises";

// Función con timeout para evitar que se quede colgado
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
    // Crear cliente autenticado con TUS CREDENCIALES
    console.log("🔑 Creating authenticated client...");
    const client = await createAuthenticatedClient({
      walletAddressUrl: "https://ilp.interledger-test.dev/user",
      privateKey: "backend/private.key",
      keyId: "0841b666-c298-4c5b-aab0-19eda3d697e6",
    });

    // Obtener las direcciones de wallet
    console.log("📭 Getting wallet addresses...");
    const sendingWalletAddress = await withTimeout(
      client.walletAddress.get({ url: "https://ilp.interledger-test.dev/user" }),
      10000,
      "Timeout getting sending wallet address"
    );
    
    const receivingWalletAddress = await withTimeout(
      client.walletAddress.get({ url: "https://ilp.interledger-test.dev/gouber" }),
      10000,
      "Timeout getting receiving wallet address"
    );

    console.log("✅ Got wallet addresses. We will set up a payment between:");
    console.log("   Sending:", sendingWalletAddress.id);
    console.log("   Receiving:", receivingWalletAddress.id);

    // Step 1: Get a grant for the incoming payment (CON TIMEOUT)
    console.log("\n🎫 Step 1: Requesting incoming payment grant...");
    console.log("   Auth Server:", receivingWalletAddress.authServer);
    
    try {
      const incomingPaymentGrant = await withTimeout(
        client.grant.request(
          {
            url: receivingWalletAddress.authServer,
          },
          {
            access_token: {
              access: [
                {
                  type: "incoming-payment",
                  actions: ["read", "complete", "create"],
                },
              ],
            },
          }
        ),
        30000, // 30 second timeout
        "Timeout requesting incoming payment grant"
      );

      console.log("✅ Step 1: Got incoming payment grant");
      console.log("   Grant response:", JSON.stringify(incomingPaymentGrant, null, 2));

      // Step 2: Create the incoming payment
      console.log("\n💰 Step 2: Creating incoming payment...");
      const incomingPayment = await withTimeout(
        client.incomingPayment.create(
          {
            url: receivingWalletAddress.resourceServer,
            accessToken: incomingPaymentGrant.access_token.value,
          },
          {
            walletAddress: receivingWalletAddress.id,
            incomingAmount: {
              assetCode: receivingWalletAddress.assetCode,
              assetScale: receivingWalletAddress.assetScale,
              value: "1000",
            },
          }
        ),
        15000,
        "Timeout creating incoming payment"
      );

      console.log("✅ Incoming payment created:", incomingPayment.id);

      // CONTINUAR CON LOS DEMÁS PASOS...
      console.log("\n⏩ Continuing with next steps...");

      // Step 3: Get a quote grant
      console.log("📊 Step 3: Getting quote grant...");
      const quoteGrant = await withTimeout(
        client.grant.request(
          {
            url: sendingWalletAddress.authServer,
          },
          {
            access_token: {
              access: [
                {
                  type: "quote",
                  actions: ["create", "read"],
                },
              ],
            },
          }
        ),
        15000,
        "Timeout getting quote grant"
      );

      console.log("✅ Quote grant obtained");

      // Step 4: Create a quote
      console.log("🧮 Step 4: Creating quote...");
      const quote = await withTimeout(
        client.quote.create(
          {
            url: sendingWalletAddress.resourceServer,
            accessToken: quoteGrant.access_token.value,
          },
          {
            walletAddress: sendingWalletAddress.id,
            receiver: incomingPayment.id,
            method: "ilp",
          }
        ),
        15000,
        "Timeout creating quote"
      );

      console.log("✅ Quote created:", quote.id);

      // Step 5: Start the grant process for the outgoing payments
      console.log("\n🎫 Step 5: Requesting outgoing payment grant...");
      const outgoingPaymentGrant = await withTimeout(
        client.grant.request(
          {
            url: sendingWalletAddress.authServer,
          },
          {
            access_token: {
              access: [
                {
                  type: "outgoing-payment",
                  actions: ["read", "create"],
                  limits: {
                    debitAmount: {
                      assetCode: quote.debitAmount.assetCode,
                      assetScale: quote.debitAmount.assetScale,
                      value: quote.debitAmount.value,
                    },
                  },
                  identifier: sendingWalletAddress.id,
                },
              ],
            },
            interact: {
              start: ["redirect"],
            },
          }
        ),
        30000,
        "Timeout requesting outgoing payment grant"
      );

      console.log("✅ Step 5: Got pending outgoing payment grant");
      console.log("Please navigate to the following URL to accept the interaction:");
      console.log("🔗", outgoingPaymentGrant.interact.redirect);

      await readline
        .createInterface({ input: process.stdin, output: process.stdout })
        .question("\nAfter accepting the grant, press enter...");

      // Step 6: Continue the grant
      console.log("🔄 Step 6: Continuing grant...");
      let finalizedOutgoingPaymentGrant;

      try {
        finalizedOutgoingPaymentGrant = await withTimeout(
          client.grant.continue({
            url: outgoingPaymentGrant.continue.uri,
            accessToken: outgoingPaymentGrant.continue.access_token.value,
          }),
          15000,
          "Timeout continuing grant"
        );
      } catch (err) {
        if (err instanceof OpenPaymentsClientError) {
          console.log("Error continuing the grant. You probably didn't accept the grant at the URL.");
          process.exit();
        }
        throw err;
      }

      if (!isFinalizedGrant(finalizedOutgoingPaymentGrant)) {
        console.log("Error: Grant was not finalized correctly.");
        process.exit();
      }

      console.log("✅ Step 6: Got finalized outgoing payment grant");

      // Step 7: Create the outgoing payment
      console.log("💸 Step 7: Creating outgoing payment...");
      const outgoingPayment = await withTimeout(
        client.outgoingPayment.create(
          {
            url: sendingWalletAddress.resourceServer,
            accessToken: finalizedOutgoingPaymentGrant.access_token.value,
          },
          {
            walletAddress: sendingWalletAddress.id,
            quoteId: quote.id,
          }
        ),
        15000,
        "Timeout creating outgoing payment"
      );

      console.log("🎉 Step 7: Created outgoing payment!");
      console.log("Outgoing Payment ID:", outgoingPayment.id);
      console.log("State:", outgoingPayment.state);
      console.log("Amount:", quote.debitAmount.value, quote.debitAmount.assetCode);
      console.log("\n✅ ¡TRANSFERENCIA COMPLETADA EXITOSAMENTE!");

    } catch (stepError) {
      console.error("❌ Error in steps 1-2:");
      console.error("Message:", stepError.message);
      console.error("This suggests the auth server is not responding properly");
      
      // Test direct connection to auth server
      console.log("\n🔍 Testing direct connection to auth server...");
      try {
        const testResponse = await fetch(receivingWalletAddress.authServer, {
          method: 'HEAD',
          timeout: 10000
        });
        console.log("Auth server response status:", testResponse.status);
      } catch (testError) {
        console.error("Cannot connect to auth server:", testError.message);
        console.log("\n💡 The Open Payments test servers might be down");
        console.log("   or there might be network connectivity issues");
      }
    }

  } catch (error) {
    console.error("💥 General error:");
    console.error("Message:", error.message);
    console.error("This likely indicates network or server issues");
  } finally {
    process.exit();
  }
})();