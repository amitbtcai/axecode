/**
 * axecode: Axe AI Better Auth oauth-provider client — the axeai-mode sibling
 * of workos.ts. Public-client OAuth (PKCE, no secret anywhere): exchange and
 * refresh are plain form POSTs to the token endpoint, and `userinfo` supplies
 * the profile fields WorkOS returned inline. Wire shapes deliberately match
 * workos.ts so the routes and the engine parse one response form.
 */
import { AXEAI_PERSONAL_ORG } from "./auth";
import type { Env } from "./env";
import type { ExchangeResult, OrgMembership, RefreshResult } from "./workos";

/** Thrown for rejected Axe AI calls; routes map it to 401 (same as
 * WorkOsAuthFailed). */
export class AxeaiAuthFailed extends Error {}

const issuer = (env: Env): string =>
  (env.AXEAI_ISSUER ?? "https://axeai.com/api/auth").replace(/\/+$/, "");

const tokenUrl = (env: Env): string => env.AXEAI_TOKEN_URL ?? `${issuer(env)}/oauth2/token`;

const userinfoUrl = (env: Env): string =>
  env.AXEAI_USERINFO_URL ?? `${issuer(env)}/oauth2/userinfo`;

const failed = async (res: Response): Promise<never> => {
  let message = "authentication failed";
  try {
    const body = (await res.json()) as { error_description?: string; error?: string };
    message = body.error_description ?? body.error ?? message;
  } catch {
    /* non-JSON error body */
  }
  throw new AxeaiAuthFailed(message);
};

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
}

const tokenPost = async (env: Env, params: Record<string, string>): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    client_id: env.AXEAI_CLIENT_ID ?? "axecode",
    ...params
  });
  // The RFC 8707 resource indicator is what makes Better Auth mint JWT access
  // tokens at all; re-asserting it on refresh keeps `aud` stable.
  if (env.AXEAI_AUDIENCE) body.set("resource", env.AXEAI_AUDIENCE);
  const res = await fetch(tokenUrl(env), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) return failed(res);
  return (await res.json()) as TokenResponse;
};

interface WireUserInfo {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

/** `authorization_code` + PKCE verifier → tokens; the profile comes from
 * `userinfo` (the WorkOS exchange returned it inline). */
export const exchange = async (
  env: Env,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<ExchangeResult> => {
  const tokens = await tokenPost(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });
  if (!tokens.refresh_token) throw new AxeaiAuthFailed("missing refresh token");
  const res = await fetch(userinfoUrl(env), {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });
  if (!res.ok) return failed(res);
  const user = (await res.json()) as WireUserInfo;
  return {
    user: {
      id: user.sub,
      email: user.email ?? "",
      firstName: user.given_name ?? user.name ?? null,
      lastName: user.family_name ?? null
    },
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token
  };
};

/** `refresh_token` grant (rotating; the returned refresh token replaces the
 * presented one). `organizationId` is accepted and ignored — the Axe AI
 * session always scopes to the caller's personal workspace. */
export const refresh = async (env: Env, refreshToken: string): Promise<RefreshResult> => {
  const tokens = await tokenPost(env, {
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  if (!tokens.refresh_token) throw new AxeaiAuthFailed("missing refresh token");
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
};

/** Axe AI sessions have no orgs — the org surface answers the single
 * synthetic membership the engine's NeedsOrganization flow consumes. */
export const listOrgs = async (_env: Env, _userId: string): Promise<OrgMembership[]> => [
  { id: AXEAI_PERSONAL_ORG, organizationId: AXEAI_PERSONAL_ORG, name: "Personal" }
];

export const createOrg = async (_env: Env, _userId: string): Promise<{ organizationId: string }> => ({
  organizationId: AXEAI_PERSONAL_ORG
});
