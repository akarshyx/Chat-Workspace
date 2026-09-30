import { Router, type IRouter } from "express";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import {
  GetTelegramAuthStatusResponse,
  SendTelegramAuthCodeBody,
  SendTelegramAuthCodeResponse,
  VerifyTelegramAuthCodeBody,
  VerifyTelegramAuthCodeResponse,
  VerifyTelegramAuthPasswordBody,
  VerifyTelegramAuthPasswordResponse,
} from "@workspace/api-zod";
import {
  loadTelegramUserSession,
  storeTelegramUserSession,
} from "../lib/telegram-user-session";

type PendingAuth = {
  client: TelegramClient;
  phoneNumber: string;
  phoneCodeHash: string;
  createdAt: number;
  needsPassword: boolean;
};

const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;
let pendingAuth: PendingAuth | null = null;

function getApiCredentials(): { apiId: number; apiHash: string } | null {
  const apiId = Number(process.env.TELEGRAM_USER_API_ID);
  const apiHash = process.env.TELEGRAM_USER_API_HASH?.trim();
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) return null;
  return { apiId, apiHash };
}

function isConfigured(): boolean {
  return Boolean(
      getApiCredentials() && process.env.SESSION_SECRET,
  );
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Telegram authorization failed.";
  const message = error.message.replace(/^RPCError:\s*/i, "");
  if (/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/i.test(message)) {
    return "That Telegram code is invalid.";
  }
  if (/PHONE_CODE_EXPIRED/i.test(message)) {
    return "That Telegram code expired. Request a new code.";
  }
  if (/PHONE_NUMBER_INVALID/i.test(message)) {
    return "Telegram rejected that phone number.";
  }
  if (/PHONE_NUMBER_BANNED/i.test(message)) {
    return "Telegram rejected this phone number as banned.";
  }
  if (/FLOOD_WAIT/i.test(message)) {
    return "Telegram asked us to wait before trying again.";
  }
  if (/PASSWORD_HASH_INVALID/i.test(message)) {
    return "That Telegram 2FA password is incorrect.";
  }
  if (/SESSION_PASSWORD_NEEDED/i.test(message)) {
    return "Telegram requires the account 2FA password.";
  }
  return message;
}

async function closePendingAuth(): Promise<void> {
  const previous = pendingAuth;
  pendingAuth = null;
  if (previous) await previous.client.disconnect().catch(() => undefined);
}

function requirePendingAuth(): PendingAuth {
  if (!pendingAuth || Date.now() - pendingAuth.createdAt > PENDING_AUTH_TTL_MS) {
    void closePendingAuth();
    throw new Error("The Telegram code request expired. Request a new code.");
  }
  return pendingAuth;
}

async function createClient(): Promise<{
  client: TelegramClient;
  hasSession: boolean;
}> {
  const credentials = getApiCredentials();
  if (!credentials) {
    throw new Error("Telegram user API ID and API hash are not configured.");
  }
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required to protect the Telegram user session.");
  }
  const session = await loadTelegramUserSession();
  const client = new TelegramClient(
    new StringSession(session ?? ""),
    credentials.apiId,
    credentials.apiHash,
    { connectionRetries: 3 },
  );
  await client.connect();
  return { client, hasSession: Boolean(session) };
}

function saveClientSession(client: TelegramClient): string {
  return (client.session as StringSession).save();
}

function authResult(
  status: "password_required" | "authorized",
  message: string,
) {
  return { status, deliveryChannel: null, message };
}

const router: IRouter = Router();

router.get("/telegram/user-auth/status", async (_req, res): Promise<void> => {
  if (!isConfigured()) {
    res.json(
      GetTelegramAuthStatusResponse.parse({
        configured: false,
        authorized: false,
        pending: false,
        needsPassword: false,
        phoneNumber: null,
        message:
          "Telegram user API credentials and SESSION_SECRET are required for encrypted authorization.",
      }),
    );
    return;
  }

  let client: TelegramClient | null = null;
  try {
    const created = await createClient();
    client = created.client;
    const authorized = await client.checkAuthorization();
    res.json(
      GetTelegramAuthStatusResponse.parse({
        configured: true,
        authorized,
        pending: Boolean(pendingAuth),
        needsPassword: Boolean(pendingAuth?.needsPassword),
        phoneNumber: pendingAuth?.phoneNumber ?? null,
        message: authorized
          ? "Telegram account is authorized for resale discovery."
          : pendingAuth?.needsPassword
            ? "Enter the Telegram account's 2FA password to finish authorization."
            : pendingAuth
              ? "Enter the Telegram login code sent to the supplied phone number."
              : created.hasSession
                ? "The stored Telegram session is no longer authorized."
                : "Enter your Telegram phone number to request a login code.",
      }),
    );
  } catch (error) {
    res.status(502).json({ error: getErrorMessage(error) });
  } finally {
    if (client) await client.disconnect().catch(() => undefined);
  }
});

router.post("/telegram/user-auth/send-code", async (req, res): Promise<void> => {
  const parsed = SendTelegramAuthCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isConfigured()) {
    res.status(503).json({
      error: "Telegram user API credentials and SESSION_SECRET are not configured.",
    });
    return;
  }

  const phoneNumber = parsed.data.phoneNumber.trim();
  if (!/^\+?[1-9][0-9\s().-]{5,20}$/.test(phoneNumber)) {
    res.status(400).json({
      error: "Enter the Telegram phone number in international format.",
    });
    return;
  }

  const credentials = getApiCredentials();
  if (!credentials) {
    res.status(503).json({ error: "Telegram user API credentials are not configured." });
    return;
  }

  await closePendingAuth();
  const client = new TelegramClient(
    new StringSession(""),
    credentials.apiId,
    credentials.apiHash,
    { connectionRetries: 3 },
  );

  try {
    await client.connect();
    const result = await client.sendCode(credentials, phoneNumber);
    const deliveryChannel = result.isCodeViaApp ? "telegram_app" : "other";
    pendingAuth = {
      client,
      phoneNumber,
      phoneCodeHash: result.phoneCodeHash,
      createdAt: Date.now(),
      needsPassword: false,
    };
    res.json(
      SendTelegramAuthCodeResponse.parse({
        status: "code_sent",
        deliveryChannel,
        message: result.isCodeViaApp
          ? "Telegram sent the login code in the Telegram app."
          : "Telegram started the login-code delivery. Follow its delivery instructions.",
      }),
    );
  } catch (error) {
    await client.disconnect().catch(() => undefined);
    res.status(502).json({ error: getErrorMessage(error) });
  }
});

router.post("/telegram/user-auth/verify-code", async (req, res): Promise<void> => {
  const parsed = VerifyTelegramAuthCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let auth: PendingAuth;
  try {
    auth = requirePendingAuth();
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error) });
    return;
  }

  try {
    await auth.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: auth.phoneNumber,
        phoneCodeHash: auth.phoneCodeHash,
        phoneCode: parsed.data.code.trim(),
      }),
    );
    await storeTelegramUserSession(saveClientSession(auth.client));
    await closePendingAuth();
    res.json(
      VerifyTelegramAuthCodeResponse.parse(
        authResult(
          "authorized",
          "Telegram account authorized. The discovery session is stored encrypted on the server.",
        ),
      ),
    );
  } catch (error) {
    if (/SESSION_PASSWORD_NEEDED/i.test(error instanceof Error ? error.message : "")) {
      auth.needsPassword = true;
      res.json(
        VerifyTelegramAuthCodeResponse.parse(
          authResult(
            "password_required",
            "Telegram requires the account's 2FA password to finish authorization.",
          ),
        ),
      );
      return;
    }
    const message = getErrorMessage(error);
    const status = /PHONE_CODE_INVALID|PHONE_CODE_EMPTY|PHONE_CODE_EXPIRED/i.test(
      error instanceof Error ? error.message : "",
    )
      ? 400
      : 502;
    res.status(status).json({ error: message });
  }
});

router.post(
  "/telegram/user-auth/verify-password",
  async (req, res): Promise<void> => {
    const parsed = VerifyTelegramAuthPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    let auth: PendingAuth;
    try {
      auth = requirePendingAuth();
    } catch (error) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    if (!auth.needsPassword) {
      res.status(409).json({
        error: "Telegram has not requested a 2FA password for this login.",
      });
      return;
    }
    const credentials = getApiCredentials();
    if (!credentials) {
      res.status(503).json({ error: "Telegram user API credentials are not configured." });
      return;
    }

    try {
      await auth.client.signInWithPassword(credentials, {
        password: async () => parsed.data.password,
        onError: async () => false,
      });
      await storeTelegramUserSession(saveClientSession(auth.client));
      await closePendingAuth();
      res.json(
        VerifyTelegramAuthPasswordResponse.parse(
          authResult(
            "authorized",
            "Telegram account authorized. The discovery session is stored encrypted on the server.",
          ),
        ),
      );
    } catch (error) {
      const message = getErrorMessage(error);
      const status = /PASSWORD_HASH_INVALID/i.test(
        error instanceof Error ? error.message : "",
      )
        ? 400
        : 502;
      res.status(status).json({ error: message });
    }
  },
);

export default router;