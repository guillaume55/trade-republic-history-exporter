
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
const outputFormat = config.general.output_format.toLowerCase();
const outputFolder = config.general.output_folder;
const extractDetails = config.general.extract_details === "true";

if (!["json", "csv"].includes(outputFormat)) {
  console.error(`❌ Le format '${outputFormat}' est inconnu. Utilisez 'json' ou 'csv'.`);
  process.exit(1);
}
if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder, { recursive: true });
}

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
async function fetchAllTransactions(token, extractDetails) {
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
          console.dir(jsonData, { depth: null, colors: true });

          if (!jsonData.items || jsonData.items.length === 0) {
            break;
          }

          if (extractDetails) {
            for (const tx of jsonData.items) {
              const txId = tx.id;
              if (txId) {
                const [details, newMsgId] = await fetchTransactionDetails(ws, txId, token, messageId);
                messageId = newMsgId;
                Object.assign(tx, details);
              }
              allData.push(tx);
            }
          } else {
            allData.push(...jsonData.items);
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
  await ws.send(`sub ${messageId} ${JSON.stringify(payload)}`);
  const response = await new Promise((resolve) => ws.once("message", (data) => resolve(data.toString())));
  await ws.send(`unsub ${messageId}`);
  await new Promise((resolve) => ws.once("message", resolve));

  const start = response.indexOf("{");
  const end = response.lastIndexOf("}");
  const data = JSON.parse(response.slice(start, end + 1) || "{}");

  const transactionData = {};
  for (const section of data.sections || []) {
    if (section.title === "Transaction") {
      for (const item of section.data || []) {
        const key = item.title;
        const value = item.detail?.text;
        if (key && value) transactionData[key] = value;
      }
    }
  }

  return [transactionData, messageId];
}

// FORMAT & EXPORT
function flattenJson(obj, parentKey = "", sep = ".") {
  return Object.entries(obj).reduce((acc, [key, val]) => {
    const newKey = parentKey ? `${parentKey}${sep}${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(acc, flattenJson(val, newKey, sep));
    } else {
      acc[newKey] = val;
    }
    return acc;
  }, {});
}

function transformData(data) {
  return data.map((item) => {
    const transformed = { ...item };

    if (transformed.timestamp) {
      const d = new Date(transformed.timestamp);
      transformed.timestamp = d.toLocaleDateString("fr-FR");
    }

    const montantKeys = [
      "amount.value",
      "amount.fractionDigits",
      "subAmount.value",
      "subAmount.fractionDigits",
    ];
    for (const key of montantKeys) {
      if (transformed[key]) {
        const val = parseFloat(transformed[key]);
        if (!isNaN(val)) transformed[key] = val.toLocaleString("fr-FR");
      }
    }

    return transformed;
  });
}

async function exportData(data) {
  const path = `${outputFolder}/trade_republic_transactions.${outputFormat}`;

  if (outputFormat === "json") {
    fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ Données sauvegardées dans '${path}'`);
  } else {
    const flattened = data.map(flattenJson);
    const cleaned = transformData(flattened);

    const headers = [...new Set(cleaned.flatMap((item) => Object.keys(item)))];

    const csvWriter = createObjectCsvWriter({
      path,
      header: headers.map((key) => ({ id: key, title: key })),
      fieldDelimiter: ";",
      encoding: "utf8",
    });

    await csvWriter.writeRecords(cleaned);
    console.log(`✅ Données sauvegardées dans '${path}'`);
  }
}

// MAIN
(async () => {
  const token = await authenticate();
  const data = await fetchAllTransactions(token, extractDetails);
  await exportData(data);
})();
