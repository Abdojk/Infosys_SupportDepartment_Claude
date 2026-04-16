/* ===================================================
   timesheets.js — Timesheet tracking UI module
   Depends on: api.js, utils.js
   =================================================== */

const Timesheets = (() => {
    "use strict";

    const APPROVAL_STATUS = {
        0: "Draft",
        1: "Submitted",
        2: "Approved",
        3: "Rejected",
    };

    let currentWeekStart = getMonday(new Date());

    /**
     * Initialise the timesheets view.
     */
    async function init() {
        bindEvents();
        renderWeekHeader();
        await loadTimesheets();
    }

    /**
     * Wire up navigation and actions.
     */
    function bindEvents() {
        const prevBtn = document.getElementById("ts-prev-week");
        const nextBtn = document.getElementById("ts-next-week");
        const addBtn = document.getElementById("btn-add-time");

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                currentWeekStart.setDate(currentWeekStart.getDate() - 7);
                renderWeekHeader();
                loadTimesheets();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                currentWeekStart.setDate(currentWeekStart.getDate() + 7);
                renderWeekHeader();
                loadTimesheets();
            });
        }

        if (addBtn) {
            addBtn.addEventListener("click", openAddTimeModal);
        }
    }

    /**
     * Get the Monday of the week containing the given date.
     */
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * Update the week range display.
     */
    function renderWeekHeader() {
        const label = document.getElementById("ts-week-label");
        if (!label) return;

        const end = new Date(currentWeekStart);
        end.setDate(end.getDate() + 6);

        const opts = { month: "short", day: "numeric" };
        label.textContent = `${currentWeekStart.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}, ${end.getFullYear()}`;
    }

    /**
     * Build OData query for the current week.
     */
    function buildQuery() {
        const start = currentWeekStart.toISOString().split("T")[0];
        const end = new Date(currentWeekStart);
        end.setDate(end.getDate() + 7);
        const endStr = end.toISOString().split("T")[0];

        return [
            "$select=inf_timesheetentryid,inf_date,inf_duration,inf_description,inf_approvalstatus",
            "$expand=inf_CaseId($select=title,ticketnumber)",
            `$filter=inf_date ge ${start} and inf_date lt ${endStr}`,
            "$orderby=inf_date asc",
        ].join("&");
    }

    /**
     * Fetch and render timesheet entries for the selected week.
     */
    async function loadTimesheets() {
        const container = document.getElementById("ts-entries");
        const totalEl = document.getElementById("ts-total-hours");
        if (!container) return;

        container.innerHTML = `<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>`;

        try {
            const query = buildQuery();
            const entries = await Api.getTimesheets(query);
            renderEntries(entries, container);

            if (totalEl) {
                const totalMinutes = entries.reduce((sum, e) => sum + (e.inf_duration || 0), 0);
                totalEl.textContent = Utils.formatDuration(totalMinutes);
            }
        } catch (err) {
            container.innerHTML = `<p class="text-danger" style="padding:1rem">Failed to load timesheets: ${Utils.escapeHtml(err.message)}</p>`;
            Utils.showToast("Failed to load timesheets", "error");
        }
    }

    /**
     * Render timesheet entry rows.
     */
    function renderEntries(entries, container) {
        if (entries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state__icon">&#128339;</div>
                    <div class="empty-state__text">No time entries for this week</div>
                    <button class="btn btn--primary btn--sm" id="ts-empty-add">Log Time</button>
                </div>`;
            const emptyAdd = document.getElementById("ts-empty-add");
            if (emptyAdd) emptyAdd.addEventListener("click", openAddTimeModal);
            return;
        }

        // Group entries by date
        const grouped = {};
        entries.forEach((entry) => {
            const dateKey = entry.inf_date?.split("T")[0] || "unknown";
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(entry);
        });

        let html = "";
        for (const [date, dayEntries] of Object.entries(grouped)) {
            const dayTotal = dayEntries.reduce((s, e) => s + (e.inf_duration || 0), 0);
            html += `
                <div class="ts-day">
                    <div class="ts-day__header">
                        <span class="ts-day__date">${Utils.formatDate(date, { weekday: "long", month: "short", day: "numeric" })}</span>
                        <span class="ts-day__total">${Utils.formatDuration(dayTotal)}</span>
                    </div>
                    <div class="ts-day__entries">`;

            dayEntries.forEach((entry) => {
                const status = APPROVAL_STATUS[entry.inf_approvalstatus] || "Draft";
                const caseRef = entry.inf_CaseId
                    ? `${Utils.escapeHtml(entry.inf_CaseId.ticketnumber)} — ${Utils.escapeHtml(entry.inf_CaseId.title)}`
                    : "No linked case";

                html += `
                    <div class="ts-entry" data-id="${entry.inf_timesheetentryid}">
                        <div class="ts-entry__info">
                            <div class="ts-entry__case">${caseRef}</div>
                            <div class="ts-entry__desc text-light">${Utils.escapeHtml(entry.inf_description || "")}</div>
                        </div>
                        <div class="ts-entry__meta">
                            <span class="badge badge--${status.toLowerCase()}">${status}</span>
                            <span class="ts-entry__duration">${Utils.formatDuration(entry.inf_duration)}</span>
                            <button class="btn btn--sm btn--secondary ts-edit-btn" data-id="${entry.inf_timesheetentryid}">Edit</button>
                            <button class="btn btn--sm btn--danger ts-delete-btn" data-id="${entry.inf_timesheetentryid}">Delete</button>
                        </div>
                    </div>`;
            });

            html += `</div></div>`;
        }

        container.innerHTML = html;

        // Add additional CSS for timesheet entries
        addTimesheetStyles();

        // Bind edit/delete buttons
        container.querySelectorAll(".ts-delete-btn").forEach((btn) => {
            btn.addEventListener("click", () => deleteEntry(btn.dataset.id));
        });

        container.querySelectorAll(".ts-edit-btn").forEach((btn) => {
            btn.addEventListener("click", () => openEditTimeModal(btn.dataset.id));
        });
    }

    /**
     * Inject dynamic styles for timesheet entries (once).
     */
    function addTimesheetStyles() {
        if (document.getElementById("ts-dynamic-styles")) return;
        const style = document.createElement("style");
        style.id = "ts-dynamic-styles";
        style.textContent = `
            .ts-day { margin-bottom: var(--spacing-md); }
            .ts-day__header { display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border); font-weight: 600; }
            .ts-day__total { font-size: var(--font-size-sm); color: var(--color-primary); }
            .ts-entry { display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border); gap: var(--spacing-md); }
            .ts-entry__info { flex: 1; min-width: 0; }
            .ts-entry__case { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .ts-entry__desc { font-size: var(--font-size-sm); }
            .ts-entry__meta { display: flex; align-items: center; gap: var(--spacing-sm); flex-shrink: 0; }
            .ts-entry__duration { font-weight: 600; min-width: 3rem; text-align: right; }
        `;
        document.head.appendChild(style);
    }

    /**
     * Open the "Log Time" modal.
     */
    function openAddTimeModal() {
        const backdrop = document.getElementById("modal-backdrop");
        const modalBody = document.getElementById("modal-body");
        const modalTitle = document.getElementById("modal-title");
        if (!backdrop || !modalBody) return;

        const today = new Date().toISOString().split("T")[0];
        modalTitle.textContent = "Log Time";
        modalBody.innerHTML = `
            <form id="add-time-form" class="login-card__form">
                <div class="form-group">
                    <label for="at-date">Date *</label>
                    <input id="at-date" type="date" class="form-control" required value="${today}">
                </div>
                <div class="form-group">
                    <label for="at-duration">Duration (minutes) *</label>
                    <input id="at-duration" type="number" class="form-control" required min="1" max="1440" placeholder="e.g. 60">
                </div>
                <div class="form-group">
                    <label for="at-description">Description</label>
                    <textarea id="at-description" class="form-control" rows="3" placeholder="What did you work on?"></textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:var(--spacing-sm);margin-top:var(--spacing-sm)">
                    <button type="button" class="btn btn--secondary" id="at-cancel">Cancel</button>
                    <button type="submit" class="btn btn--primary">Save Entry</button>
                </div>
            </form>`;

        backdrop.classList.add("active");

        document.getElementById("at-cancel").addEventListener("click", closeModal);

        document.getElementById("add-time-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const date = document.getElementById("at-date").value;
            const duration = parseInt(document.getElementById("at-duration").value, 10);
            const description = document.getElementById("at-description").value.trim();

            try {
                await Api.createTimesheet({
                    inf_date: date,
                    inf_duration: duration,
                    inf_description: description,
                    inf_approvalstatus: 0,
                });
                Utils.showToast("Time entry logged", "success");
                closeModal();
                await loadTimesheets();
            } catch (err) {
                Utils.showToast(`Failed to save: ${err.message}`, "error");
            }
        });
    }

    /**
     * Open the edit modal for an existing entry.
     */
    async function openEditTimeModal(entryId) {
        const backdrop = document.getElementById("modal-backdrop");
        const modalBody = document.getElementById("modal-body");
        const modalTitle = document.getElementById("modal-title");
        if (!backdrop || !modalBody) return;

        modalTitle.textContent = "Edit Time Entry";
        modalBody.innerHTML = `<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>`;
        backdrop.classList.add("active");

        try {
            const entry = await Api.getTimesheets(
                `$filter=inf_timesheetentryid eq ${entryId}`
            );
            const e = entry[0];
            if (!e) throw new Error("Entry not found");

            const dateVal = e.inf_date?.split("T")[0] || "";
            modalBody.innerHTML = `
                <form id="edit-time-form" class="login-card__form">
                    <div class="form-group">
                        <label for="et-date">Date *</label>
                        <input id="et-date" type="date" class="form-control" required value="${dateVal}">
                    </div>
                    <div class="form-group">
                        <label for="et-duration">Duration (minutes) *</label>
                        <input id="et-duration" type="number" class="form-control" required min="1" max="1440" value="${e.inf_duration || ""}">
                    </div>
                    <div class="form-group">
                        <label for="et-description">Description</label>
                        <textarea id="et-description" class="form-control" rows="3">${Utils.escapeHtml(e.inf_description || "")}</textarea>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:var(--spacing-sm);margin-top:var(--spacing-sm)">
                        <button type="button" class="btn btn--secondary" id="et-cancel">Cancel</button>
                        <button type="submit" class="btn btn--primary">Update</button>
                    </div>
                </form>`;

            document.getElementById("et-cancel").addEventListener("click", closeModal);

            document.getElementById("edit-time-form").addEventListener("submit", async (ev) => {
                ev.preventDefault();
                try {
                    await Api.updateTimesheet(entryId, {
                        inf_date: document.getElementById("et-date").value,
                        inf_duration: parseInt(document.getElementById("et-duration").value, 10),
                        inf_description: document.getElementById("et-description").value.trim(),
                    });
                    Utils.showToast("Entry updated", "success");
                    closeModal();
                    await loadTimesheets();
                } catch (err) {
                    Utils.showToast(`Update failed: ${err.message}`, "error");
                }
            });
        } catch (err) {
            modalBody.innerHTML = `<p class="text-danger">Failed to load entry: ${Utils.escapeHtml(err.message)}</p>`;
        }
    }

    /**
     * Delete a timesheet entry after confirmation.
     */
    async function deleteEntry(entryId) {
        if (!confirm("Delete this time entry?")) return;
        try {
            await Api.deleteTimesheet(entryId);
            Utils.showToast("Entry deleted", "success");
            await loadTimesheets();
        } catch (err) {
            Utils.showToast(`Delete failed: ${err.message}`, "error");
        }
    }

    /**
     * Close any open modal.
     */
    function closeModal() {
        const backdrop = document.getElementById("modal-backdrop");
        if (backdrop) backdrop.classList.remove("active");
    }

    /**
     * Return weekly summary stats.
     */
    async function getWeeklyStats() {
        try {
            const query = buildQuery();
            const entries = await Api.getTimesheets(query);
            const totalMinutes = entries.reduce((s, e) => s + (e.inf_duration || 0), 0);
            return {
                entries: entries.length,
                totalMinutes,
                totalFormatted: Utils.formatDuration(totalMinutes),
            };
        } catch {
            return { entries: 0, totalMinutes: 0, totalFormatted: "0m" };
        }
    }

    return {
        init,
        loadTimesheets,
        getWeeklyStats,
    };
})();
