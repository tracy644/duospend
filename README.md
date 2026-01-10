# DuoSpend - Online Deployment Guide

Follow these steps to get your shared app running online for you and your girlfriend.

## Step 1: Deploy the App (Frontend)
1. Push this code to a **GitHub** repository.
2. Sign up/Login to [Vercel](https://vercel.com).
3. Import your repository and click **Deploy**.
4. **Important**: Go to Project Settings > Environment Variables and add `API_KEY` with your Gemini API key.
5. You now have a public URL (e.g., `duospend.vercel.app`) to share!

## Step 2: Setup the Database (Google Sheets)
1. Create a new [Google Sheet](https://sheets.new).
2. Go to **Extensions > Apps Script**.
3. In your DuoSpend app (on the web), go to the **Setup** tab and copy the code from the **Technical Setup** card.
4. Paste it into the Apps Script editor and Save.
5. Click **Deploy > New Deployment**.
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone** (This is crucial for mobile sync).
6. Copy the **Web App URL**.

## Step 3: Connect
1. Paste the **Web App URL** from Step 2 into the "Sync URL" field in your DuoSpend Setup tab.
2. Click **Sync Now**.
3. Both you and your girlfriend should now use the same Vercel URL and the same Sync URL in your settings.

---

*Tip: For the best experience, open the URL in Safari (iOS) or Chrome (Android) and "Add to Home Screen" to use it like a native app.*