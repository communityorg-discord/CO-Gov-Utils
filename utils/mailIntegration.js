/**
 * Mail Integration
 * Connects to Mail-in-a-Box API for account management
 */

// Mail-in-a-Box API configuration
const MAIL_CONFIG = {
    apiUrl: 'https://mail.usgrp.xyz',
    adminEmail: 'admin@usgrp.xyz',
    adminPassword: 'password'
};

/**
 * Create a mail account via Mail-in-a-Box API
 */
async function createMailAccount(email, password) {
    try {
        const auth = Buffer.from(`${MAIL_CONFIG.adminEmail}:${MAIL_CONFIG.adminPassword}`).toString('base64');

        const response = await fetch(`${MAIL_CONFIG.apiUrl}/admin/mail/users/add`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
        });

        const text = await response.text();

        if (response.ok || text.includes('already exists')) {
            return { success: true, message: text };
        }

        return { success: false, error: text };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a mail account
 */
async function deleteMailAccount(email) {
    try {
        const auth = Buffer.from(`${MAIL_CONFIG.adminEmail}:${MAIL_CONFIG.adminPassword}`).toString('base64');

        const response = await fetch(`${MAIL_CONFIG.apiUrl}/admin/mail/users/remove`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `email=${encodeURIComponent(email)}`
        });

        const text = await response.text();
        return { success: response.ok, message: text };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get all mail accounts
 */
async function getMailAccounts() {
    try {
        const auth = Buffer.from(`${MAIL_CONFIG.adminEmail}:${MAIL_CONFIG.adminPassword}`).toString('base64');

        const response = await fetch(`${MAIL_CONFIG.apiUrl}/admin/mail/users?format=json`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });

        if (response.ok) {
            return { success: true, accounts: await response.json() };
        }

        return { success: false, error: await response.text() };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Set mail account password
 */
async function setMailPassword(email, password) {
    try {
        const auth = Buffer.from(`${MAIL_CONFIG.adminEmail}:${MAIL_CONFIG.adminPassword}`).toString('base64');

        const response = await fetch(`${MAIL_CONFIG.apiUrl}/admin/mail/users/password`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
        });

        const text = await response.text();
        return { success: response.ok, message: text };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    MAIL_CONFIG,
    createMailAccount,
    deleteMailAccount,
    getMailAccounts,
    setMailPassword
};
