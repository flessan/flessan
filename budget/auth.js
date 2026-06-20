// auth.js - Neon Auth Client
const NEON_AUTH_BASE_URL = 'https://ep-morning-heart-aoh4onl2.neonauth.c-2.ap-southeast-1.aws.neon.tech/neondb/auth/callback/github';

class NeonAuthClient {
    constructor() {
        this.baseUrl = NEON_AUTH_BASE_URL;
    }

    // Sign in with GitHub - FORMAT YANG BENAR
    async signInWithGitHub(callbackURL = window.location.origin) {
        // Format yang benar: /signin/github (bukan /signin/social?provider=github)
        const authUrl = `${this.baseUrl}/signin/github?callbackURL=${encodeURIComponent(callbackURL)}`;
        window.location.href = authUrl;
    }

    // Get current session
    async getSession() {
        try {
            const response = await fetch(`${this.baseUrl}/get-session`, {
                credentials: 'include', // Penting: kirim cookies
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                return { data: null, error: 'Not authenticated' };
            }

            const data = await response.json();
            return { data, error: null };
        } catch (error) {
            console.error('Session error:', error);
            return { data: null, error: error.message };
        }
    }

    // Sign out
    async signOut() {
        try {
            await fetch(`${this.baseUrl}/sign-out`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch (error) {
            console.error('Sign out error:', error);
        }
    }
}

// Export global auth client
const authClient = new NeonAuthClient();
window.authClient = authClient; // Biar bisa diakses di HTML