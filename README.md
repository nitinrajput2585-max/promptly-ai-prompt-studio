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

## Deploy your own copy

This app needs a Node.js web-service host; GitHub Pages alone cannot run its server-side Gemini API requests.

1. Fork or clone this repository.
2. Create a Node.js web service with Node.js 20 or later and use `npm start` as its start command.
3. Add `GEMINI_API_KEY` as a secret environment variable in the hosting provider's settings. Do not commit `.env` or put the key in frontend code.
4. Optionally set `GEMINI_MODEL`. The host supplies `PORT` automatically.

Each deployment needs its own Gemini API key. The public repository contains the app source, not a hosted shared instance.

## License

No license has been added. The source is publicly visible, but public visibility does not grant permission to reuse or distribute it.
