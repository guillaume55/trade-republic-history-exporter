const fs = require("fs");
const readline = require("readline");
const https = require("https");
const { parse } = require("ini");
const WebSocket = require("ws");
const { createObjectCsvWriter } = require("csv-writer");

// === CONFIGURATION ===
const CONFIG_FILE = "config.ini";
let config = {};

if (!fs.existsSync(CONFIG_FILE)) {
  console.error("❌ Fichier config.ini introuvable.");
  process.exit(1);
}
const configRaw = fs.readFileSync(CONFIG_FILE, "utf-8");
config = parse(configRaw);

const phoneNumber = config.secret.phone_number;
const pin = config.secret.pin;

// POST REQUEST
function post(url, data, headers = {}) {
  const urlObj = new URL(url);
  const options = {
    method: "POST",
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(JSON.stringify(data)),
      ...headers,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({ res, body: JSON.parse(body || "{}") });
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

// AUTHENTICATION
async function authenticate() {
  console.log("🔐 Connexion à l'API TradeRepublic...");
  const { res, body } = await post(
    "https://api.traderepublic.com/api/v1/auth/web/login",
    { phoneNumber, pin }
  );

  const processId = body.processId;
  const countdown = body.countdownInSeconds;
  if (!processId) {
    console.error("❌ Échec de l'initialisation. Numéro ou PIN invalide ?");
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));
  let code = await ask(`❓ Entrez le code 2FA reçu (${countdown}s) ou tapez 'SMS': `);
  if (code.toUpperCase() === "SMS") {
    await post(`https://api.traderepublic.com/api/v1/auth/web/login/${processId}/resend`, {});
    code = await ask("❓ Entrez le code 2FA reçu par SMS: ");
  }
  rl.close();

  const verifyUrl = `https://api.traderepublic.com/api/v1/auth/web/login/${processId}/${code}`;
  const { res: verifyRes } = await post(verifyUrl, {});
  if (verifyRes.statusCode !== 200) {
    console.error("❌ Échec de la vérification de l'appareil.");
    process.exit(1);
  }

  const setCookie = verifyRes.headers["set-cookie"] || [];
  const sessionCookie = setCookie.find((c) => c.startsWith("tr_session="));
  if (!sessionCookie) {
    console.error("❌ Cookie de session introuvable.");
    process.exit(1);
  }

  const sessionToken = sessionCookie.split(";")[0].split("=")[1];
  console.log("✅ Authentifié avec succès !");
  return sessionToken;
}

// FETCH TRANSACTIONS
async function fetchAllTransactions(token) {
  const ws = new WebSocket("wss://api.traderepublic.com");

  const allData = [];
  let messageId = 0;
  let afterCursor = null;

  // Utilitaire : attendre un message WebSocket unique
  const waitForMessage = () =>
    new Promise((resolve) => ws.once("message", (data) => resolve(data.toString())));

  // Nettoie les réponses JSON parasites
  const cleanJson = (msg) => {
    const start = msg.indexOf("{");
    const end = msg.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      return msg.slice(start, end + 1);
    }
    return "{}";
  };

  return new Promise((resolve, reject) => {
    ws.on("open", async () => {
      try {
        const localeConfig = {
          locale: "fr",
          platformId: "webtrading",
          platformVersion: "safari - 18.3.0",
          clientId: "app.traderepublic.com",
          clientVersion: "3.151.3",
        };

        ws.send(`connect 31 ${JSON.stringify(localeConfig)}`);
        await waitForMessage(); // confirmation connexion

        console.log("✅ WebSocket connecté");

        while (true) {
          const payload = {
            type: "timelineTransactions",
            token,
          };
          if (afterCursor) {
            payload.after = afterCursor;
          }

          messageId++;
          ws.send(`sub ${messageId} ${JSON.stringify(payload)}`);
          const subResponse = await waitForMessage();

          ws.send(`unsub ${messageId}`);
          await waitForMessage(); // confirmation d’unsub

          const cleaned = cleanJson(subResponse);
          const jsonData = JSON.parse(cleaned);

          if (!jsonData.items || jsonData.items.length === 0) {
            break;
          }

          for (const tx of jsonData.items) {
            const txId = tx.id;
            if (tx?.status && tx.status.includes('CANCELED')) {
              continue;
            }
            if (txId) {
              const [details, newMsgId] = await fetchTransactionDetails(ws, txId, token, messageId);
              messageId = newMsgId;
              Object.assign(tx, details);
            }
            allData.push(tx);
          }

          afterCursor = jsonData.cursors?.after;
          if (!afterCursor) {
            break;
          }
        }

        ws.close();
        resolve(allData);
      } catch (err) {
        ws.close();
        reject(err);
      }
    });
  });
}

// FETCH TRANSACTIONS DETAILS
async function fetchTransactionDetails(ws, transactionId, token, messageId) {
  messageId++;
  const payload = {
    type: "timelineDetailV2",
    id: transactionId,
    token,
  };

  // Utilitaire : attendre un message WebSocket unique
  const waitForMessage = () =>
    new Promise((resolve) => ws.once("message", (data) => resolve(data.toString())));

  // Nettoie les réponses JSON parasites
  const cleanJson = (msg) => {
    const start = msg.indexOf("{");
    const end = msg.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      return msg.slice(start, end + 1);
    }
    return "{}";
  };

  ws.send(`sub ${messageId} ${JSON.stringify(payload)}`);
  const subResponse = await waitForMessage();
  ws.send(`unsub ${messageId}`);
  await waitForMessage(); // confirmation d’unsub

  const cleaned = cleanJson(subResponse);
  const jsonData = JSON.parse(cleaned);

  const transactionData = {};
  for (const section of jsonData.sections || []) {
    if (section.title === "Transaction") {
      for (const item of section.data || []) {
        const key = item.title;
        const value = item.detail?.text;
        if (key && value) transactionData[key] = value;
      }
    }

    if (section?.action?.type === "instrumentDetail") {
      // Get Isin
      transactionData.ISIN = section.action.payload;
    }
  }

  return [transactionData, messageId];
}

// FORMAT & EXPORT
function parseTransactionDetails(tx) {
  const row = {};

  row.Date = new Date(tx.timestamp).toISOString().split('T')[0];
  row.Type = getTypeFromEvent(tx.eventType, tx.subtitle);
  row.Titre = tx.title || "";
  row.ISIN = tx.ISIN || "";
  row.Note = tx.subtitle || "";
  row.Quantité = parseAmount(tx.Titres || tx.Actions || "0");
  // row.Price = parseAmount(tx["Cours du titre"] || "0"); // Si dividandes par actions : 'Dividende par action'
  row.Total = tx.amount?.value
  row.Devise = tx.amount?.currency || "EUR";
  row.Frais = parseAmount(tx.Frais || "0");
  row.Taxes = parseAmount(tx.Impôts || "0");

  return row;
}

function getTypeFromEvent(eventType, subtitle) {
  const lower = (subtitle || "").toLowerCase();

  if (eventType.includes("SAVINGS_PLAN") || eventType.includes("trading_savingsplan_executed") || lower.includes("achat")) {
    return "Achat";
  }
  if (lower.includes("vente")) {
    return "Vente";
  }
  if (lower.includes("distribution") || lower.includes('dividende') || eventType === "CREDIT") {
    return "Dividendes";
  }
  if (eventType.includes("INTEREST")) {
    return "Intérêts";
  }
  if (eventType.includes("PAYMENT_INBOUND") || eventType.includes("INCOMING_TRANSFER_DELEGATION")) {
    return "Dépôt";
  }
  if (eventType.includes("PAYMENT_OUTBOUND") || eventType.includes("OUTGOING_TRANSFER_DELEGATION")) {
    return "Retrait";
  }

  return "Autre";
}

function parseAmount(text) {
  if (text === 'Gratuit') {
    return 0;
  }
  const cleaned = text
  .replace(',', '.')
  .replace(/[^\d.-]/g, '');
  return parseFloat(cleaned);
}

async function exportToPortfolioPerformance(transactions) {
  const csvWriter = createObjectCsvWriter({
    path: `./portfolio_performance_export.csv`,

    header: [
      { id: "Date", title: "Date" },
      { id: "Type", title: "Type" },
      { id: "Titre", title: "Nom du titre" },
      { id: "ISIN", title: "ISIN" },
      { id: "Note", title: "Note" },
      { id: "Quantité", title: "Parts" },
      // { id: "Price", title: "Prix" },
      { id: "Devise", title: "Devise de l'opération" },
      { id: "Frais", title: "Frais" },
      { id: "Taxes", title: "Impôts / Taxes" },
      { id: "Total", title: "Valeur" },
      
    ],
    fieldDelimiter: ";",
    encoding: "utf8",
  });

  await csvWriter.writeRecords(transactions);
  console.log("✅ Export Portfolio Performance généré !");
}

// MAIN
(async () => {
  const token = await authenticate();
  const data = await fetchAllTransactions(token);
  console.log(data);
  const formatted = [];
  for (const tx of data) {
    if (!tx.amount || tx.amount.value === 0) {
      continue;
    }
    const row = parseTransactionDetails(tx);
    formatted.push(row);
  }
  await exportToPortfolioPerformance(formatted);
})();
