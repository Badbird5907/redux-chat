import type {
  OAuthAuthorizationServerInformation,
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from "@ai-sdk/mcp";

/**
 * Collected state from an OAuth authorization initiation flow.
 * After calling `auth()` with this provider and getting 'REDIRECT',
 * read `collectedState` to persist everything needed for the callback.
 */
export interface CollectedOAuthState {
  codeVerifier: string;
  state: string;
  authorizationUrl: string;
  clientId: string;
  clientSecret?: string;
  authorizationServerUrl: string;
  tokenEndpoint: string;
}

/**
 * Pre-loaded state from a persisted OAuth flow, used during the callback
 * to exchange the authorization code for tokens.
 */
export interface PreloadedOAuthFlowState {
  codeVerifier: string;
  state: string;
  clientId: string;
  clientSecret?: string;
  authorizationServerUrl: string;
  tokenEndpoint: string;
}

/**
 * OAuthClientProvider for server-side MCP OAuth flows.
 *
 * Used in two modes:
 * 1. **Initiation** (no preloaded state): collects state in-memory during `auth()`.
 *    After auth() returns 'REDIRECT', read `collectedState` to persist.
 * 2. **Callback** (with preloaded state): provides pre-loaded state for code exchange.
 *    The `onTokensSaved` callback is called when tokens are exchanged.
 */
export class ServerMcpOAuthProvider implements OAuthClientProvider {
  private _codeVerifier: string | undefined;
  private _state: string | undefined;
  private _authorizationUrl: string | undefined;
  private _tokens: OAuthTokens | undefined;
  private _clientInfo: OAuthClientInformation | undefined;
  private _authServerInfo: OAuthAuthorizationServerInformation | undefined;
  private _callbackRedirectUrl: string;
  private _preloaded: PreloadedOAuthFlowState | undefined;
  private _onTokensSaved?: (tokens: OAuthTokens) => void | Promise<void>;

  constructor(options: {
    callbackRedirectUrl: string;
    preloadedState?: PreloadedOAuthFlowState;
    preloadedTokens?: OAuthTokens;
    preloadedClientInfo?: OAuthClientInformation;
    onTokensSaved?: (tokens: OAuthTokens) => void | Promise<void>;
  }) {
    this._callbackRedirectUrl = options.callbackRedirectUrl;
    this._preloaded = options.preloadedState;
    this._onTokensSaved = options.onTokensSaved;

    if (options.preloadedState) {
      this._codeVerifier = options.preloadedState.codeVerifier;
      this._state = options.preloadedState.state;
      this._clientInfo = {
        client_id: options.preloadedState.clientId,
        client_secret: options.preloadedState.clientSecret,
      };
      this._authServerInfo = {
        authorizationServerUrl: options.preloadedState.authorizationServerUrl,
        tokenEndpoint: options.preloadedState.tokenEndpoint,
      };
    }

    if (options.preloadedTokens) {
      this._tokens = options.preloadedTokens;
    }
    if (options.preloadedClientInfo) {
      this._clientInfo = options.preloadedClientInfo;
    }
  }

  get collectedState(): CollectedOAuthState | undefined {
    if (
      !this._codeVerifier ||
      !this._state ||
      !this._authorizationUrl ||
      !this._clientInfo ||
      !this._authServerInfo
    ) {
      return undefined;
    }
    return {
      codeVerifier: this._codeVerifier,
      state: this._state,
      authorizationUrl: this._authorizationUrl,
      clientId: this._clientInfo.client_id,
      clientSecret: this._clientInfo.client_secret,
      authorizationServerUrl: this._authServerInfo.authorizationServerUrl,
      tokenEndpoint: this._authServerInfo.tokenEndpoint,
    };
  }

  get redirectUrl(): string {
    return this._callbackRedirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this._callbackRedirectUrl],
      client_name: "Redux Chat",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async tokens(): Promise<OAuthTokens | undefined> {
    return this._tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens;
    await this._onTokensSaved?.(tokens);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this._authorizationUrl = authorizationUrl.toString();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async codeVerifier(): Promise<string> {
    if (!this._codeVerifier) {
      throw new Error("No code verifier available");
    }
    return this._codeVerifier;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return this._clientInfo;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async saveClientInformation(
    clientInformation: OAuthClientInformation,
  ): Promise<void> {
    this._clientInfo = clientInformation;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async state(): Promise<string> {
    this._state ??= crypto.randomUUID();
    return this._state;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async saveState(state: string): Promise<void> {
    this._state = state;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async storedState(): Promise<string | undefined> {
    return this._state ?? this._preloaded?.state;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async authorizationServerInformation(): Promise<
    OAuthAuthorizationServerInformation | undefined
  > {
    return this._authServerInfo;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async saveAuthorizationServerInformation(
    info: OAuthAuthorizationServerInformation,
  ): Promise<void> {
    this._authServerInfo = info;
  }
}
