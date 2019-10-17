/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICacheStorage, AuthError } from "msal-common";
import { CACHE_PREFIX, PersistentCacheKeys, TemporaryCacheKeys, RESOURCE_DELIM } from "../utils/Constants";
import { CacheLocation } from "../app/Configuration";
import { ClientConfigurationError } from "../error/ClientConfigurationError";

/**
 * @hidden
 */
export class BrowserStorage implements ICacheStorage {

    protected cacheLocation: CacheLocation;
    private windowStorage: Storage;

    private clientId: string;
    private rollbackEnabled: boolean;

    constructor(cacheLocation: CacheLocation, clientId: string, rollbackEnabled: boolean) {
        if(!window) {
            throw AuthError.createNoWindowObjectError("Browser storage class could not find window object");
        }

        const storageSupported = typeof window[cacheLocation] !== "undefined" && window[cacheLocation] != null;
        if (!storageSupported) {
            throw ClientConfigurationError.createStorageNotSupportedError(cacheLocation);
        }
        this.cacheLocation = cacheLocation;
        this.windowStorage = window[this.cacheLocation];

        this.clientId = clientId;
        this.rollbackEnabled = rollbackEnabled;
    }

    /**
     * Prepend msal.<client-id> to each key; Skip for any JSON object as Key (defined schemas do not need the key appended: AccessToken Keys or the upcoming schema)
     * @param key
     * @param addInstanceId
     */
    private generateCacheKey(key: string, addInstanceId: boolean): string {
        try {
            // Defined schemas do not need the key appended
            JSON.parse(key);
            return key;
        } catch (e) {
            if (key.startsWith(`${CACHE_PREFIX}`) || key.startsWith(PersistentCacheKeys.ADAL_ID_TOKEN)) {
                return key;
            }
            return addInstanceId ? `${CACHE_PREFIX}.${this.clientId}.${key}` : `${CACHE_PREFIX}.${key}`;
        }
    }

    /**
     * Create acquireTokenAccountKey to cache account object
     * @param accountId
     * @param state
     */
    public static generateAcquireTokenAccountKey(accountId: any, state: string): string {
        return `${TemporaryCacheKeys.ACQUIRE_TOKEN_ACCOUNT}${RESOURCE_DELIM}${accountId}${RESOURCE_DELIM}${state}`;
    }

    /**
     * Create authorityKey to cache authority
     * @param state
     */
    public static generateAuthorityKey(state: string): string {
        return `${TemporaryCacheKeys.AUTHORITY}${RESOURCE_DELIM}${state}`;
    }

    setItem(key: string, value: string, enableCookieStorage?: boolean): void {
        this.windowStorage.setItem(this.generateCacheKey(key, true), value);
        if (this.rollbackEnabled) {
            this.windowStorage.setItem(this.generateCacheKey(key, false), value);
        }
        if (enableCookieStorage) {
            this.setItemCookie(key, value);
        }
        return;
    }

    getItem(key: string, enableCookieStorage?: boolean): string {
        const itemCookie = this.getItemCookie(key);
        if (enableCookieStorage && itemCookie) {
            return itemCookie;
        }
        return this.windowStorage.getItem(this.generateCacheKey(key, true));
    }

    removeItem(key: string): void {
        this.windowStorage.removeItem(this.generateCacheKey(key, true));
        if (this.rollbackEnabled) {
            this.windowStorage.removeItem(this.generateCacheKey(key, false));
        }
    }

    clear(): void {
        this.resetCacheItems();
    }

    containsKey(key: string): boolean {
        return this.windowStorage.hasOwnProperty(key);
    }

    getKeys(): string[] {
        return Object.keys(this.windowStorage);
    }

    /**
     * Reset the cache items relating to the current state, or all msal items.
     */
    resetCacheItems(state?: string): void {
        let key: string;
        for (key in this.windowStorage) {
            // Check if key contains msal prefix; For now, we are clearing all cache items created by MSAL.js
            if (this.windowStorage.hasOwnProperty(key) && (key.indexOf(CACHE_PREFIX) !== -1)) {
                this.removeItem(key);
                // TODO: Clear cache based on client id (clarify use cases where this is needed)
            }
        }
    }

    /**
     * add value to cookies
     * @param cName
     * @param cValue
     * @param expires
     */
    setItemCookie(cName: string, cValue: string, expires?: number): void {
        let cookieStr = cName + "=" + cValue + ";";
        if (expires) {
            const expireTime = this.getCookieExpirationTime(expires);
            cookieStr += "expires=" + expireTime + ";";
        }

        document.cookie = cookieStr;
    }

    /**
     * get one item by key from cookies
     * @param cName
     */
    getItemCookie(cName: string): string {
        const name = cName + "=";
        const ca = document.cookie.split(";");
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === " ") {
                c = c.substring(1);
            }
            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    }

    /**
     * Clear an item in the cookies by key
     * @param cName
     */
    clearItemCookie(cName: string) {
        this.setItemCookie(cName, "", -1);
    }

    /**
     * Get cookie expiration time
     * @param cookieLifeDays
     */
    getCookieExpirationTime(cookieLifeDays: number): string {
        const today = new Date();
        const expr = new Date(today.getTime() + cookieLifeDays * 24 * 60 * 60 * 1000);
        return expr.toUTCString();
    }
}
