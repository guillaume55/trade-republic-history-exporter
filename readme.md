# Trade Republic Exporter for Portfolio Performance

This Node.js script connects to the Trade Republic WebSocket API, retrieves your transaction history, and exports a clean `.csv` file compatible with [Portfolio Performance](https://www.portfolio-performance.info/).

> 🧠 **Heavily inspired by**: [BenjaminOddou/trade_republic_scraper](https://github.com/BenjaminOddou/trade_republic_scraper)

## ✨ Features

- Connects to Trade Republic via WebSocket
- Parses executed transactions (Buy, Sell, Dividend, etc.)
- Exports a clean CSV for Portfolio Performance

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

This will create a portfolio_performance_export.csv file in the root directory.

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
├── portfolio_performance_export.csv    # Exported CSV result
└── node_modules/                       # Installed dependencies
```

## 🔐 Security Note

Your phone number and PIN are stored locally in config.ini. Never share or upload this file. For extra safety, use a .env manager or encryption in production environments.

## 📜 License

MIT License – free to use and modify.
