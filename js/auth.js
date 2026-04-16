/* ===================================================
   auth.js — MSAL-based Azure AD authentication for D365 CE
   Requires: MSAL Browser 2.x loaded via CDN
   =================================================== */

const Auth = (() => {
    "use strict";

    // ---- Configuration (replace placeholders before deployment) ----
    const CONFIG = {
        clientId: "40fd227f-e117-4d6a-9a3a-9e187e65bd19",
        authority: "https://login.microsoftonline.com/9d18d419-82b7-4a62-b888-e2747dad2d85",
        redirectUri: window.location.origin + "/index.html",
        postLogoutRedirectUri: window.location.origin + "/login.html",
        d365BaseUrl: "https://infosysofficial.crm4.dynamics.com",
    };

    const SCOPES = [`${CONFIG.d365BaseUrl}/.default`];

    let msalInstance = null;
    let activeAccount = null;

    /**
     * Initialise the MSAL PublicClientApplication.
     */
    function init() {
        const msalConfig = {
            auth: {
                clientId: CONFIG.clientId,
                authority: CONFIG.authority,
                redirectUri: CONFIG.redirectUri,
                postLogoutRedirectUri: CONFIG.postLogoutRedirectUri,
            },
            cache: {
                cacheLocation: "sessionStorage",
                storeAuthStateInCookie: false,
            },
        };

        msalInstance = new msal.PublicClientApplication(msalConfig);
        return handleRedirect();
    }

    /**
     * Process any redirect response after login.
     */
    async function handleRedirect() {
        try {
            const response = await msalInstance.handleRedirectPromise();
            if (response) {
                activeAccount = response.account;
                msalInstance.setActiveAccount(activeAccount);
            } else {
                const accounts = msalInstance.getAllAccounts();
                if (accounts.length > 0) {
                    activeAccount = accounts[0];
                    msalInstance.setActiveAccount(activeAccount);
                }
            }
        } catch (err) {
            console.error("Auth redirect error:", err);
        }
        return activeAccount;
    }

    /**
     * Trigger an interactive login (redirect flow).
     */
    function login() {
        const request = { scopes: SCOPES };
        return msalInstance.loginRedirect(request);
    }

    /**
     * Log the user out.
     */
    function logout() {
        msalInstance.logoutRedirect({
            postLogoutRedirectUri: CONFIG.postLogoutRedirectUri,
        });
    }

    /**
     * Silently acquire an access token for D365 CE.
     * Falls back to popup if silent acquisition fails.
     * @returns {Promise<string>} access token
     */
    async function getToken() {
        if (!activeAccount) throw new Error("No active account. Please log in.");

        const request = {
            scopes: SCOPES,
            account: activeAccount,
        };

        try {
            const response = await msalInstance.acquireTokenSilent(request);
            return response.accessToken;
        } catch (err) {
            if (err instanceof msal.InteractionRequiredAuthError) {
                const response = await msalInstance.acquireTokenPopup(request);
                return response.accessToken;
            }
            throw err;
        }
    }

    /**
     * @returns {boolean} whether a user is currently signed in
     */
    function isAuthenticated() {
        return activeAccount !== null;
    }

    /**
     * Return the signed-in user's profile info.
     */
    function getUser() {
        if (!activeAccount) return null;
        return {
            name: activeAccount.name,
            email: activeAccount.username,
            tenantId: activeAccount.tenantId,
            initials: Utils.getInitials(activeAccount.name),
        };
    }

    /**
     * @returns {string} the D365 base URL for API calls
     */
    function getD365BaseUrl() {
        return CONFIG.d365BaseUrl;
    }

    /**
     * Guard: redirect to login page if not authenticated.
     */
    function requireAuth() {
        if (!isAuthenticated()) {
            window.location.href = "login.html";
        }
    }

    return {
        init,
        login,
        logout,
        getToken,
        isAuthenticated,
        getUser,
        getD365BaseUrl,
        requireAuth,
    };
})();
