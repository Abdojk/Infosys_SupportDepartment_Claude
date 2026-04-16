/* ===================================================
   utils.js — Utility / helper functions
   =================================================== */

const Utils = (() => {
    "use strict";

    /**
     * Format a date string to a locale-friendly display.
     * @param {string|Date} dateValue
     * @param {object} options  Intl.DateTimeFormat options
     * @returns {string}
     */
    function formatDate(dateValue, options = {}) {
        if (!dateValue) return "—";
        const defaults = { year: "numeric", month: "short", day: "numeric" };
        return new Date(dateValue).toLocaleDateString("en-US", { ...defaults, ...options });
    }

    /**
     * Format a date as a relative time string (e.g. "3 hours ago").
     */
    function timeAgo(dateValue) {
        if (!dateValue) return "—";
        const seconds = Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000);
        const intervals = [
            { label: "year",   secs: 31536000 },
            { label: "month",  secs: 2592000 },
            { label: "week",   secs: 604800 },
            { label: "day",    secs: 86400 },
            { label: "hour",   secs: 3600 },
            { label: "minute", secs: 60 },
        ];
        for (const { label, secs } of intervals) {
            const count = Math.floor(seconds / secs);
            if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
        }
        return "just now";
    }

    /**
     * Format minutes into "Xh Ym" display.
     */
    function formatDuration(minutes) {
        if (!minutes && minutes !== 0) return "—";
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

    /**
     * Debounce a function.
     */
    function debounce(fn, delay = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    /**
     * Escape HTML entities to prevent XSS when inserting user-supplied text.
     */
    function escapeHtml(str) {
        if (typeof str !== "string") return str;
        const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return str.replace(/[&<>"']/g, (c) => map[c]);
    }

    /**
     * Build a CSS class for a case-status badge.
     */
    function statusBadgeClass(status) {
        const map = {
            active: "badge--active",
            open: "badge--open",
            resolved: "badge--resolved",
            closed: "badge--closed",
            escalated: "badge--escalated",
            pending: "badge--pending",
        };
        return map[(status || "").toLowerCase()] || "";
    }

    /**
     * Build a CSS class for a priority badge.
     */
    function priorityBadgeClass(priority) {
        const map = { high: "badge--high", medium: "badge--medium", low: "badge--low" };
        return map[(priority || "").toLowerCase()] || "";
    }

    /**
     * Show a toast notification.
     * @param {string} message
     * @param {"info"|"success"|"warning"|"error"} type
     * @param {number} duration  ms before auto-dismiss
     */
    function showToast(message, type = "info", duration = 4000) {
        let container = document.querySelector(".toast-container");
        if (!container) {
            container = document.createElement("div");
            container.className = "toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <span class="toast__message">${escapeHtml(message)}</span>
            <button class="toast__close" aria-label="Dismiss">&times;</button>
        `;

        toast.querySelector(".toast__close").addEventListener("click", () => toast.remove());
        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => toast.remove(), duration);
        }
    }

    /**
     * Simple query-string builder from an object.
     */
    function buildQueryString(params) {
        const entries = Object.entries(params).filter(
            ([, v]) => v !== undefined && v !== null && v !== ""
        );
        if (entries.length === 0) return "";
        return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    }

    /**
     * Get initials from a full name (e.g. "John Doe" → "JD").
     */
    function getInitials(name) {
        if (!name) return "?";
        return name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
    }

    /**
     * Clamp a number between min and max.
     */
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    /**
     * Generate a unique DOM id.
     */
    let _idCounter = 0;
    function uniqueId(prefix = "id") {
        return `${prefix}_${++_idCounter}`;
    }

    return {
        formatDate,
        timeAgo,
        formatDuration,
        debounce,
        escapeHtml,
        statusBadgeClass,
        priorityBadgeClass,
        showToast,
        buildQueryString,
        getInitials,
        clamp,
        uniqueId,
    };
})();
