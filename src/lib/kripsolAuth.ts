const API_KEY = "AIzaSyBLaxiyZ2nS1KgRBqWe-NY4EG7OzG5fKpE";
const IDENTITY_TOOLKIT_BASE = "https://identitytoolkit.googleapis.com/v1/accounts";
const SECURETOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const API_REFERRER = "https://hayward-europe.web.app/";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface FirebaseSignInResponse {
    idToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    localId?: string;
    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

interface FirebaseRefreshResponse {
    id_token?: string;
    refresh_token?: string;
    expires_in?: string;
    user_id?: string;
    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

export interface KripsolTokens {
    idToken: string;
    refreshToken: string;
    expiresIn: number;
    userId: string;
}

export class KripsolAuthenticationError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "KripsolAuthenticationError";
    }
}

export class KripsolAuth {
    private tokens: KripsolTokens | null = null;
    private expiresAt = 0;

    public constructor(
        private readonly email: string,
        private readonly password: string,
    ) {}

    public async authenticate(): Promise<KripsolTokens> {
        const response = await fetch(
            `${IDENTITY_TOOLKIT_BASE}:signInWithPassword?key=${API_KEY}`,
            {
                method: "POST",
                headers: this.buildHeaders("application/json; charset=UTF-8"),
                body: JSON.stringify({
                    email: this.email,
                    password: this.password,
                    returnSecureToken: true,
                }),
            },
        );

        const payload = (await this.readJson(response)) as FirebaseSignInResponse;

        if (!response.ok) {
            throw new KripsolAuthenticationError(
                this.formatError(payload.error, response.status),
            );
        }

        const expiresIn = Number(payload.expiresIn);

        if (
            !payload.idToken ||
            !payload.refreshToken ||
            !payload.localId ||
            !Number.isFinite(expiresIn)
        ) {
            throw new KripsolAuthenticationError(
                "Unexpected authentication response from the Kripsol cloud.",
            );
        }

        this.tokens = {
            idToken: payload.idToken,
            refreshToken: payload.refreshToken,
            expiresIn,
            userId: payload.localId,
        };

        this.expiresAt = Date.now() + expiresIn * 1000;

        return this.tokens;
    }

    public async getValidTokens(): Promise<KripsolTokens> {
        if (!this.tokens) {
            return this.authenticate();
        }

        if (Date.now() >= this.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
            await this.refresh();
        }

        return this.tokens;
    }

    public get userId(): string | null {
        return this.tokens?.userId ?? null;
    }

    private async refresh(): Promise<void> {
        if (!this.tokens) {
            await this.authenticate();
            return;
        }

        const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: this.tokens.refreshToken,
        });

        const response = await fetch(`${SECURETOKEN_URL}?key=${API_KEY}`, {
            method: "POST",
            headers: this.buildHeaders(
                "application/x-www-form-urlencoded; charset=UTF-8",
            ),
            body,
        });

        const payload = (await this.readJson(response)) as FirebaseRefreshResponse;

        if (!response.ok) {
            throw new KripsolAuthenticationError(
                this.formatError(payload.error, response.status),
            );
        }

        const expiresIn = Number(payload.expires_in);

        if (
            !payload.id_token ||
            !payload.refresh_token ||
            !Number.isFinite(expiresIn)
        ) {
            throw new KripsolAuthenticationError(
                "Unexpected token refresh response from the Kripsol cloud.",
            );
        }

        this.tokens = {
            idToken: payload.id_token,
            refreshToken: payload.refresh_token,
            expiresIn,
            userId: payload.user_id ?? this.tokens.userId,
        };

        this.expiresAt = Date.now() + expiresIn * 1000;
    }

    private buildHeaders(contentType: string): Record<string, string> {
        return {
            "Content-Type": contentType,
            Referer: API_REFERRER,
            Origin: "https://hayward-europe.web.app",
        };
    }

    private async readJson(response: Response): Promise<unknown> {
        const text = await response.text();

        if (!text) {
            return {};
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new KripsolAuthenticationError(
                `Kripsol cloud returned invalid JSON (HTTP ${response.status}).`,
            );
        }
    }

    private formatError(
        error: FirebaseSignInResponse["error"],
        httpStatus: number,
    ): string {
        const code = error?.code ?? httpStatus;
        const status = error?.status ? `, status=${error.status}` : "";
        const message = error?.message ?? "Unknown error";

        return `Authentication failed (code=${code}${status}, message=${message}).`;
    }
}
