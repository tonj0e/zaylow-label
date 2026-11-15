# AI assistant: setup (owner steps)

1. **SQL:** Supabase > SQL Editor > run `supabase/migrations/20261116000000_ai_agent.sql` (saves daily reports).
2. **Function:** Supabase > Edge Functions > Deploy a new function > name it exactly `ai-agent` > paste all of `supabase/functions/ai-agent/index.ts` > Deploy.
3. **Secrets:** Supabase > Edge Functions > Secrets, add:
   - `AI_API_KEY` = your NVIDIA key (from build.nvidia.com > the model > Generate API Key). Never paste it in chat or in the website code.
   - `AI_MODEL` = the model name exactly as in the NVIDIA "Build" code (the `"model":` line), for Mistral Large 4 it looks like `mistralai/mistral-large-4-1t-a52b`.
   - Optional for the daily report on Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
4. Open **AI assistant** in the app, tap **Today's report**.
5. Optional: run the schedule file `20261116000100_ai_agent_daily_schedule.sql.txt` so the report writes itself every night at 9 pm.

Privacy: the AI gets only totals (counts, money, stock). No customer names, phones or addresses are selected.
To use another AI later (Claude via a compatible gateway, OpenAI, etc.), change `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY`. No code change.

## Monitoring update (16 Nov)
- Run `supabase/migrations/20261116000200_ai_monitoring.sql` once (usage + crash log table `app_events`).
- Paste the new `index.ts` into the function and Deploy updates.
- Telegram: add secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (same values as in the app Settings > Telegram). Then use "Send test message" on the AI assistant page.
- The AI is read-only. It reports problems; the owner copies the "For the developer" part into the Claude code chat to get them fixed.
- Returned customers (name, phone, PIN) are added by the function code to the report. They are never sent to the AI service.

## Changing the AI's rules without redeploying
Add a secret `AI_EXTRA_RULES` (Supabase > Edge Functions > Secrets) with extra instructions in plain words, up to 1500 characters.
Example: `Always end the report with one motivating sentence. Call products by their short names.`
It is added to the AI's rules on the next question. It cannot make the AI able to change data: the AI has no tools.

## Two NVIDIA keys
- `AI_API_KEY` = chat key. `AI_VOICE_KEY` = natural-voice key (optional; if missing the chat key is used for voice too).
