
# DuoSpend - Shared Finance Tracker

A collaborative spending tracker for couples, featuring Google Sheets sync and AI insights via Gemini.

## Local Setup

1. **Prerequisites**: Ensure you have [Node.js](https://nodejs.org/) installed.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Environment Variables**:
   Create a `.env` file in the root and add your Gemini API Key:
   ```env
   VITE_API_KEY=your_gemini_api_key_here
   ```
4. **Run Development Server**:
   ```bash
   npm run dev
   ```

## Google Sheets Sync Setup

1. Open a new [Google Sheet](https://sheets.new).
2. Go to **Extensions > Apps Script**.
3. Copy the code from the **Settings** tab in the app and paste it into the script editor.
4. Click **Deploy > New Deployment**.
5. Select **Type: Web App**.
6. Set **Execute as: Me** and **Who has access: Anyone**.
7. Copy the **Web App URL** and paste it into the "Sync URL" field in the DuoSpend Settings tab.

## Deployment (Vercel/Netlify)

1. Upload this folder to a GitHub repository.
2. Connect the repository to [Vercel](https://vercel.com).
3. In the Vercel dashboard, go to **Settings > Environment Variables**.
4. Add a key named `API_KEY` with your Gemini API key as the value.
5. Deploy!
