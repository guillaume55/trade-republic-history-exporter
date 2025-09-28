# Trade Republic Exporter for Portfolio Performance

This Node.js script connects to the Trade Republic WebSocket API, retrieves your transaction history, and exports a clean `.csv` file compatible with [Portfolio Performance](https://www.portfolio-performance.info/).

> 🧠 **Heavily inspired by**: [BenjaminOddou/trade_republic_scraper](https://github.com/BenjaminOddou/trade_republic_scraper)

## ✨ Features

- Connects to Trade Republic via WebSocket
- Parses executed transactions (Buy, Sell, Dividend, etc.)
- Exports a clean CSV for Portfolio Performance
- UI available for basic analytics

## 🛠️ Requirements

- Node.js (v18 or higher)
- A Trade Republic account

## ⚙️ Configuration

1. Copy the example config file:

```bash
cp config.ini.exemple config.ini
```

2. Edit .config.ini with your Trade Republic credentials:

```bash
[secret]
phone_number=+33xxxxxxxxx
pin=xxxx
```

⚠️ Do not commit .config.ini to version control. It is ignored via .gitignore.

## 🚀 Usage

Install dependencies:

```bash
npm install
```

Run the script:

```bash
node main.js
```

This will create a YYYY-MM-DD.csv file in the exports directory.

## UI usage
Open index.html UI in browser and drop exported data (exports/YYYY-MM-DD.csv). 
Load enrichment by dropping enrichment.csv to dropzone. No waranty are provided on this file and data that are valid at the time of commit can evolve over time. 

### Disclamer
The provided analysis is only for test purposes and can't be used to take financial decisions with real money. 
The geographical, sectorial and other types of analysis are based on arbitrary data and cannot be used to manage real money. 

### Enrichment.csv
Please contribute to enrichment.csv file by adding your positions to CSV file 


## 🌐 Language Support

This script is designed for French ("FR") language settings in Trade Republic.
If your account is set to another language, you may need to adjust the mapping in the getTypeFromEvent() function to correctly identify transaction types (Buy, Sell, etc.).

## 📄 CSV Output

The exported CSV file is structured to be compatible with Portfolio Performance. It includes, where available:
- Date
- Type (Buy/Sell/Dividend/etc.)
- Security name
- ISIN
- Note
- Quantity
- Currency
- Fees
- Taxes
- Total

## 📁 Project Structure

```bash
.
├── main.js                             # Main script
├── config.ini                          # Your personal credentials (not committed)
├── config.ini.exemple                  # Example config file
├── package.json                        # Project dependencies
├── package-lock.json                   # Lock file
├── exports/                            # History of exported exports
└── node_modules/                       # Installed dependencies
└── ui/                                 # Folder for optionnal UI
    └── enrichments.csv                 # Drop this folder to UI dropzone to get basic analytics. No waranty can be given on analysed data
    └── index.html                      # Basic UI
    └── style.css                       # Style for UI
    └── script.js                       # JS functions for UI
```

## 🔐 Security Note

Your phone number and PIN are stored locally in config.ini. Never share or upload this file. For extra safety, use a .env manager or encryption in production environments.

## 📜 License

MIT License – free to use and modify.
