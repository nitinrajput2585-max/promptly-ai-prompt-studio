# Promptly

Promptly is a small bilingual AI prompt studio powered by Google Gemini. Describe a task in your own language to get a well-structured prompt in that language and an equivalent English version. If you write in English, the app makes just one English prompt.

Review the prompts and choose **Accept & run**, **Edit prompt**, or **Make it better**. Accepting runs the prompt and returns the result in the original request's language. Editing applies your instructions to both language versions, and making it better asks Gemini for an improved revision.

After the result appears, continue the conversation with follow-up questions or requests. Each follow-up is sent only when you press **Send**; the app does not automatically send messages or run more prompts.

The sidebar contains **About AI** and a minimize control. Prompt actions remain in the main workspace. On narrow screens, the expanded sidebar overlays the workspace instead of shrinking it.

Choose Gemini 3.8 Flash, 3.1 Pro Preview, or 3.1 Flash-Lite from the selector beside the input. The selected model is used for prompt generation, revisions, execution, and follow-up replies. Your choice is saved in this browser; the server's `GEMINI_MODEL` remains the default.

## Run locally

1. Install [Node.js 20 or later](https://nodejs.org/).
2. Copy `.env.example` to `.env` and add your Google Gemini API key:

   ```text
   GEMINI_API_KEY=your_real_key
   ```

3. Start the app:

   ```powershell
   npm.cmd start
   ```

4. Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

You can get an API key from [Google AI Studio](https://aistudio.google.com/apikey). The key stays on the local server and is never sent to the browser. The default model is `gemini-3.5-flash`; optionally set `GEMINI_MODEL` or `PORT` in `.env`.

## Deploy a private site on Render

GitHub Pages cannot run this app's server-side Gemini API requests. To create a private website for you and your partner:

1. Sign in to [Render](https://render.com/) and create a new **Blueprint** from this GitHub repository.
2. Render reads `render.yaml` and configures the Node.js web service.
3. When prompted, enter `GEMINI_API_KEY`, a `SITE_USERNAME`, and a `SITE_PASSWORD` of at least 12 characters. These are private Render environment variables. Do not commit them or put them in frontend code.
4. Deploy. Render provides a website URL; opening it asks for the site username and password. Share those sign-in credentials only with your partner.

The Gemini key stays on the server. You and your partner share the API quota for that key, so do not share the site login publicly. The app refuses to start on a network interface without site credentials configured.

## License

No license has been added. The source is publicly visible, but public visibility does not grant permission to reuse or distribute it.
